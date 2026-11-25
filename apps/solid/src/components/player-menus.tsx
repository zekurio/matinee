import { PlaybackQuality as PlaybackQualitySchema } from "@matinee/contracts"
import { AudioLines, Captions, Gauge, Settings } from "lucide"
import { createMemo, Show } from "solid-js"

import {
  audioDetail,
  formatBitrate,
  formatDelay,
} from "@/components/player-format"
import { tr } from "@/i18n"
import { trackLabel } from "@/lib/languages"
import { subtitleLabel, trackDetail } from "@/lib/subtitles"
import {
  selectAudio,
  selectBurnedIn,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"

import { controlButtonClass, SUBTITLE_STEP_MS } from "./player-controls"
import {
  type MenuAdjust,
  type MenuChoice,
  type MenuSection,
  type MenuToggle,
  PlayerMenu,
} from "./player-menu"
import type { Playback } from "./use-playback"
import type { Subtitles } from "./use-subtitles"

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const OFF = "off"

/**
 * The audio, subtitle, and settings menus in the control bar. `split`, as
 * on a touch screen, gives speed and quality a menu each, as the phone app
 * does.
 */
export function PlayerMenus(props: {
  split: boolean
  playback: Playback
  subs: Subtitles
  onSpeedChange: (speed: number) => void
  /** The viewer picked an audio track, for the server to remember. */
  onPickAudio: (index: number) => void
  container: () => HTMLElement | undefined
}) {
  const actions = usePlayerStoreApi().getState()
  const speed = usePlayerStore((state) => state.speed)
  const openMenu = usePlayerStore((state) => state.openMenu)
  const delay = usePlayerStore((state) => state.subtitleDelay)
  const burnedIn = usePlayerStore(selectBurnedIn)
  const audio = usePlayerStore(selectAudio)
  const statsOpen = usePlayerStore((state) => state.statsOpen)
  const { playback, subs } = props

  // Audio: every track, with the codec and channels its label leaves out.
  const audioSection = createMemo<MenuSection>(() => {
    const current = audio()
    return {
      title: tr("player.menu.audio"),
      value: current === null ? "" : String(current),
      choices: playback.tracks().map((track, position) => ({
        id: String(track.index),
        label: trackLabel(
          track.language,
          track.title,
          tr("player.track.unnamed", { number: position + 1 }),
        ),
        detail: audioDetail(track),
      })),
      onSelect: (id) => {
        if (playback.selectAudio(Number(id))) props.onPickAudio(Number(id))
      },
      empty: tr("player.audio.noTracks"),
    }
  })

  const subtitleSection = createMemo<MenuSection>(() => {
    const tracks = subs.tracks()
    const choices: MenuChoice[] = tracks.map((track) => ({
      id: track.id,
      label: subtitleLabel(track, tracks),
      detail: trackDetail(track),
      // Burning in takes an encode, and an encode takes an audio track.
      disabled:
        track.delivery === null ||
        (track.delivery === "burn-in" && playback.tracks().length === 0),
    }))
    return {
      title: tr("player.menu.subtitles"),
      value: subs.selected() ?? OFF,
      // A file without any lists none rather than Off alone.
      choices:
        choices.length === 0
          ? []
          : [{ id: OFF, label: tr("player.subtitles.off") }, ...choices],
      onSelect: (id) => subs.select(id === OFF ? null : id),
      empty: tr("player.subtitles.noTracks"),
    }
  })
  // The shown track's timing. An encode draws a burned-in track where the
  // file says.
  const subtitleTiming = createMemo<MenuAdjust | undefined>(() => {
    if (subs.selected() === null) return undefined
    const ms = delay()
    return {
      title: tr("player.subtitles.delay"),
      value: formatDelay(ms),
      disabledNote: burnedIn() ? tr("player.subtitles.burnedIn") : undefined,
      atStart: ms === 0,
      decrease: {
        label: tr("player.subtitles.earlier"),
        onSelect: () => actions.setSubtitleDelay(ms - SUBTITLE_STEP_MS),
      },
      increase: {
        label: tr("player.subtitles.later"),
        onSelect: () => actions.setSubtitleDelay(ms + SUBTITLE_STEP_MS),
      },
      reset: {
        label: tr("player.subtitles.delayReset"),
        title: tr("player.subtitles.delayResetDetail"),
        onSelect: () => actions.setSubtitleDelay(0),
      },
    }
  })

  // Quality: the file as it is, then the encodes the server offers for it.
  // A file over the account's bit rate limit plays only as an encode.
  const qualitySection = createMemo<MenuSection>(() => {
    const plan = playback.plan()
    const video = plan.item.probe?.video
    const noAudio = playback.tracks().length === 0
    const qualities: MenuChoice[] = [
      ...(plan.original
        ? [
            {
              id: "original",
              label: tr("player.quality.original"),
              detail: video?.resolution ?? undefined,
            },
          ]
        : []),
      ...plan.qualities.map((quality) => ({
        id: quality.id,
        label: `${quality.height}p`,
        detail: formatBitrate(quality.bitrate),
        // A stream carries one audio track, and needs one to pick.
        disabled: noAudio,
      })),
    ]
    return {
      title: tr("player.quality"),
      value: playback.quality(),
      choices: qualities,
      onSelect: (id) => {
        const parsed = PlaybackQualitySchema.safeParse(id)
        if (parsed.success) playback.selectQuality(parsed.data)
      },
    }
  })
  const speedSection = createMemo<MenuSection>(() => ({
    title: tr("player.speed"),
    value: String(speed()),
    choices: SPEEDS.map((rate) => ({
      id: String(rate),
      label:
        rate === 1
          ? tr("player.speed.normal")
          : tr("player.speed.rate", { rate }),
    })),
    onSelect: (id) => props.onSpeedChange(Number(id)),
  }))
  const statsToggle = createMemo<MenuToggle>(() => ({
    label: tr("player.stats.toggle"),
    checked: statsOpen(),
    onChange: actions.setStatsOpen,
  }))

  // One menu opens at a time, and the controls stay up while it does.
  const isOpen = (id: string) => openMenu() === id
  const onOpenChange = (id: string) => (open: boolean) =>
    actions.setMenuOpen(id, open)

  return (
    <>
      <PlayerMenu
        label={tr("player.menu.audio")}
        open={isOpen("audio")}
        onOpenChange={onOpenChange("audio")}
        container={props.container}
        triggerClass={controlButtonClass}
        icon={AudioLines}
        sections={[audioSection()]}
      />
      <PlayerMenu
        label={tr("player.menu.subtitles")}
        open={isOpen("subtitles")}
        onOpenChange={onOpenChange("subtitles")}
        container={props.container}
        triggerClass={controlButtonClass}
        shortcut="c"
        icon={Captions}
        active={subs.selected() !== null}
        sections={[subtitleSection()]}
        adjust={subtitleTiming()}
      />
      <Show
        when={props.split}
        fallback={
          <PlayerMenu
            label={tr("player.menu.settings")}
            open={isOpen("settings")}
            onOpenChange={onOpenChange("settings")}
            container={props.container}
            triggerClass={controlButtonClass}
            icon={Settings}
            sections={[qualitySection(), speedSection()]}
            toggles={[statsToggle()]}
          />
        }
      >
        <PlayerMenu
          label={tr("player.speed")}
          open={isOpen("speed")}
          onOpenChange={onOpenChange("speed")}
          container={props.container}
          triggerClass={controlButtonClass}
          icon={Gauge}
          sections={[speedSection()]}
        />
        <PlayerMenu
          label={tr("player.quality")}
          open={isOpen("quality")}
          onOpenChange={onOpenChange("quality")}
          container={props.container}
          triggerClass={controlButtonClass}
          icon={Settings}
          sections={[qualitySection()]}
          toggles={[statsToggle()]}
        />
      </Show>
    </>
  )
}
