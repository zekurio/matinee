import type { SubtitlePick } from "@matinee/contracts"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import {
  ArrowLeftIcon,
  CaptionsIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { type FocusEvent, useEffect, useRef, useState } from "react"

import { tr } from "@/i18n"
import type { FirstStart } from "@/lib/playback-start"
import { usePlaybackPreferences } from "@/lib/playback-sync"
import { subtitleLabel } from "@/lib/subtitles"
import {
  createPlayerStore,
  type PlayerStore,
  PlayerStoreContext,
  selectBurnedIn,
  selectHidden,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { playbackNotice } from "./playback-notices"
import { sourceOf } from "./playback-source"
import {
  CenterControls,
  ControlButton,
  EndsAt,
  FlashNote,
  FullscreenButton,
  PlayButton,
  SeekBar,
  SkipIcon,
  VolumeControl,
} from "./player-controls"
import { formatDelay, formatPercent } from "./player-format"
import { PlayerMenus } from "./player-menus"
import { PlayerStats } from "./player-stats"
import type { TrickplayTiles } from "./trickplay-thumb"
import { type UpNext, UpNextCard } from "./up-next"
import { useHls } from "./use-hls"
import { type NowPlaying, useMediaSession } from "./use-media-session"
import { usePlayback } from "./use-playback"
import { usePlayerKeys } from "./use-player-keys"
import {
  type ProgressReport,
  usePlayedTime,
  useProgressReport,
} from "./use-progress-report"
import { useSubtitles } from "./use-subtitles"

const IDLE_MS = 2500

type VideoPlayerProps = {
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
  onBack: () => void
  /** Nothing this browser can play is left. */
  onUnplayable: () => void
  /** A source failed and the server couldn't say what plays instead. */
  onFailed: (cause: unknown) => void
  /** Called while playing, on pause and end, and when the player closes. */
  onProgress?: (report: ProgressReport) => void
  /** Called when the viewer picks an audio or subtitle track. */
  onPickTracks: (pick: { audio?: number; subtitle?: SubtitlePick }) => void
}

/**
 * Full-screen player. Space or K plays and pauses, arrows or J/L skip back
 * and ahead by the lengths in the settings, up and down change the volume, 0 to 9 jump
 * to a tenth of the way, M mutes, F toggles full screen, C turns subtitles
 * on and off, G and H show them earlier and later, I shows the playback
 * stats.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  // One store per player, which remounts for another file. It starts from
  // the server's first answer and the saved preferences.
  const [store] = useState(() => {
    const saved = usePlayerPreferencesStore.getState()
    const { plan, sessionId, device, quality } = props.start
    return createPlayerStore({
      itemId: plan.item.id,
      sessionId,
      device,
      plan,
      source: sourceOf(plan, 0),
      picks: { quality },
      duration:
        plan.item.durationSeconds ??
        plan.item.probe?.format.durationSeconds ??
        0,
      volume: saved.volume,
      muted: saved.muted,
    })
  })
  // What the server does for the first answer, said once it plays.
  useEffect(() => playbackNotice(props.start.plan, null), [])
  return (
    <PlayerStoreContext value={store}>
      <Player {...props} />
    </PlayerStoreContext>
  )
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

function Player({
  title,
  subtitle,
  nowPlaying,
  trickplay,
  upNext,
  onBack,
  onUnplayable,
  onFailed,
  onProgress,
  onPickTracks,
}: VideoPlayerProps) {
  const store = usePlayerStoreApi()
  const container = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const pgsLayer = useRef<HTMLDivElement>(null)
  const seekBar = useRef<HTMLDivElement>(null)
  const coarse = useMediaQuery("(pointer: coarse)")
  const { skipBackSeconds, skipForwardSeconds } = usePlaybackPreferences()
  const playedTime = usePlayedTime()
  // The store's actions and session never change, so one read is enough.
  const actions = store.getState()
  const { sessionId } = actions

  const playback = usePlayback({ video, onUnplayable, onFailed })
  const { position, duration: lengthOf, seek } = playback

  const report = useProgressReport(
    video,
    store,
    playedTime,
    onProgress,
    position,
    lengthOf,
  )

  useHls(video, playback.hls, (code) => {
    playedTime.stop()
    actions.setWaiting(false)
    playback.onError(code)
  })
  useIdle(store, IDLE_MS)
  const hidden = usePlayerStore(selectHidden)
  const statsOpen = usePlayerStore((state) => state.statsOpen)
  const subs = useSubtitles(
    video,
    seekBar,
    pgsLayer,
    !hidden,
    playback.offset,
    playback.selectSubtitle,
    (trackId) => onPickTracks({ subtitle: { trackId } }),
  )
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

  // Puts the saved volume on the video before anything plays.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const { volume, muted } = store.getState()
    el.volume = volume
    el.muted = muted
  }, [])

  const show = actions.showFlash
  const toggle = () => {
    const el = video.current
    if (!el) return
    const { pending, playing } = store.getState()
    // While a new source loads, the old one holds still, and this picks
    // whether the new one plays.
    if (pending !== null) {
      playback.setPlayOnLoad(!playing)
      actions.setPlaying(!playing)
      return
    }
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }
  const skip = (by: number) => {
    const target = Math.max(0, position() + by)
    actions.setTime(target)
    seek(target)
  }
  const jump = (digit: number) => {
    const target = (lengthOf() * digit) / 10
    actions.setTime(target)
    seek(target)
  }
  const setVolume = (value: number) => {
    const el = video.current
    if (!el) return
    el.volume = value
    el.muted = value === 0
  }
  const changeVolume = (by: number) => {
    const el = video.current
    if (!el) return
    const next = Math.round(Math.max(0, Math.min(1, el.volume + by)) * 100)
    setVolume(next / 100)
    show(next === 0 ? VolumeXIcon : Volume2Icon, formatPercent(next / 100))
  }
  const toggleMute = () => {
    const el = video.current
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
    const el = video.current
    if (!el) return
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

  usePlayerKeys({
    toggle,
    skip,
    skipBackSeconds,
    skipForwardSeconds,
    jump,
    show,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    toggleSubtitles: subs.toggle,
    moveSubtitles,
    toggleStats: () => actions.setStatsOpen(!store.getState().statsOpen),
  })

  useMediaSession(video, {
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
    next: upNext?.play ?? null,
  })

  return (
    <div
      ref={container}
      className={cn(
        "fixed inset-0 bg-black text-white",
        hidden && "cursor-none",
      )}
    >
      {/* Clicks on the picture play and pause; keyboard users have Space.
          On touch screens a tap shows the controls instead. The store
          follows the video through its events. */}
      <video
        ref={video}
        src={playback.src}
        playsInline
        className="size-full object-contain"
        onClick={coarse ? undefined : toggle}
        onDoubleClick={coarse ? undefined : toggleFullscreen}
        onPlay={() => {
          actions.setPlaying(true)
          actions.setEnded(false)
          // So "watching now" sees a resume without waiting for the timer.
          report()
        }}
        onPause={() => {
          playedTime.stop()
          // Holding the old source still for a seek isn't a pause.
          if (playback.heldStill()) return
          actions.paused()
          report()
        }}
        onEnded={() => {
          playedTime.stop()
          actions.setEnded(true)
          report(false, true)
        }}
        onLoadStart={() => {
          playedTime.stop()
          actions.setWaiting(true)
        }}
        onLoadedMetadata={() => {
          playback.onLoaded()
          actions.setDuration(lengthOf())
        }}
        onWaiting={() => {
          playedTime.stop()
          actions.setWaiting(true)
        }}
        onSeeking={() => {
          playedTime.stop()
          actions.setEnded(false)
        }}
        // So "watching now" sees the new position without waiting for the
        // timer.
        onSeeked={() => report()}
        onPlaying={() => {
          playedTime.start()
          actions.setWaiting(false)
        }}
        onCanPlay={() => actions.setWaiting(false)}
        onTimeUpdate={() => {
          playedTime.update()
          playback.onTimeUpdate()
          actions.setTime(position())
        }}
        onDurationChange={() => actions.setDuration(lengthOf())}
        onProgress={(event) => {
          const el = event.currentTarget
          for (let i = 0; i < el.buffered.length; i++) {
            if (el.buffered.start(i) <= el.currentTime) {
              actions.setBuffered(playback.offset + el.buffered.end(i))
            }
          }
        }}
        onVolumeChange={(event) => {
          const { volume, muted } = event.currentTarget
          actions.setVolume(volume, muted)
          usePlayerPreferencesStore.getState().setVolume(volume, muted)
        }}
        onRateChange={(event) =>
          actions.setSpeed(event.currentTarget.playbackRate)
        }
        onError={() => {
          playedTime.stop()
          actions.setWaiting(false)
          playback.onError()
        }}
      >
        {subs.current && (
          <track
            key={subs.current.track.id}
            data-track-id={subs.current.track.id}
            kind="subtitles"
            src={subs.current.src}
            srcLang={subs.current.track.language ?? undefined}
            label={subtitleLabel(subs.current.track, subs.tracks)}
          />
        )}
      </video>
      {/* PGS subtitles draw here, over the picture. */}
      <div ref={pgsLayer} className="pointer-events-none absolute inset-0" />

      {statsOpen && <PlayerStats video={video} sessionId={sessionId} />}

      <CenterControls coarse={coarse} hidden={hidden} onToggle={toggle} />
      <FlashNote />

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
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div
        {...focusHandlers}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.85),rgb(0_0_0/0.45)_55%,transparent)] px-3 pt-24 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-opacity duration-300 motion-reduce:transition-none sm:px-5 sm:pb-3",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <SeekBar ref={seekBar} trickplay={trickplay} onSeek={seek} />
        <div className="flex items-center gap-0.5">
          <PlayButton onToggle={toggle} />
          <ControlButton
            label={tr("player.skipBack", { seconds: skipBackSeconds })}
            onClick={() => skip(-skipBackSeconds)}
          >
            <SkipIcon direction="back" seconds={skipBackSeconds} />
          </ControlButton>
          <ControlButton
            label={tr("player.skipForward", { seconds: skipForwardSeconds })}
            onClick={() => skip(skipForwardSeconds)}
          >
            <SkipIcon direction="forward" seconds={skipForwardSeconds} />
          </ControlButton>
          <VolumeControl onToggleMute={toggleMute} onChange={setVolume} />
          <div className="ml-auto flex items-center gap-0.5">
            <EndsAt className="mr-2 hidden sm:block" />
            <PlayerMenus
              playback={playback}
              subs={subs}
              onSpeedChange={changeSpeed}
              onPickAudio={(audio) => onPickTracks({ audio })}
              container={container}
            />
            <FullscreenButton onToggle={toggleFullscreen} />
          </div>
        </div>
      </div>

      {/* Last, so it's over the controls' gradient and takes the clicks. */}
      {upNext && <UpNextCard upNext={upNext} />}
    </div>
  )
}
