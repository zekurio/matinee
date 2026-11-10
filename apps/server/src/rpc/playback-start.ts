import { stat } from "node:fs/promises"

import {
  mediaPlaybackPath,
  DEFAULT_PLAYBACK_PREFERENCES,
  PLAYBACK_UNPLAYABLE,
  PlaybackPreferences,
} from "@matinee/contracts"
import { mediaItem, title, watchProgress } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import { episodeOrder, publicItems } from "../media/items"
import { keyframesNear, listAudio } from "../media/playback"
import { decidePlayback, snapPlayback } from "../media/playback-start"
import { currentProbe } from "../media/probe"
import { listSubtitles } from "../media/subtitles"
import { rememberedTracks } from "../media/track-picks"
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

export const seekPlayback = authed.playback.seek.handler(async ({ input }) => {
  const [item] = await db
    .select()
    .from(mediaItem)
    .where(eq(mediaItem.id, input.itemId))
  if (!item) throw notFound("This title isn't in any library.")
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
})

export const startPlayback = authed.playback.start.handler(
  async ({ context, input }) => {
    const [item] = await db
      .select()
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!item) throw notFound("This title isn't in any library.")
    const info = await stat(item.path).catch(() => null)
    const probe = info?.isFile() ? await currentProbe(item, info) : null
    if (!probe)
      throw badRequest(
        "This file can't be read. Try again once the server has scanned it.",
      )
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
    if (plan.method === "remux" && probe.video && plan.position > 0) {
      const keyframes = await keyframesNear(item, plan.position)
      if (!keyframes)
        throw badRequest("Can't find a point to start this file from.")
      plan = snapPlayback(plan, input, keyframes)
    }
    if (row?.kind === "show") {
      const files = await db
        .select()
        .from(mediaItem)
        .where(eq(mediaItem.titleId, row.id))
        .orderBy(...episodeOrder)
      const next = files[files.findIndex((file) => file.id === item.id) + 1]
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
