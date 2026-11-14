import { stat } from "node:fs/promises"

import {
  mediaPlaybackPath,
  DEFAULT_PLAYBACK_PREFERENCES,
  PLAYBACK_UNPLAYABLE,
  PLAYBACK_RESTRICTED,
  PLAYBACK_BUSY,
  PlaybackPreferences,
} from "@matinee/contracts"
import { mediaItem, title, watchProgress } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"

import { itemFor } from "../access/visible"
import { db } from "../db"
import { episodeOrder, publicItems } from "../media/items"
import { keyframesNear, listAudio, mayStreamOriginal } from "../media/playback"
import { decidePlayback, snapPlayback } from "../media/playback-start"
import { currentProbe } from "../media/probe"
import { listSubtitles } from "../media/subtitles"
import { rememberedTracks } from "../media/track-picks"
import { otherLiveSessions } from "../stats/sessions"
import { encodableAudioCodecs } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import { encodableVideoCodecs } from "../transcode/pipeline"
import { authed, badRequest, notFound } from "./base"

/** Nothing the device plays is left to try. */
function unplayable(): ORPCError<typeof PLAYBACK_UNPLAYABLE, unknown> {
  return new ORPCError(PLAYBACK_UNPLAYABLE, {
    status: 422,
    message: "This device can't play this file.",
  })
}

export const seekPlayback = authed.playback.seek.handler(
  async ({ context, input }) => {
    const item = await itemFor(context.user, input.itemId)
    if (!item) throw notFound("This title isn't in any library.")
    if (!(await mayStreamOriginal(context.user.access, item)))
      throw new ORPCError(PLAYBACK_RESTRICTED, {
        status: 403,
        message:
          "This file is over the bit rate your account may stream. Pick a lower quality to watch it.",
      })
    // Only video starts on a keyframe. A file without any starts anywhere,
    // as `start` has it.
    const keyframes =
      item.probe && !item.probe.video
        ? { before: input.position, after: null }
        : await keyframesNear(item, input.position)
    if (!keyframes)
      throw badRequest("Can't find a point to start this file from.")
    const offset =
      input.snap === "nearest" &&
      keyframes.after !== null &&
      keyframes.after - input.position < input.position - keyframes.before
        ? keyframes.after
        : keyframes.before
    return {
      offset,
      url: mediaPlaybackPath(item.id, {
        audio: input.audio,
        start: offset,
        quality: "original",
        audioCodecs: input.audioCodecs,
        session: input.sessionId,
      }),
    }
  },
)

export const startPlayback = authed.playback.start.handler(
  async ({ context, input }) => {
    const item = await itemFor(context.user, input.itemId)
    if (!item) throw notFound("This title isn't in any library.")
    const limit = context.user.access.maxStreams
    if (limit !== null) {
      const playing = await otherLiveSessions(context.user.id, input.sessionId)
      if (playing >= limit)
        throw new ORPCError(PLAYBACK_BUSY, {
          status: 429,
          message: `Your account is playing on ${playing} ${playing === 1 ? "device" : "devices"}, the most it may. Stop one to watch here.`,
        })
    }
    const info = await stat(item.path).catch(() => null)
    const probe = info?.isFile() ? await currentProbe(item, info) : null
    if (!probe)
      throw badRequest(
        "This file can't be read. Try again once the server has scanned it.",
      )
    // ACCESS: The parent title is keyed by the visible item above.
    const [audio, subtitles, picks, [row], [progress], transcoding] =
      await Promise.all([
        listAudio(item),
        listSubtitles(item),
        rememberedTracks(context.user, item),
        item.titleId
          ? db.select().from(title).where(eq(title.id, item.titleId))
          : [],
        db
          .select()
          .from(watchProgress)
          .where(
            and(
              eq(watchProgress.userId, context.user.id),
              eq(watchProgress.mediaItemId, item.id),
            ),
          ),
        currentTranscoding(),
      ])
    let plan = decidePlayback(input, {
      probe,
      sizeBytes: info?.size ?? item.sizeBytes,
      durationSeconds: item.durationSeconds,
      access: context.user.access,
      container: item.container,
      audio,
      subtitles: subtitles.tracks,
      picks,
      preferences:
        PlaybackPreferences.safeParse(context.user.playbackPreferences).data ??
        DEFAULT_PLAYBACK_PREFERENCES,
      originalLanguage: row?.originalLanguage ?? null,
      resume: progress && !progress.completed ? progress.positionSeconds : 0,
      audioCodecs: encodableAudioCodecs(transcoding.capabilities),
      videoCodecs: encodableVideoCodecs(
        transcoding.settings,
        transcoding.capabilities,
      ),
    })
    if (!plan) throw unplayable()
    if ("restricted" in plan)
      throw new ORPCError(PLAYBACK_RESTRICTED, {
        status: 403,
        message: {
          "bitrate-transcode":
            "This file is over the bit rate your account may stream, and the server may not convert video for your account. Ask whoever runs the server.",
          "bitrate-failed":
            "This file is over the bit rate your account may stream, and converting its video failed. Try again or ask whoever runs the server.",
          bitrate:
            "This file is over the bit rate your account may stream, and the server can't make a version this device plays under that limit. Try another device or ask whoever runs the server.",
          transcode:
            "This device needs the video converted, but the server may not convert video for your account. Try another device or ask whoever runs the server.",
        }[plan.restricted],
      })
    if (plan.method === "remux" && probe.video && plan.position > 0) {
      const keyframes = await keyframesNear(item, plan.position)
      if (!keyframes)
        throw badRequest("Can't find a point to start this file from.")
      plan = snapPlayback(plan, input, keyframes)
    }
    if (row?.kind === "show") {
      // ACCESS: Files share the visible item's title and library.
      const files = await db
        .select()
        .from(mediaItem)
        .where(eq(mediaItem.titleId, row.id))
        .orderBy(...episodeOrder)
      // A hidden special doesn't come next, though one opened plays.
      const next = files
        .slice(files.findIndex((file) => file.id === item.id) + 1)
        .find((file) => context.user.showSpecials || file.seasonNumber !== 0)
      if (next)
        plan.next = (await publicItems([next], context.user.id))[0] ?? null
    }
    const [publicItem] = await publicItems(
      [{ ...item, probe }],
      context.user.id,
    )
    if (!publicItem) throw notFound("This title isn't in any library.")
    return { ...plan, item: publicItem }
  },
)
