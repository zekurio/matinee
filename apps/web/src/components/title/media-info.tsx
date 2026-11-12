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

  const audio =
    audioTracks.data
      ?.toSorted((a, b) => Number(b.primary) - Number(a.primary))
      .map((track) => track.language) ??
    probe.audio
      .toSorted((a, b) => Number(b.default) - Number(a.default))
      .map((stream) => stream.language)
  const subtitles =
    subtitleTracks.data?.tracks.map((track) => track.language) ??
    probe.subtitles.map((stream) => stream.language)
  const main = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
  const { video } = probe

  const lines: { Icon: LucideIcon; label: string; text: string }[] = [
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
