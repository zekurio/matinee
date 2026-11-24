import type { MediaItem } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import { AudioLines, Captions, Film } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { perLocale, tr } from "@/i18n"
import { Icon, type IconNode } from "@/kit/icon"
import { baseLanguage, languageName } from "@/lib/languages"
import { channelLayout } from "@/lib/media"
import { orpc } from "@/lib/rpc"

/** "A, B, C", the way the language lists languages. */
const unitList = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "unit", style: "short" }),
)

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
  return names.length > 0 ? unitList().format(names) : null
}

type InfoLine = { icon: IconNode; label: string; text: string }

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
      icon: Film,
      label: tr("media.info.video"),
      text: [video?.resolution, video?.format, video?.dynamicRange]
        .filter(Boolean)
        .join(" · "),
    },
    {
      icon: AudioLines,
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
      icon: Captions,
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

/** Track lists include external subtitles. The probe fills in while they load. */
export function MediaInfo(props: { item: MediaItem }) {
  const id = createMemo(() => props.item.id)
  const enabled = createMemo(() => props.item.probe !== null)
  const audio = useQuery(() => ({
    ...orpc.media.audio.queryOptions({ input: { id: id() } }),
    enabled: enabled(),
  }))
  const subtitles = useQuery(() => ({
    ...orpc.media.subtitles.queryOptions({ input: { id: id() } }),
    enabled: enabled(),
  }))
  const lines = createMemo(() => {
    const probe = props.item.probe
    if (!probe) return []
    return infoLines(
      probe,
      (audio.isSuccess ? audio.data : undefined)
        ?.toSorted((a, b) => Number(b.primary) - Number(a.primary))
        .map((track) => track.language) ?? probeAudio(probe),
      (subtitles.isSuccess ? subtitles.data : undefined)?.tracks.map(
        (track) => track.language,
      ) ?? probe.subtitles.map((stream) => stream.language),
    )
  })
  return (
    <Show when={lines().length}>
      <dl class="flex max-w-2xl flex-wrap gap-x-5 gap-y-1 text-sm">
        <For each={lines()} keyed={(line) => line.label}>
          {(line) => (
            <div class="flex min-w-0 items-center gap-2">
              <dt class="text-muted-foreground shrink-0">
                <Icon icon={line().icon} class="size-4" />
                <span class="sr-only">{line().label}</span>
              </dt>
              <dd class="text-foreground/80 min-w-0 truncate">{line().text}</dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  )
}

/** A compact readout for Next up. It uses the probe already on the item. */
export function MediaInfoLine(props: { item: MediaItem }) {
  const lines = createMemo(() => {
    const probe = props.item.probe
    return probe
      ? infoLines(
          probe,
          probeAudio(probe),
          probe.subtitles.map((stream) => stream.language),
        )
      : []
  })
  return (
    <Show when={lines().length}>
      <span class="text-muted-foreground/70 flex min-w-0 items-center gap-x-3 overflow-hidden text-xs leading-5 whitespace-nowrap">
        <For each={lines()} keyed={(line) => line.label}>
          {(line, index) => (
            <span
              class={[
                "inline-flex items-center gap-1",
                index() === 0 ? "shrink-0" : "min-w-0",
              ]}
            >
              <Icon icon={line().icon} class="size-3.5 shrink-0" />
              <span class="sr-only">{line().label}</span>
              <span class="truncate">{line().text}</span>
            </span>
          )}
        </For>
      </span>
    </Show>
  )
}
