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

import { controlButtonClass, SUBTITLE_STEP_MS } from "./player-controls"
import {
  audioDetail,
  formatBitrate,
  formatDelay,
  resolutionName,
} from "./player-format"
import {
  type MenuAdjust,
  type MenuChoice,
  type MenuSection,
  PlayerMenu,
} from "./player-menu"
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
  const {
    speed,
    openMenu,
    setMenuOpen,
    delay,
    burnIn,
    setSubtitleDelay,
    statsOpen,
    setStatsOpen,
  } = usePlayerStore(
    useShallow((state) => ({
      speed: state.speed,
      openMenu: state.openMenu,
      setMenuOpen: state.setMenuOpen,
      delay: state.subtitleDelay,
      burnIn: state.burnIn,
      setSubtitleDelay: state.setSubtitleDelay,
      statsOpen: state.statsOpen,
      setStatsOpen: state.setStatsOpen,
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

  const subtitleChoices: MenuChoice[] = subs.tracks.map((track) => ({
    id: track.id,
    label: subtitleLabel(track, subs.tracks),
    detail: trackDetail(track),
    // Burning in takes an encode, and an encode takes an audio track.
    disabled:
      track.delivery === null ||
      (track.delivery === "burn-in" && playback.tracks.length === 0),
  }))
  const subtitleSection: MenuSection = {
    title: tr("player.menu.subtitles"),
    value: subs.selected ?? OFF,
    // A file without any lists none rather than Off alone.
    choices:
      subtitles && subtitleChoices.length === 0
        ? []
        : [{ id: OFF, label: tr("player.subtitles.off") }, ...subtitleChoices],
    onSelect: (id) => subs.select(id === OFF ? null : id),
    empty: tr("player.subtitles.noTracks"),
  }
  // The shown track's timing. An encode draws a burned-in track where the
  // file says.
  const subtitleTiming: MenuAdjust | undefined =
    subs.selected === null
      ? undefined
      : {
          title: tr("player.subtitles.delay"),
          value: formatDelay(delay),
          disabledNote:
            burnIn === null ? undefined : tr("player.subtitles.burnedIn"),
          atStart: delay === 0,
          decrease: {
            label: tr("player.subtitles.earlier"),
            onSelect: () => setSubtitleDelay(delay - SUBTITLE_STEP_MS),
          },
          increase: {
            label: tr("player.subtitles.later"),
            onSelect: () => setSubtitleDelay(delay + SUBTITLE_STEP_MS),
          },
          reset: {
            label: tr("player.subtitles.delayReset"),
            title: tr("player.subtitles.delayResetDetail"),
            onSelect: () => setSubtitleDelay(0),
          },
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
        sections={[subtitleSection]}
        adjust={subtitleTiming}
      />
      <PlayerMenu
        {...menuProps("settings", tr("player.menu.settings"))}
        icon={<SettingsIcon />}
        sections={settingsSections}
        toggles={[
          {
            label: tr("player.stats.toggle"),
            checked: statsOpen,
            onChange: setStatsOpen,
          },
        ]}
      />
    </>
  )
}
