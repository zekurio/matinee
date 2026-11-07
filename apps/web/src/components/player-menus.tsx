import {
  type AudioTrack,
  PLAYBACK_QUALITIES,
  type PlaybackQuality,
  PlaybackQuality as PlaybackQualitySchema,
  type Subtitles,
} from "@matinee/contracts"
import { AudioLinesIcon, CaptionsIcon, SettingsIcon } from "lucide-react"
import type { RefObject } from "react"
import { useShallow } from "zustand/shallow"

import { trackDetail } from "@/lib/subtitles"
import { usePlayerStore } from "@/stores/player"

import { controlButtonClass } from "./player-controls"
import { audioDetail, formatBitrate, resolutionName } from "./player-format"
import { type MenuChoice, type MenuSection, PlayerMenu } from "./player-menu"
import type { usePlayback } from "./use-playback"
import type { useSubtitles } from "./use-subtitles"

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const OFF = "off"

/** The audio, subtitle, and settings menus in the control bar. */
export function PlayerMenus({
  playback,
  subs,
  audioTracks,
  subtitles,
  videoSize,
  onSpeedChange,
  container,
}: {
  playback: ReturnType<typeof usePlayback>
  subs: ReturnType<typeof useSubtitles>
  audioTracks?: AudioTrack[]
  subtitles?: Subtitles
  videoSize: { width: number; height: number } | null
  onSpeedChange: (speed: number) => void
  container: RefObject<HTMLDivElement | null>
}) {
  const { speed, openMenu, setMenuOpen } = usePlayerStore(
    useShallow((state) => ({
      speed: state.speed,
      openMenu: state.openMenu,
      setMenuOpen: state.setMenuOpen,
    })),
  )
  // One menu opens at a time, and the controls stay up while it does.
  const menuProps = (label: string) => ({
    label,
    open: openMenu === label,
    onOpenChange: (open: boolean) => setMenuOpen(label, open),
    container,
    triggerClassName: controlButtonClass,
  })
  // Audio: every track, with the codec and channels its label leaves out.
  const audioSection: MenuSection = {
    title: "Audio",
    value: playback.audio === null ? "" : String(playback.audio),
    choices: playback.tracks.map((track) => ({
      id: String(track.index),
      label: track.label,
      detail: audioDetail(track),
    })),
    onSelect: (id) => playback.selectAudio(Number(id)),
    empty: audioTracks ? "This file has no audio tracks" : "Loading tracks…",
  }

  const subtitleSection: MenuSection = {
    title: "Subtitles",
    value: subs.selected ?? OFF,
    choices: [
      { id: OFF, label: "Off" },
      ...subs.tracks.map((track) => ({
        id: track.id,
        label: track.label,
        detail: trackDetail(track),
        // Burning in takes an encode, and an encode takes an audio track.
        disabled:
          track.delivery === null ||
          (track.delivery === "burn-in" && playback.tracks.length === 0),
      })),
    ],
    onSelect: (id) => subs.select(id === OFF ? null : id),
  }

  // Quality: the file as it is, then the encodes no larger than it.
  const qualities: MenuChoice[] = [
    {
      id: "original",
      label: "Original",
      detail: videoSize
        ? resolutionName(videoSize.width, videoSize.height)
        : undefined,
    },
    ...PLAYBACK_QUALITIES.filter(
      (quality) =>
        !videoSize ||
        quality.width <= videoSize.width ||
        quality.height <= videoSize.height,
    ).map((quality) => ({
      id: quality.id,
      label: `${quality.height}p`,
      detail: formatBitrate(quality.bitrate),
      // A stream carries one audio track, and needs one to pick.
      disabled: playback.tracks.length === 0,
    })),
  ]
  const settingsSections: MenuSection[] = [
    {
      title: "Quality",
      value: playback.quality,
      choices: qualities,
      onSelect: (id) => {
        const parsed = PlaybackQualitySchema.safeParse(id)
        if (parsed.success) playback.selectQuality(parsed.data)
      },
    },
    {
      title: "Speed",
      value: String(speed),
      choices: SPEEDS.map((rate) => ({
        id: String(rate),
        label: rate === 1 ? "Normal" : `${rate}×`,
      })),
      onSelect: (id) => onSpeedChange(Number(id)),
    },
  ]
  const source = playback.source
  // How the file reaches the browser, in Jellyfin's terms.
  const playingAs: Map<PlaybackQuality, string> = new Map(
    PLAYBACK_QUALITIES.map((quality) => [
      quality.id,
      `Transcoding to ${quality.height}p, ${formatBitrate(quality.bitrate)}`,
    ]),
  )
  const burnedIn = source?.kind === "hls" && source.subtitle !== null
  const note =
    source && source.kind !== "direct"
      ? `${playingAs.get(source.quality) ?? "Direct stream"}${burnedIn ? ", subtitles burned in" : ""}`
      : "Direct play"

  return (
    <>
      <PlayerMenu
        {...menuProps("Audio")}
        icon={<AudioLinesIcon />}
        sections={[audioSection]}
      />
      <PlayerMenu
        {...menuProps("Subtitles")}
        shortcut="c"
        icon={<CaptionsIcon />}
        active={subs.selected !== null}
        note={
          subtitles && subs.tracks.length === 0
            ? "This file has no subtitles"
            : subs.loading
              ? "Loading subtitles…"
              : undefined
        }
        sections={[subtitleSection]}
      />
      <PlayerMenu
        {...menuProps("Settings")}
        icon={<SettingsIcon />}
        note={note}
        sections={settingsSections}
      />
    </>
  )
}
