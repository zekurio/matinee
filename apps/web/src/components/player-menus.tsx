import {
  type AudioTrack,
  PLAYBACK_QUALITIES,
  PlaybackQuality as PlaybackQualitySchema,
  type Subtitles,
} from "@matinee/contracts"
import { AudioLinesIcon, CaptionsIcon, SettingsIcon } from "lucide-react"
import type { RefObject } from "react"
import { useShallow } from "zustand/shallow"

import { tr } from "@/i18n"
import { trackLabel } from "@/lib/languages"
import { subtitleLabel, trackDetail } from "@/lib/subtitles"
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
  const menuProps = (id: string, label: string) => ({
    label,
    open: openMenu === id,
    onOpenChange: (open: boolean) => setMenuOpen(id, open),
    container,
    triggerClassName: controlButtonClass,
  })
  // Audio: every track, with the codec and channels its label leaves out.
  const audioSection: MenuSection = {
    title: tr("player.menu.audio"),
    value: playback.audio === null ? "" : String(playback.audio),
    choices: playback.tracks.map((track, position) => ({
      id: String(track.index),
      label: trackLabel(
        track.language,
        track.title,
        tr("player.track.unnamed", { number: position + 1 }),
      ),
      detail: audioDetail(track),
    })),
    onSelect: (id) => playback.selectAudio(Number(id)),
    empty: audioTracks
      ? tr("player.audio.noTracks")
      : tr("player.audio.loading"),
  }

  const subtitleSection: MenuSection = {
    title: tr("player.menu.subtitles"),
    value: subs.selected ?? OFF,
    choices: [
      { id: OFF, label: tr("player.subtitles.off") },
      ...subs.tracks.map((track) => ({
        id: track.id,
        label: subtitleLabel(track, subs.tracks),
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
      label: tr("player.quality.original"),
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
      title: tr("player.quality"),
      value: playback.quality,
      choices: qualities,
      onSelect: (id) => {
        const parsed = PlaybackQualitySchema.safeParse(id)
        if (parsed.success) playback.selectQuality(parsed.data)
      },
    },
    {
      title: tr("player.speed"),
      value: String(speed),
      choices: SPEEDS.map((rate) => ({
        id: String(rate),
        label:
          rate === 1
            ? tr("player.speed.normal")
            : tr("player.speed.rate", { rate }),
      })),
      onSelect: (id) => onSpeedChange(Number(id)),
    },
  ]
  const source = playback.source
  // How the file reaches the browser, in Jellyfin's terms.
  const burnedIn = source?.kind === "hls" && source.subtitle !== null
  const encode =
    source && source.kind !== "direct"
      ? PLAYBACK_QUALITIES.find((quality) => quality.id === source.quality)
      : undefined
  const encodeParams = encode && {
    resolution: `${encode.height}p`,
    bitrate: formatBitrate(encode.bitrate),
  }
  const note =
    !source || source.kind === "direct"
      ? tr("player.via.directPlay")
      : encodeParams
        ? burnedIn
          ? tr("player.via.transcodeBurnIn", encodeParams)
          : tr("player.via.transcode", encodeParams)
        : burnedIn
          ? tr("player.via.directStreamBurnIn")
          : tr("player.via.directStream")

  return (
    <>
      <PlayerMenu
        {...menuProps("audio", tr("player.menu.audio"))}
        icon={<AudioLinesIcon />}
        sections={[audioSection]}
      />
      <PlayerMenu
        {...menuProps("subtitles", tr("player.menu.subtitles"))}
        shortcut="c"
        icon={<CaptionsIcon />}
        active={subs.selected !== null}
        note={
          subtitles && subs.tracks.length === 0
            ? tr("player.subtitles.noTracks")
            : subs.loading
              ? tr("player.subtitles.loading")
              : undefined
        }
        sections={[subtitleSection]}
      />
      <PlayerMenu
        {...menuProps("settings", tr("player.menu.settings"))}
        icon={<SettingsIcon />}
        note={note}
        sections={settingsSections}
      />
    </>
  )
}
