import {
  DOWNLOAD_VIDEO_PRESETS,
  PLAYBACK_QUALITIES,
  SKIP_STEPS,
  type PlaybackOptions,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { mediaItem, subtitleFile } from "@matinee/db"
import { type SQL, sql } from "drizzle-orm"

import { type Seer, visibleItems } from "../access/visible"
import { db } from "../db"
import { encodableAudioCodecs } from "../transcode/audio"
import { currentTranscoding } from "../transcode/capabilities"
import { encodableVideoCodecs } from "../transcode/pipeline"
import { languageTag } from "./language"

/*
 * What a player's playback settings can offer: the codecs this server can
 * encode to with its settings, and the languages the libraries have, so
 * nobody picks a codec that never plays or a language no file is in.
 */

const Counts = t.array(
  t.object({ code: t.string(), files: t.coerce.number().int() }),
)

/** Files per language code of the probe's `audio` or `subtitles` streams. */
function streamLanguages(viewer: Seer, kind: "audio" | "subtitles"): SQL {
  const streams = sql`(${mediaItem.probe} -> ${kind})`
  const visible = visibleItems(viewer)
  return sql`
    select stream ->> 'language' as code, count(distinct ${mediaItem.id}) as files
    from ${mediaItem},
      jsonb_array_elements(case when jsonb_typeof(${streams}) = 'array' then ${streams} else '[]'::jsonb end) as stream
    where stream ->> 'language' is not null
      ${visible ? sql`and ${visible}` : sql.empty()}
    group by 1`
}

/** Files per language of the subtitle files beside them. */
function sidecarLanguages(viewer: Seer): SQL {
  const visible = visibleItems(viewer)
  return sql`
  select ${subtitleFile.language} as code, count(distinct ${subtitleFile.mediaItemId}) as files
  from ${subtitleFile}
  inner join ${mediaItem} on ${mediaItem.id} = ${subtitleFile.mediaItemId}
  where ${subtitleFile.language} is not null
    ${visible ? sql`and ${visible}` : sql.empty()}
  group by 1`
}

/**
 * BCP 47 tags, the most files first. Codes from different sources that
 * name one language, like `eng` and `en`, count together.
 */
function rankLanguages(...sources: t.infer<typeof Counts>[]): string[] {
  const files = new Map<string, number>()
  for (const rows of sources) {
    for (const row of rows) {
      const tag = languageTag(row.code)
      if (tag) files.set(tag, (files.get(tag) ?? 0) + row.files)
    }
  }
  return [...files]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([tag]) => tag)
}

export async function playbackOptions(viewer: Seer): Promise<PlaybackOptions> {
  const [{ settings, capabilities }, audio, embedded, sidecar] =
    await Promise.all([
      currentTranscoding(),
      db.execute(streamLanguages(viewer, "audio")),
      db.execute(streamLanguages(viewer, "subtitles")),
      db.execute(sidecarLanguages(viewer)),
    ])
  return {
    qualities: [...PLAYBACK_QUALITIES],
    maxBitrate: null,
    downloads: true,
    downloadVideoPresets: [...DOWNLOAD_VIDEO_PRESETS],
    skipSteps: [...SKIP_STEPS],
    videoCodecs: encodableVideoCodecs(settings, capabilities),
    audioCodecs: encodableAudioCodecs(capabilities),
    audioLanguages: rankLanguages(Counts.parse(audio.rows)),
    subtitleLanguages: rankLanguages(
      Counts.parse(embedded.rows),
      Counts.parse(sidecar.rows),
    ),
  }
}
