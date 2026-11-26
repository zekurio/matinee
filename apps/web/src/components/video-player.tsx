import type { SubtitlePick } from "@matinee/contracts"
import {
  ArrowLeft,
  Captions,
  FastForward,
  Gauge,
  Rewind,
  Volume2,
  VolumeX,
} from "lucide"
import { createMemo, onSettled, Show } from "solid-js"

import { sourceOf } from "@/components/playback-source"
import { formatDelay, formatPercent } from "@/components/player-format"
import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import type { FirstStart } from "@/lib/playback-start"
import { usePlaybackPreferences } from "@/lib/playback-sync"
import { subtitleLabel } from "@/lib/subtitles"
import { mediaQuery } from "@/lib/viewport"
import {
  createPlayerStore,
  type PlayerStore,
  PlayerStoreContext,
  selectBurnedIn,
  selectHidden,
} from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { PartyHealthButton } from "./party/party-health"
import { playbackNotice } from "./playback-notices"
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
import { PlayerMenus } from "./player-menus"
import { PlayerStats } from "./player-stats"
import { SkipSegment } from "./skip-segment"
import type { TrickplayTiles } from "./trickplay-thumb"
import { type UpNext, UpNextCard } from "./up-next"
import { useHls } from "./use-hls"
import { type NowPlaying, useMediaSession } from "./use-media-session"
import { usePartyStatus } from "./use-party-status"
import { type PartyLink, usePartySync } from "./use-party-sync"
import { usePlayback } from "./use-playback"
import { usePlayerKeys } from "./use-player-keys"
import { usePresence } from "./use-presence"
import {
  type ProgressReport,
  usePlayedTime,
  useProgressReport,
} from "./use-progress-report"
import { useSubtitles } from "./use-subtitles"

const IDLE_MS = 2500

export type { Episodes }

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
  /** For an episode, the buttons for the one before and the one after. */
  episodes?: Episodes | null
  /**
   * The watch party this file plays in. The player then follows it, and
   * tells it when the viewer plays, pauses, or seeks.
   */
  party?: PartyLink | null
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

const coarsePointer = mediaQuery("(pointer: coarse)")

/**
 * Full-screen player. Space or K plays and pauses, arrows or J/L skip back
 * and ahead by the lengths in the settings, up and down change the volume, 0 to 9 jump
 * to a tenth of the way, M mutes, F toggles full screen, C turns subtitles
 * on and off, G and H show them earlier and later, I shows the playback
 * stats, and shift with P or N plays the previous or next episode. In a
 * watch party, playing, pausing, and seeking do so for
 * everyone in it.
 *
 * `start` is read once: the player mounts again for another file.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  // One store per player. It starts from the server's first answer and
  // the saved preferences.
  const saved = usePlayerPreferencesStore.getState()
  const { plan, sessionId, device, quality } = props.start
  const store = createPlayerStore({
    itemId: plan.item.id,
    sessionId,
    device,
    plan,
    source: sourceOf(plan, 0),
    picks: { quality },
    duration:
      plan.item.durationSeconds ?? plan.item.probe?.format.durationSeconds ?? 0,
    volume: saved.volume,
    muted: saved.muted,
  })
  // The server takes this playback for gone when its presence stream drops,
  // so the player holds one open for as long as it shows the session.
  usePresence(sessionId)
  // What the server does for the first answer, said once it plays.
  onSettled(() => playbackNotice(plan, null))
  return (
    <PlayerStoreContext value={store}>
      <Player {...props} store={store} />
    </PlayerStoreContext>
  )
}

/** Marks the player idle once the pointer and keyboard rest for `ms`. */
function useIdle(store: PlayerStore, ms: number) {
  onSettled(() => {
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
  })
}

function Player(props: VideoPlayerProps & { store: PlayerStore }) {
  const { store } = props
  const { view } = store
  let container: HTMLDivElement | undefined
  let video: HTMLVideoElement | undefined
  let pgsLayer: HTMLDivElement | undefined
  // What the subtitles rise above: the seek bar, and the times over it.
  let controls: HTMLDivElement | undefined
  const getVideo = () => video
  const getContainer = () => container
  const coarse = coarsePointer
  const preferences = usePlaybackPreferences()
  const skipBackSeconds = () => preferences().skipBackSeconds
  const skipForwardSeconds = () => preferences().skipForwardSeconds
  const playedTime = usePlayedTime()
  // The store's actions and session never change, so one read is enough.
  const actions = store.getState()
  const { sessionId } = actions
  const party = () => props.party ?? null
  const episodes = () => props.episodes ?? null

  const playback = usePlayback({
    video: getVideo,
    store,
    onUnplayable: () => props.onUnplayable(),
    onFailed: (cause) => props.onFailed(cause),
  })
  const { position, duration: lengthOf } = playback
  const sync = usePartySync(
    getVideo,
    store,
    { position, duration: lengthOf, seek: playback.seek },
    party,
  )
  usePartyStatus(getVideo, store, position, party)
  /** The viewer's own seek, which a party follows. */
  const seek = (to: number) => {
    // It brings back the button of a segment they skipped.
    actions.setSkipped(null)
    playback.seek(to)
    const link = party()
    if (link) sync.tell(link.playback.playing, to)
  }
  /**
   * Tells the party the viewer played or paused. Not when that only
   * catches up with it, as a press on play does where autoplay is blocked.
   */
  const tellPlaying = (playing: boolean) => {
    const link = party()
    if (link && playing !== link.playback.playing) {
      sync.tell(playing, position())
    }
  }

  const report = useProgressReport(
    getVideo,
    store,
    playedTime,
    (progress) => props.onProgress?.(progress),
    position,
    lengthOf,
  )

  useHls(getVideo, playback.hls, (code) => {
    playedTime.stop()
    actions.setWaiting(false)
    playback.onError(code)
  })
  useIdle(store, IDLE_MS)
  const hidden = createMemo(() => selectHidden(view))
  const subs = useSubtitles(store, {
    video: getVideo,
    controls: () => controls,
    pgsLayer: () => pgsLayer,
    lifted: () => !hidden(),
    offset: playback.offset,
    onSelect: playback.selectSubtitle,
    onPick: (trackId) => props.onPickTracks({ subtitle: { trackId } }),
  })
  // Keyboard focus holds the controls up. A click focuses a button too,
  // and a menu hands focus back to its button, but that shouldn't.
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target
    actions.setFocused(
      target instanceof Element && target.matches(":focus-visible"),
    )
  }
  const onFocusOut = (event: FocusEvent & { currentTarget: HTMLElement }) => {
    const next = event.relatedTarget
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      actions.setFocused(false)
    }
  }

  onSettled(() => {
    const el = video
    if (!el) return
    // The saved volume, before anything plays.
    el.volume = actions.volume
    el.muted = actions.muted
    // A video taken out of the page keeps its stream open, and buffering,
    // until the browser collects it. Unread, those streams fill the
    // connection to the server, and every request after them stalls. So
    // the player lets go of its stream when it goes.
    return () => {
      el.removeAttribute("src")
      el.load()
    }
  })

  const show = actions.showFlash
  const toggle = () => {
    const el = video
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
      by < 0 ? Rewind : FastForward,
      tr("player.flash.skip", { seconds: Math.abs(by) }),
    )
  }
  const jump = (digit: number) => {
    const target = (lengthOf() * digit) / 10
    actions.setTime(target)
    seek(target)
  }
  const setVolume = (value: number) => {
    const el = video
    if (!el) return
    el.volume = value
    el.muted = value === 0
  }
  const changeVolume = (by: number) => {
    const el = video
    if (!el) return
    const next = Math.round(Math.max(0, Math.min(1, el.volume + by)) * 100)
    setVolume(next / 100)
    show(next === 0 ? VolumeX : Volume2, formatPercent(next / 100))
  }
  const toggleMute = () => {
    const el = video
    if (!el) return
    el.muted = !el.muted
    show(
      el.muted ? VolumeX : Volume2,
      el.muted ? tr("player.flash.muted") : formatPercent(el.volume),
    )
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void container?.requestFullscreen()
  }
  const changeSpeed = (next: number) => {
    const el = video
    if (!el) return
    if (party()) {
      show(Gauge, tr("party.flash.speed"))
      return
    }
    // The default carries over when a new source loads.
    el.defaultPlaybackRate = next
    el.playbackRate = next
  }
  const moveSubtitles = (by: number) => {
    const state = store.getState()
    if (selectBurnedIn(state)) {
      show(Captions, tr("player.flash.subtitlesBurnedIn"))
      return
    }
    const next = state.subtitleDelay + by
    state.setSubtitleDelay(next)
    show(
      Captions,
      tr("player.flash.subtitleDelay", { delay: formatDelay(next) }),
    )
  }

  const menus = () => (
    <PlayerMenus
      playback={playback}
      subs={subs}
      split={coarse()}
      onSpeedChange={changeSpeed}
      onPickAudio={(audio) => props.onPickTracks({ audio })}
      container={getContainer}
    />
  )
  const transport = (big: boolean) => (
    <Transport
      big={big}
      episodes={episodes()}
      skipBackSeconds={skipBackSeconds()}
      skipForwardSeconds={skipForwardSeconds()}
      onSkip={skip}
      onToggle={toggle}
    />
  )

  usePlayerKeys({
    toggle,
    skip,
    skipBackSeconds,
    skipForwardSeconds,
    jump,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    toggleSubtitles: subs.toggle,
    moveSubtitles,
    toggleStats: () => actions.setStatsOpen(!store.getState().statsOpen),
    previous: () => episodes()?.previous ?? null,
    next: () => episodes()?.next ?? null,
  })

  useMediaSession(getVideo, {
    nowPlaying: () => props.nowPlaying,
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
    previous: () => episodes()?.previous ?? null,
    next: () => episodes()?.next ?? null,
  })

  const fades = "transition-opacity duration-300 motion-reduce:transition-none"

  return (
    <div
      ref={(el) => (container = el)}
      class={["fixed inset-0 bg-black text-white", { "cursor-none": hidden() }]}
    >
      {/* Clicks on the picture play and pause; keyboard users have Space.
          On touch screens a tap shows the controls instead. The store
          follows the video through its events. */}
      <video
        ref={(el) => (video = el)}
        playsinline
        class="size-full object-contain"
        onClick={() => {
          if (!coarse()) toggle()
        }}
        onDblClick={() => {
          if (!coarse()) toggleFullscreen()
        }}
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
          party()?.ended()
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
          playback.onBuffered()
          const el = event.currentTarget
          const offset = store.getState().source.offset
          for (let i = 0; i < el.buffered.length; i++) {
            if (el.buffered.start(i) <= el.currentTime) {
              actions.setBuffered(offset + el.buffered.end(i))
            }
          }
        }}
        onVolumeChange={(event) => {
          const { volume, muted } = event.currentTarget
          actions.setVolume(volume, muted)
          usePlayerPreferencesStore.getState().setVolume(volume, muted)
        }}
        onRateChange={(event) => {
          // Following a party changes the rate to catch up, which isn't
          // the viewer's speed.
          if (!party()) actions.setSpeed(event.currentTarget.playbackRate)
        }}
        onError={() => {
          playedTime.stop()
          actions.setWaiting(false)
          playback.onError()
        }}
        src={playback.src()}
      >
        {/* Keyed, so another track gets a `<track>` of its own. */}
        <Show when={subs.current()} keyed>
          {(current) => (
            <track
              data-track-id={current.track.id}
              kind="subtitles"
              srclang={current.track.language ?? undefined}
              label={subtitleLabel(current.track, subs.tracks())}
              src={current.src}
            />
          )}
        </Show>
      </video>
      {/* PGS subtitles draw here, over the picture. */}
      <div
        ref={(el) => (pgsLayer = el)}
        class="pointer-events-none absolute inset-0"
      />

      <Show when={view.statsOpen}>
        <PlayerStats video={getVideo} sessionId={sessionId} />
      </Show>

      <LoadingSpinner />
      <FlashNote />

      {/* On a touch screen, the menus go up top and play in the middle,
          flanked by the skips and the episodes, as in the phone app. */}
      <div
        onFocusIn={onFocusIn}
        onFocusOut={onFocusOut}
        class={[
          "absolute inset-x-0 top-0 flex items-center gap-3 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.8),rgb(0_0_0/0.5)_50%,transparent)] px-3 pt-3 pb-20 sm:px-5 sm:pt-4 [@media(pointer:coarse)]:gap-2 [@media(pointer:coarse)]:pt-2",
          fades,
          { "pointer-events-none opacity-0": hidden() },
        ]}
      >
        <ControlButton
          label={tr("player.back")}
          onClick={() => props.onBack()}
          class="[@media(pointer:coarse)]:size-13 [@media(pointer:coarse)]:[&_svg]:size-[26px]"
        >
          <Icon icon={ArrowLeft} />
        </ControlButton>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-lg leading-tight font-semibold tracking-[-0.5px] [text-shadow:0_1px_2px_rgb(0_0_0/0.5)] [@media(pointer:coarse)]:text-xl">
            {props.title}
          </h1>
          <Show when={props.subtitle}>
            <p class="truncate text-sm text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
              {props.subtitle}
            </p>
          </Show>
        </div>
        <Show when={party()}>
          {(link) => (
            <PartyHealthButton party={link()} container={getContainer} />
          )}
        </Show>
        <Show when={coarse()}>
          <div class="flex shrink-0 items-center gap-0.5 [@media(pointer:coarse)]:[&_button_svg]:size-6">
            {menus()}
            <FullscreenButton onToggle={toggleFullscreen} />
          </div>
        </Show>
      </div>

      <Show when={coarse()}>
        <div
          onFocusIn={onFocusIn}
          onFocusOut={onFocusOut}
          class={[
            "pointer-events-none absolute inset-0 grid place-items-center *:pointer-events-auto",
            fades,
            { "opacity-0 *:pointer-events-none": hidden() },
          ]}
        >
          {transport(true)}
        </div>
      </Show>

      {/* The seek bar runs the full width. With a mouse, the controls sit
          in a row under it; on a touch screen, nothing does. */}
      <div
        onFocusIn={onFocusIn}
        onFocusOut={onFocusOut}
        class={[
          "absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.85),rgb(0_0_0/0.45)_55%,transparent)] px-3 pt-24 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3 [@media(pointer:coarse)]:px-5",
          fades,
          { "pointer-events-none opacity-0": hidden() },
        ]}
      >
        <div ref={(el) => (controls = el)} class="flex flex-col">
          <Show when={coarse()}>
            <div class="flex items-center gap-3 px-1">
              <ElapsedTime />
              <span class="flex-1" />
              <EndsAt class="text-white/75" />
              <TotalTime />
            </div>
          </Show>
          <SeekBar trickplay={props.trickplay} onSeek={seek} />
        </div>
        <Show when={!coarse()}>
          <div class="flex items-center gap-0.5">
            {transport(false)}
            <VolumeControl onToggleMute={toggleMute} onChange={setVolume} />
            <div class="ml-2 flex items-center gap-1">
              <ElapsedTime />
              <span aria-hidden="true" class="text-sm text-white/60">
                /
              </span>
              <TotalTime />
            </div>
            <div class="ml-auto flex items-center gap-0.5">
              <EndsAt class="mr-2 hidden sm:block" />
              {menus()}
              <FullscreenButton onToggle={toggleFullscreen} />
            </div>
          </div>
        </Show>
      </div>

      {/* Last, so they're over the controls' gradient and take the clicks. */}
      <div class="absolute right-3 bottom-28 flex flex-col items-end gap-3 sm:right-5 sm:bottom-32">
        <SkipSegment
          segments={view.plan.segments}
          onSkip={(to) => {
            actions.setTime(to)
            seek(to)
          }}
        />
        <Show when={props.upNext}>
          {(upNext) => <UpNextCard upNext={upNext()} />}
        </Show>
      </div>
    </div>
  )
}
