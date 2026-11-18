import type { SubtitlePick } from "@matinee/contracts"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import {
  ArrowLeftIcon,
  CaptionsIcon,
  FastForwardIcon,
  GaugeIcon,
  RewindIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import {
  type FocusEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react"

import { tr } from "@/i18n"
import type { FirstStart } from "@/lib/playback-start"
import { usePlaybackPreferences } from "@/lib/playback-sync"
import {
  type PlayerStore,
  selectBurnedIn,
  selectHidden,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { PartyHealthButton } from "./party/party-health"
import {
  ControlButton,
  ElapsedTime,
  EndsAt,
  type Episodes,
  FlashNote,
  FullscreenButton,
  LoadingSpinner,
  SeekBar,
  TotalTime,
  Transport,
  VolumeControl,
} from "./player-controls"
import { formatDelay, formatPercent } from "./player-format"
import type { MediaEventName, PlayerMedia } from "./player-media"
import { PlayerMenus } from "./player-menus"
import { SkipSegment } from "./skip-segment"
import type { SubtitleMenu } from "./subtitle-picks"
import type { TrickplayTiles } from "./trickplay-thumb"
import { type UpNext, UpNextCard } from "./up-next"
import type { MediaSessionActions, NowPlaying } from "./use-media-session"
import { usePartyStatus } from "./use-party-status"
import { type PartyLink, usePartySync } from "./use-party-sync"
import { usePlayback } from "./use-playback"
import { usePlayerKeys } from "./use-player-keys"
import {
  type ProgressReport,
  usePlayedTime,
  useProgressReport,
} from "./use-progress-report"

/*
 * The player whatever plays the video: the playback, the party, the
 * progress reports, the controls, and the keys. `video-player.tsx` puts a
 * `<video>` under it, and in the desktop app `mpv-player.tsx` mpv.
 */

const IDLE_MS = 2500

export type PlayerProps = {
  /** The server's first answer for this sitting with the file. */
  start: FirstStart
  title: string
  subtitle: string
  /** What the system's media controls show. */
  nowPlaying: NowPlaying
  /** The seek bar's thumbnails, once the server has them. */
  trickplay: TrickplayTiles | null
  /** The episode after this one, offered once this one ends. */
  upNext?: UpNext | null
  /** For an episode, the buttons for the one before and the one after. */
  episodes?: Episodes | null
  /**
   * The watch party this file plays in. The player then follows it, and
   * tells it when the viewer plays, pauses, or seeks.
   */
  party?: PartyLink | null
  onBack: () => void
  /** Nothing this device can play is left. */
  onUnplayable: () => void
  /** A source failed and the server couldn't say what plays instead. */
  onFailed: (cause: unknown) => void
  /** Called while playing, on pause and end, and when the player closes. */
  onProgress?: (report: ProgressReport) => void
  /** Called when the viewer picks an audio or subtitle track. */
  onPickTracks: (pick: { audio?: number; subtitle?: SubtitlePick }) => void
}

/** Marks the player idle once the pointer and keyboard rest for `ms`. */
function useIdle(store: PlayerStore, ms: number) {
  useEffect(() => {
    const { setIdle } = store.getState()
    let timer = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const events = ["pointermove", "pointerdown", "keydown"] as const
    for (const event of events) window.addEventListener(event, wake)
    return () => {
      window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, wake)
    }
  }, [store, ms])
}

/**
 * Everything the player does with `media`, the thing that plays. The
 * store follows it through `events`, its media events' handlers.
 */
export function usePlayerCore(
  media: RefObject<PlayerMedia | null>,
  {
    nowPlaying,
    episodes = null,
    party = null,
    onUnplayable,
    onFailed,
    onProgress,
  }: PlayerProps,
) {
  const store = usePlayerStoreApi()
  const container = useRef<HTMLDivElement>(null)
  // What the subtitles rise above: the seek bar, and the times over it.
  const controls = useRef<HTMLDivElement>(null)
  const coarse = useMediaQuery("(pointer: coarse)")
  const { skipBackSeconds, skipForwardSeconds } = usePlaybackPreferences()
  const playedTime = usePlayedTime()
  // The store's actions and session never change, so one read is enough.
  const actions = store.getState()

  const playback = usePlayback({ video: media, onUnplayable, onFailed })
  const { position, duration: lengthOf } = playback
  const sync = usePartySync(
    media,
    store,
    { position, duration: lengthOf, seek: playback.seek },
    party,
  )
  usePartyStatus(media, store, position, party)
  /** The viewer's own seek, which a party follows. */
  const seek = (to: number) => {
    playback.seek(to)
    if (party) sync.tell(party.playback.playing, to)
  }
  /**
   * Tells the party the viewer played or paused. Not when that only
   * catches up with it, as a press on play does where autoplay is blocked.
   */
  const tellPlaying = (playing: boolean) => {
    if (party && playing !== party.playback.playing) {
      sync.tell(playing, position())
    }
  }

  const report = useProgressReport(
    media,
    store,
    playedTime,
    onProgress,
    position,
    lengthOf,
  )

  useIdle(store, IDLE_MS)
  const hidden = usePlayerStore(selectHidden)

  // Puts the saved volume on the video before anything plays.
  useEffect(() => {
    const el = media.current
    if (!el) return
    const { volume, muted } = store.getState()
    el.volume = volume
    el.muted = muted
  }, [])

  const show = actions.showFlash
  const toggle = () => {
    const el = media.current
    if (!el) return
    const { pending, playing } = store.getState()
    // While a new source loads, the old one holds still, and this picks
    // whether the new one plays.
    if (pending !== null) {
      playback.setPlayOnLoad(!playing)
      actions.setPlaying(!playing)
      tellPlaying(!playing)
      return
    }
    const play = el.paused
    if (play) void el.play().catch(() => {})
    else el.pause()
    tellPlaying(play)
  }
  const skip = (by: number) => {
    // From where a seek on its way is headed, so presses while the new
    // stream loads add up instead of starting from the old picture.
    const target = Math.max(0, playback.now() + by)
    actions.setTime(target)
    seek(target)
    // The buttons, the keys, and the media keys all say how far it went.
    show(
      by < 0 ? RewindIcon : FastForwardIcon,
      tr("player.flash.skip", { seconds: Math.abs(by) }),
    )
  }
  const jump = (digit: number) => {
    const target = (lengthOf() * digit) / 10
    actions.setTime(target)
    seek(target)
  }
  const setVolume = (value: number) => {
    const el = media.current
    if (!el) return
    el.volume = value
    el.muted = value === 0
  }
  const changeVolume = (by: number) => {
    const el = media.current
    if (!el) return
    const next = Math.round(Math.max(0, Math.min(1, el.volume + by)) * 100)
    setVolume(next / 100)
    show(next === 0 ? VolumeXIcon : Volume2Icon, formatPercent(next / 100))
  }
  const toggleMute = () => {
    const el = media.current
    if (!el) return
    el.muted = !el.muted
    show(
      el.muted ? VolumeXIcon : Volume2Icon,
      el.muted ? tr("player.flash.muted") : formatPercent(el.volume),
    )
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void container.current?.requestFullscreen()
  }
  const changeSpeed = (next: number) => {
    const el = media.current
    if (!el) return
    if (party) {
      show(GaugeIcon, tr("party.flash.speed"))
      return
    }
    // The default carries over when a new source loads.
    el.defaultPlaybackRate = next
    el.playbackRate = next
  }
  const moveSubtitles = (by: number) => {
    const state = store.getState()
    const { subtitleDelay, setSubtitleDelay } = state
    if (selectBurnedIn(state)) {
      show(CaptionsIcon, tr("player.flash.subtitlesBurnedIn"))
      return
    }
    const next = subtitleDelay + by
    setSubtitleDelay(next)
    show(
      CaptionsIcon,
      tr("player.flash.subtitleDelay", { delay: formatDelay(next) }),
    )
  }
  /** The source failed, with a `MediaError` code when the video has none. */
  const fail = (code?: number) => {
    playedTime.stop()
    actions.setWaiting(false)
    playback.onError(code)
  }

  /** What the store does on each of the video's events. */
  const events = {
    play: () => {
      actions.setPlaying(true)
      actions.setEnded(false)
      // So "watching now" sees a resume without waiting for the timer.
      report()
    },
    pause: () => {
      playedTime.stop()
      // Holding the old source still for a seek isn't a pause.
      if (playback.heldStill()) return
      actions.paused()
      report()
    },
    ended: () => {
      playedTime.stop()
      actions.setEnded(true)
      report(false, true)
      party?.ended()
    },
    loadstart: () => {
      playedTime.stop()
      actions.setWaiting(true)
    },
    loadedmetadata: () => {
      playback.onLoaded()
      actions.setDuration(lengthOf())
    },
    waiting: () => {
      playedTime.stop()
      actions.setWaiting(true)
    },
    seeking: () => {
      playedTime.stop()
      actions.setEnded(false)
    },
    // So "watching now" sees the new position without waiting for the
    // timer.
    seeked: () => report(),
    playing: () => {
      playedTime.start()
      actions.setWaiting(false)
    },
    canplay: () => actions.setWaiting(false),
    timeupdate: () => {
      playedTime.update()
      playback.onTimeUpdate()
      actions.setTime(position())
    },
    durationchange: () => actions.setDuration(lengthOf()),
    progress: () => {
      playback.onBuffered()
      const el = media.current
      if (!el) return
      for (let i = 0; i < el.buffered.length; i++) {
        if (el.buffered.start(i) <= el.currentTime) {
          actions.setBuffered(playback.offset + el.buffered.end(i))
        }
      }
    },
    volumechange: () => {
      const el = media.current
      if (!el) return
      const { volume, muted } = el
      actions.setVolume(volume, muted)
      usePlayerPreferencesStore.getState().setVolume(volume, muted)
    },
    ratechange: () => {
      const el = media.current
      // Following a party changes the rate to catch up, which isn't the
      // viewer's speed.
      if (el && !party) actions.setSpeed(el.playbackRate)
    },
    error: () => fail(),
  } satisfies Partial<Record<MediaEventName, () => void>>

  const mediaSession: MediaSessionActions = {
    nowPlaying,
    setPaused: (paused) => {
      if (store.getState().playing === paused) toggle()
    },
    skip,
    skipBackSeconds,
    skipForwardSeconds,
    seek: (to) => {
      actions.setTime(to)
      seek(to)
    },
    position,
    duration: lengthOf,
    previous: episodes?.previous ?? null,
    next: episodes?.next ?? null,
  }

  return {
    container,
    controls,
    coarse,
    hidden,
    playback,
    seek,
    toggle,
    skip,
    jump,
    setVolume,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    changeSpeed,
    moveSubtitles,
    fail,
    events,
    mediaSession,
    skipBackSeconds,
    skipForwardSeconds,
  }
}

export type PlayerCore = ReturnType<typeof usePlayerCore>

/**
 * Full-screen player. Space or K plays and pauses, arrows or J/L skip back
 * and ahead by the lengths in the settings, up and down change the volume, 0 to 9 jump
 * to a tenth of the way, M mutes, F toggles full screen, C turns subtitles
 * on and off, G and H show them earlier and later, I shows the playback
 * stats, and shift with P or N plays the previous or next episode. In a
 * watch party, playing, pausing, and seeking do so for
 * everyone in it.
 *
 * `surface` is what shows the picture and takes its clicks, `layers` go
 * over it, and `stats` shows while the stats are open. `transparent`
 * leaves the background to what's under the page.
 */
export function PlayerFrame({
  core,
  subs,
  surface,
  layers,
  stats,
  transparent = false,
  title,
  subtitle,
  trickplay,
  upNext,
  episodes = null,
  party = null,
  onBack,
  onPickTracks,
}: PlayerProps & {
  core: PlayerCore
  subs: SubtitleMenu
  surface: ReactNode
  layers?: ReactNode
  stats: ReactNode
  transparent?: boolean
}) {
  const store = usePlayerStoreApi()
  const actions = store.getState()
  const { coarse, hidden, container, controls, playback } = core
  const statsOpen = usePlayerStore((state) => state.statsOpen)
  const segments = usePlayerStore((state) => state.plan.segments)
  // Keyboard focus holds the controls up. A click focuses a button too,
  // and a menu hands focus back to its button, but that shouldn't.
  const focusHandlers = {
    onFocus: (event: FocusEvent<HTMLElement>) =>
      actions.setFocused(event.target.matches(":focus-visible")),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        actions.setFocused(false)
      }
    },
  }

  const menus = (
    <PlayerMenus
      playback={playback}
      subs={subs}
      split={coarse}
      onSpeedChange={core.changeSpeed}
      onPickAudio={(audio) => onPickTracks({ audio })}
      container={container}
    />
  )
  const transport = (big: boolean) => (
    <Transport
      big={big}
      episodes={episodes}
      skipBackSeconds={core.skipBackSeconds}
      skipForwardSeconds={core.skipForwardSeconds}
      onSkip={core.skip}
      onToggle={core.toggle}
    />
  )

  usePlayerKeys({
    toggle: core.toggle,
    skip: core.skip,
    skipBackSeconds: core.skipBackSeconds,
    skipForwardSeconds: core.skipForwardSeconds,
    jump: core.jump,
    changeVolume: core.changeVolume,
    toggleMute: core.toggleMute,
    toggleFullscreen: core.toggleFullscreen,
    toggleSubtitles: subs.toggle,
    moveSubtitles: core.moveSubtitles,
    toggleStats: () => actions.setStatsOpen(!store.getState().statsOpen),
    previous: episodes?.previous ?? null,
    next: episodes?.next ?? null,
  })

  return (
    <div
      ref={container}
      className={cn(
        "fixed inset-0 text-white",
        !transparent && "bg-black",
        hidden && "cursor-none",
      )}
    >
      {surface}
      {layers}

      {statsOpen && stats}

      <LoadingSpinner />
      <FlashNote />

      {/* On a touch screen, the menus go up top and play in the middle,
          flanked by the skips and the episodes, as in the phone app. */}
      <div
        {...focusHandlers}
        className={cn(
          "absolute inset-x-0 top-0 flex items-center gap-3 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.8),rgb(0_0_0/0.5)_50%,transparent)] px-3 pt-3 pb-20 transition-opacity duration-300 motion-reduce:transition-none sm:px-5 sm:pt-4",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <ControlButton label={tr("player.back")} onClick={onBack}>
          <ArrowLeftIcon />
        </ControlButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
              {subtitle}
            </p>
          )}
        </div>
        {party && <PartyHealthButton party={party} container={container} />}
        {coarse && (
          <div className="flex shrink-0 items-center gap-0.5">
            {menus}
            <FullscreenButton onToggle={core.toggleFullscreen} />
          </div>
        )}
      </div>

      {coarse && (
        <div
          {...focusHandlers}
          className={cn(
            "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-300 motion-reduce:transition-none *:pointer-events-auto",
            hidden && "opacity-0 *:pointer-events-none",
          )}
        >
          {transport(true)}
        </div>
      )}

      {/* The seek bar runs the full width. With a mouse, the controls sit
          in a row under it; on a touch screen, nothing does. */}
      <div
        {...focusHandlers}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.85),rgb(0_0_0/0.45)_55%,transparent)] px-3 pt-24 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-opacity duration-300 motion-reduce:transition-none sm:px-5 sm:pb-3",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <div ref={controls} className="flex flex-col">
          {coarse && (
            <div className="flex items-center gap-3 px-1">
              <ElapsedTime />
              <span className="flex-1" />
              <EndsAt className="text-white/75" />
              <TotalTime />
            </div>
          )}
          <SeekBar trickplay={trickplay} onSeek={core.seek} />
        </div>
        {!coarse && (
          <div className="flex items-center gap-0.5">
            {transport(false)}
            <VolumeControl
              onToggleMute={core.toggleMute}
              onChange={core.setVolume}
            />
            <div className="ml-2 flex items-center gap-1">
              <ElapsedTime />
              <span aria-hidden className="text-sm text-white/60">
                /
              </span>
              <TotalTime />
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <EndsAt className="mr-2 hidden sm:block" />
              {menus}
              <FullscreenButton onToggle={core.toggleFullscreen} />
            </div>
          </div>
        )}
      </div>

      {/* Last, so they're over the controls' gradient and take the clicks. */}
      <div className="absolute right-3 bottom-28 flex flex-col items-end gap-3 sm:right-5 sm:bottom-32">
        <SkipSegment
          segments={segments}
          onSkip={(to) => {
            actions.setTime(to)
            core.seek(to)
          }}
        />
        {upNext && <UpNextCard upNext={upNext} />}
      </div>
    </div>
  )
}
