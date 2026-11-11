import { stat } from "node:fs/promises"

import {
  DEFAULT_PLAYBACK_PREFERENCES,
  PlaybackPreferences,
  type DownloadResolution,
} from "@matinee/contracts"
import { title, type MediaItemRow } from "@matinee/db"
import { eq } from "drizzle-orm"

import { itemFor, type Seer } from "../access/visible"
import { db } from "../db"
import { buildDownload, DownloadSpecError } from "../media/download-encode"
import { resolveDownload } from "../media/download-resolve"
import { removeDownload, startDownload } from "../media/downloads"
import { listAudio } from "../media/playback"
import { currentProbe } from "../media/probe"
import { listSubtitles } from "../media/subtitles"
import { rememberedTracks } from "../media/track-picks"
import { encodableAudioCodecs } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import { encodableVideoCodecs } from "../transcode/pipeline"
import { authed, badRequest, notFound } from "./base"

async function itemRow(viewer: Seer, id: string): Promise<MediaItemRow> {
  const row = await itemFor(viewer, id)
  if (!row) throw notFound("This title isn't in any library.")
  return row
}

/** A spec the file can't take becomes a message the user can act on. */
async function asBadRequest<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (cause) {
    if (cause instanceof DownloadSpecError) throw badRequest(cause.message)
    throw cause
  }
}

export const downloads = {
  resolve: authed.downloads.resolve.handler(async ({ context, input }) => {
    const transcoding = await currentTranscoding()
    const results: DownloadResolution[] = []
    // Bound memory and filesystem pressure, even for a whole season.
    for (const id of input.ids) {
      try {
        const row = await itemFor(context.user, id)
        if (!row)
          throw new DownloadSpecError("This title isn't in any library.")
        const info = await stat(row.path).catch(() => null)
        const probe = info?.isFile() ? await currentProbe(row, info) : null
        if (!probe)
          throw new DownloadSpecError(
            "This file can't be read. Try again once the server has scanned it.",
          )
        const audio = await listAudio(row)
        const subtitles = await listSubtitles(row)
        const picks = await rememberedTracks(context.user, row)
        // ACCESS: The parent title is keyed by the visible file above.
        const [parent] = row.titleId
          ? await db.select().from(title).where(eq(title.id, row.titleId))
          : []
        const resolved = resolveDownload(input.device, input.wishes, {
          probe,
          audio,
          subtitles: subtitles.tracks,
          picks,
          container: row.container,
          preferences:
            PlaybackPreferences.safeParse(context.user.playbackPreferences)
              .data ?? DEFAULT_PLAYBACK_PREFERENCES,
          originalLanguage: parent?.originalLanguage ?? null,
          resume: 0,
          audioCodecs: encodableAudioCodecs(transcoding.capabilities),
          videoCodecs: encodableVideoCodecs(
            transcoding.settings,
            transcoding.capabilities,
          ),
        })
        const { plan } = await buildDownload(row, resolved.spec)
        results.push({ status: "ready", id, ...resolved, plan })
      } catch (cause) {
        if (!(cause instanceof DownloadSpecError)) throw cause
        results.push({ status: "unavailable", id, message: cause.message })
      }
    }
    return results
  }),

  plan: authed.downloads.plan.handler(async ({ context, input }) => {
    const row = await itemRow(context.user, input.id)
    return asBadRequest(async () => (await buildDownload(row, input.spec)).plan)
  }),

  start: authed.downloads.start.handler(async ({ context, input }) => {
    const row = await itemRow(context.user, input.id)
    return asBadRequest(() => startDownload(row, input.spec, context.user.id))
  }),

  remove: authed.downloads.remove.handler(async ({ context, input }) => {
    // Gone already is as good as removed.
    await removeDownload(input.downloadId, context.user.id)
  }),
}
