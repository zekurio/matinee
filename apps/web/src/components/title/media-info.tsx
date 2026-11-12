import type { MediaItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import {
  AudioLinesIcon,
  CaptionsIcon,
  FilmIcon,
  type LucideIcon,
} from "lucide-react"

import { tr } from "@/i18n"
import { baseLanguage, languageName } from "@/lib/languages"
import { channelLayout } from "@/lib/media"
import { orpc } from "@/lib/rpc"

/**
 * "German, English" for tracks' language tags, each language once in the
 * order given. Tracks that don't say are left out; null when none say.
 */
function languageList(tags: (string | null)[]): string | null {
  const seen = new Set<string>()
  const names = tags.flatMap((tag) => {
    const base = baseLanguage(tag)
    if (!tag || !base || seen.has(base)) return []
    seen.add(base)
    return [languageName(base)]
  })
  return names.length > 0 ? names.join(", ") : null
}

type InfoLine = { Icon: LucideIcon; label: string; text: string }

/**
 * The picture, the audio's languages with the main track's layout, and
 * the subtitles' languages. `audio` and `subtitles` are the tracks'
 * language tags, from the probe unless the caller has the server's lists.
 */
function infoLines(
  probe: NonNullable<MediaItem["probe"]>,
  audio: (string | null)[],
  subtitles: (string | null)[],
): InfoLine[] {
  const main = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
  const { video } = probe
  return [
    {
      Icon: FilmIcon,
      label: tr("media.info.video"),
      text: [video?.resolution, video?.format, video?.dynamicRange]
        .filter(Boolean)
        .join(" · "),
    },
    {
      Icon: AudioLinesIcon,
      label: tr("media.info.audio"),
      text: [
        languageList(audio) ??
          (audio.length > 0
            ? tr("media.audioTracks", { count: audio.length })
            : null),
        main && channelLayout(main.layout, main.channels),
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      Icon: CaptionsIcon,
      label: tr("media.info.subtitles"),
      text:
        languageList(subtitles) ??
        (subtitles.length > 0
          ? tr("media.subtitles", { count: subtitles.length })
          : ""),
    },
  ].filter((line) => line.text !== "")
}

function probeAudio(probe: NonNullable<MediaItem["probe"]>) {
  return probe.audio
    .toSorted((a, b) => Number(b.default) - Number(a.default))
    .map((stream) => stream.language)
}

/**
 * What a file holds in one quiet line, for a row in a list: the picture,
 * the audio's languages and layout, and the subtitles' languages, each
 * after its icon. From the probe alone, so a list asks the server nothing
 * more; subtitle files beside the video show on the file's own page.
 */
export function MediaInfoLine({ item }: { item: MediaItem }) {
  const probe = item.probe
  if (!probe) return null
  const lines = infoLines(
    probe,
    probeAudio(probe),
    probe.subtitles.map((stream) => stream.language),
  )
  if (lines.length === 0) return null
  return (
    <span className="text-muted-foreground/70 flex min-w-0 items-center gap-x-3 overflow-hidden text-xs leading-5 whitespace-nowrap">
      {lines.map(({ Icon, label, text }, at) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center gap-1",
            // The last part gives way first, then the one before it.
            at === 0 ? "shrink-0" : "min-w-0",
          )}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">{label}</span>
          <span className="truncate">{text}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * What a file holds, a line each: the picture, the audio's languages with
 * the main track's layout, and the subtitles' languages, as the apps show
 * it. The languages come from the server's track lists, which include
 * subtitle files beside the video; until they load, from what the probe
 * found in the file. Nothing until the server has probed it.
 */
export function MediaInfo({
  item,
  className,
}: {
  item: MediaItem
  className?: string
}) {
  const probe = item.probe
  const input = { input: { id: item.id } }
  const audioTracks = useQuery({
    ...orpc.media.audio.queryOptions(input),
    enabled: probe !== null,
  })
  const subtitleTracks = useQuery({
    ...orpc.media.subtitles.queryOptions(input),
    enabled: probe !== null,
  })
  if (!probe) return null

  const lines = infoLines(
    probe,
    audioTracks.data
      ?.toSorted((a, b) => Number(b.primary) - Number(a.primary))
      .map((track) => track.language) ?? probeAudio(probe),
    subtitleTracks.data?.tracks.map((track) => track.language) ??
      probe.subtitles.map((stream) => stream.language),
  )
  if (lines.length === 0) return null

  return (
    <dl className={cn("flex max-w-2xl flex-col gap-1 text-sm", className)}>
      {lines.map(({ Icon, label, text }) => (
        <div key={label} className="flex min-w-0 items-start gap-2.5">
          <dt className="text-muted-foreground mt-0.5 shrink-0">
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{label}</span>
          </dt>
          <dd className="text-foreground/80 line-clamp-2 min-w-0">{text}</dd>
        </div>
      ))}
    </dl>
  )
}
