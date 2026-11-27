import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/solid/slider"
import {
  FastForward,
  Maximize,
  Minimize,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
} from "solid-js"

import {
  formatClock,
  formatPercent,
  formatTime,
} from "@/components/player-format"
import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { viewport } from "@/lib/viewport"
import { selectBusy, usePlayerStore, usePlayerStoreApi } from "@/stores/player"

import { type TrickplayTiles, TrickplayThumb } from "./trickplay-thumb"

export const VOLUME_STEP = 0.05
// How far the menu's buttons and G and H move the subtitles, as in mpv.
export const SUBTITLE_STEP_MS = 100
const FLASH_MS = 700

/** Text over the picture: 12px Red Hat reads thin there, so 14px, full white, and a shadow. */
const overlayTextClass =
  "text-sm font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"

export const controlButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-full text-white/85 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white [@media(pointer:coarse)]:size-11 [&_svg]:size-5"

export function ControlButton(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: JSX.Element
  class?: string
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={() => props.onClick()}
      disabled={props.disabled ?? false}
      class={cn(
        controlButtonClass,
        "disabled:pointer-events-none disabled:opacity-40",
        props.class,
      )}
    >
      {props.children}
    </button>
  )
}

/** The thumb's width, `size-3.5`. The rail is inset by half of it, so the thumb stays on the track. */
const THUMB_PX = 14

/** Where `value` sits between `from` and `to`, from 0 to 1. */
function ramp(value: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (value - from) / (to - from)))
}

/**
 * A finger dragging the thumb. It moves the value by how far it travels
 * rather than to where it is, so a slow drag can move a little at a time.
 */
type TouchDrag = {
  pointer: number
  x: number
  at: number
  /** Smoothed speed, in px per ms. */
  speed: number
  /** Where the drag has the value, or null before it changes it. */
  value: number | null
  /** Committed, on release or cancel. */
  done: boolean
}

// Speeds in px per ms. At 0.04 (a finger creeping) a pixel moves a tenth
// as far as it would at 0.5, a normal drag, which moves it the full way.
const FINE_SPEED = 0.04
const FULL_SPEED = 0.5
const FINEST_GAIN = 0.1
// No finer than this, so a short video doesn't crawl.
const FINEST_PER_PX = 0.25
// From 0.25 a thumb behind the finger catches up to it, quicker the faster
// it moves, up to 35% of the gap per event.
const CATCH_UP_SPEED = 0.25
const CATCH_UP_FULL_SPEED = 1
const CATCH_UP_RATE = 0.35

/**
 * The value a touch drag moves to. The thumb trails a slow finger and
 * catches up with a quick one, and a finger past either end of the track
 * takes it to that end.
 */
function touchDragValue(drag: {
  from: number
  dx: number
  speed: number
  x: number
  left: number
  width: number
  max: number
}): number {
  const { from, dx, speed, x, left, width, max } = drag
  const travel = Math.max(1, width - THUMB_PX)
  const perPx = max / travel
  const finest = Math.min(1, Math.max(FINEST_GAIN, FINEST_PER_PX / perPx))
  const gain = finest + (1 - finest) * ramp(speed, FINE_SPEED, FULL_SPEED)
  let next = from + dx * perPx * gain
  const under =
    Math.max(0, Math.min(1, (x - left - THUMB_PX / 2) / travel)) * max
  // Only toward the finger, so the thumb never runs against it.
  if ((under - next) * Math.sign(dx) > 0) {
    const outside = x < left || x > left + width
    const rate = outside
      ? 1
      : CATCH_UP_RATE * ramp(speed, CATCH_UP_SPEED, CATCH_UP_FULL_SPEED)
    next += (under - next) * rate
  }
  return Math.max(0, Math.min(max, next))
}

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])
// A step the slider took from the keyboard or a screen reader.
const KEY_REASONS = new Set(["step-key", "accessibility-adjust"])

/** The track for seeking and volume: the accent on translucent white. */
function MediaSlider(props: {
  label: string
  value: number
  max: number
  step: number
  buffered?: number
  valueText: (value: number) => string
  /**
   * Shown above the pointer, like the time it would seek to. With
   * `--preview-inset` set to half its width, it stays inside the nearest
   * `data-preview-bounds` parent, or the track without one.
   */
  renderPreview?: (value: Accessor<number>) => JSX.Element
  /**
   * Show the preview over the thumb with its value while it's dragged,
   * rather than at the pointer. Touch has no pointer to hover with.
   */
  previewAtThumb?: boolean
  /**
   * Drag by touch relative to where the finger started, slower the slower
   * it moves, for a value too long to set to the pixel.
   */
  preciseTouch?: boolean
  /**
   * Leave the arrow keys to the player's shortcuts while focused, so they
   * skip and change the volume as they do anywhere else in the player.
   */
  playerKeys?: boolean
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  class?: string
}) {
  const safeMax = () => (props.max > 0 ? props.max : 1)
  const shown = () => Math.min(props.value, safeMax())
  const [hover, setHover] = createSignal<{ x: number; value: number } | null>(
    null,
  )
  let control: HTMLDivElement | undefined
  let drag: TouchDrag | null = null

  const moveDrag = (event: PointerEvent, box: DOMRect) => {
    const current = drag
    if (!current || current.done || current.pointer !== event.pointerId) return
    const dx = event.clientX - current.x
    if (dx === 0) return
    const sample = Math.abs(dx) / Math.max(1, event.timeStamp - current.at)
    current.speed = current.speed * 0.6 + sample * 0.4
    current.x = event.clientX
    current.at = event.timeStamp
    current.value = touchDragValue({
      from: current.value ?? shown(),
      dx,
      speed: current.speed,
      x: event.clientX,
      left: box.left,
      width: box.width,
      max: safeMax(),
    })
    props.onChange(current.value)
  }
  // Idempotent: release, cancel, and the slider's own commit all end it.
  const endDrag = () => {
    const current = drag
    if (!current || current.done) return
    current.done = true
    if (current.value !== null) props.onCommit?.(current.value)
  }

  onSettled(() => {
    const el = control
    if (!el) return
    // In the capture phase, so a touch drag starts before the slider takes
    // the press.
    const start = (event: PointerEvent) => {
      drag =
        props.preciseTouch && event.pointerType !== "mouse"
          ? {
              pointer: event.pointerId,
              x: event.clientX,
              at: event.timeStamp,
              speed: 0,
              value: null,
              done: false,
            }
          : null
    }
    const track = (event: PointerEvent) => {
      const box = el.getBoundingClientRect()
      moveDrag(event, box)
      if (!props.renderPreview || event.pointerType === "touch") return
      const x = Math.max(0, Math.min(box.width, event.clientX - box.left))
      // The value a click here seeks to: the thumb's centre runs half a
      // thumb in from each end.
      const along = (x - THUMB_PX / 2) / Math.max(1, box.width - THUMB_PX)
      setHover({ x, value: Math.max(0, Math.min(1, along)) * safeMax() })
    }
    const leave = () => setHover(null)
    // The slider skips nothing it's given, so the seek bar hands the
    // arrows to the player's listener on the window instead.
    const keys = (event: KeyboardEvent) => {
      if (!props.playerKeys || !ARROW_KEYS.has(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.key,
          shiftKey: event.shiftKey,
        }),
      )
    }
    el.addEventListener("pointerdown", start, true)
    el.addEventListener("pointermove", track)
    el.addEventListener("pointerup", endDrag)
    el.addEventListener("pointercancel", endDrag)
    el.addEventListener("lostpointercapture", endDrag)
    el.addEventListener("pointerleave", leave)
    el.addEventListener("keydown", keys, true)
    return () => {
      el.removeEventListener("pointerdown", start, true)
      el.removeEventListener("pointermove", track)
      el.removeEventListener("pointerup", endDrag)
      el.removeEventListener("pointercancel", endDrag)
      el.removeEventListener("lostpointercapture", endDrag)
      el.removeEventListener("pointerleave", leave)
      el.removeEventListener("keydown", keys, true)
    }
  })

  // The preview may hang past the track's ends, over the times beside it,
  // as far as the nearest `data-preview-bounds` parent.
  onSettled(() => {
    const element = control
    const bounds = element?.parentElement?.closest("[data-preview-bounds]")
    if (!element || !bounds) return
    const measure = () => {
      const inner = element.getBoundingClientRect()
      const outer = bounds.getBoundingClientRect()
      element.style.setProperty(
        "--preview-room-start",
        `${Math.max(0, inner.left - outer.left)}px`,
      )
      element.style.setProperty(
        "--preview-room-end",
        `${Math.max(0, outer.right - inner.right)}px`,
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(bounds)
    return () => observer.disconnect()
  })

  // A drag shows exactly where it lets go; a hover follows the pointer.
  const previewAt = createMemo(() => {
    if (props.previewAtThumb) {
      return {
        left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${shown() / safeMax()})`,
        value: shown(),
      }
    }
    const at = hover()
    return at ? { left: `${at.x}px`, value: at.value } : null
  })
  const fraction = () => shown() / safeMax()

  return (
    <Slider
      value={shown()}
      min={0}
      max={safeMax()}
      step={props.step}
      format={(value: number) => props.valueText(value)}
      onValueChange={(next, details) => {
        const value = Array.isArray(next) ? (next[0] ?? 0) : next
        const current = drag
        if (current && !KEY_REASONS.has(details.reason)) {
          // A touch drag moves the value itself; a press still jumps.
          if (current.done || details.reason !== "track-press") {
            details.cancel()
            return
          }
          current.value = value
        }
        props.onChange(value)
      }}
      onValueCommit={(next, details) => {
        if (drag && !KEY_REASONS.has(details.reason)) {
          endDrag()
          return
        }
        props.onCommit?.(Array.isArray(next) ? (next[0] ?? 0) : next)
      }}
      class={cn("group/slider", props.class)}
    >
      {/* The bar stays thin; the hit area is 32px, or 44px for touch. */}
      <SliderControl
        ref={(el: HTMLDivElement) => (control = el)}
        class="relative flex h-8 w-full cursor-pointer touch-none items-center select-none [@media(pointer:coarse)]:h-11"
      >
        <Show when={props.renderPreview && previewAt()}>
          {(at) => (
            <span
              aria-hidden="true"
              class="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2"
              style={{
                left: `clamp(calc(var(--preview-inset, 0px) - var(--preview-room-start, 0px)), ${at().left}, calc(100% - var(--preview-inset, 0px) + var(--preview-room-end, 0px)))`,
              }}
            >
              {props.renderPreview?.(() => at().value)}
            </span>
          )}
        </Show>
        {/* Grows on hover by scale, which needs no layout. */}
        <span
          aria-hidden="true"
          class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 scale-y-[0.6667] rounded-full bg-white/25 transition-[scale] group-hover/slider:scale-y-100"
        >
          <Show when={props.buffered}>
            {(buffered) => (
              <span
                class="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{
                  width: `${Math.min(100, (buffered() / safeMax()) * 100)}%`,
                }}
              />
            )}
          </Show>
          <Show when={props.renderPreview && hover()}>
            {(at) => (
              <span
                class="absolute inset-y-0 left-0 rounded-full bg-white/20"
                style={{ width: `${at().x}px` }}
              />
            )}
          </Show>
          <span
            class="bg-primary absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${fraction()})`,
            }}
          />
        </span>
        {/* The rail the thumb moves on, inset by half a thumb at each end,
            so the thumb stays over the bar and a press at an end reaches it. */}
        <SliderTrack class="mx-[7px] h-full flex-1">
          <SliderThumb
            aria-label={props.label}
            data-player-keys={props.playerKeys ? "" : undefined}
            class="size-3.5 rounded-full bg-white opacity-0 shadow transition-opacity outline-none group-hover/slider:opacity-100 has-[:focus-visible]:opacity-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/60 data-dragging:opacity-100"
          />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}

/** What the seek bar shows above the pointer: the thumbnail there, and the time. */
function SeekPreview(props: {
  time: Accessor<number>
  trickplay: TrickplayTiles | null
}) {
  return (
    <Show
      when={props.trickplay}
      fallback={
        <span class="block rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md">
          {formatTime(props.time())}
        </span>
      }
    >
      {(tiles) => (
        <span class="flex flex-col items-center gap-1 rounded-lg bg-black/45 p-1 pb-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md">
          <TrickplayThumb
            tiles={tiles()}
            time={props.time()}
            class="w-40 rounded-md sm:w-60"
          />
          {formatTime(props.time())}
        </span>
      )}
    </Show>
  )
}

/** Where the seek bar shows: a drag, then a switch on its way, show where they're headed. */
function selectShown(state: {
  scrub: number | null
  pending: number | null
  time: number
}): number {
  return state.scrub ?? state.pending ?? state.time
}

/**
 * The seek bar, the full width of the controls. The times are beside it in
 * the controls rather than at its ends.
 */
export function SeekBar(props: {
  /** Thumbnails to show while hovering or dragging. */
  trickplay: TrickplayTiles | null
  onSeek: (to: number) => void
}) {
  const actions = usePlayerStoreApi().getState()
  const shown = usePlayerStore(selectShown)
  const scrubbing = usePlayerStore((state) => state.scrub !== null)
  const duration = usePlayerStore((state) => state.duration)
  const buffered = usePlayerStore((state) => state.buffered)
  const timeText = (value: number) =>
    tr("player.seekValue", {
      time: formatTime(value),
      duration: formatTime(duration()),
    })

  return (
    <div data-preview-bounds>
      <MediaSlider
        label={tr("player.seek")}
        value={shown()}
        max={duration()}
        step={1}
        buffered={buffered()}
        valueText={timeText}
        renderPreview={(value) => (
          <SeekPreview time={value} trickplay={props.trickplay} />
        )}
        // Touch has no hover, so a drag shows where it's headed.
        previewAtThumb={scrubbing()}
        preciseTouch
        playerKeys
        onChange={actions.setScrub}
        onCommit={(value) => {
          actions.commitScrub(value)
          props.onSeek(value)
        }}
        // Half the thumbnail and its padding, for 10rem and 15rem.
        class={
          props.trickplay
            ? "[--preview-inset:5.25rem] sm:[--preview-inset:7.75rem]"
            : undefined
        }
      />
    </div>
  )
}

/** How far the video is, or where the seek bar is headed. */
export function ElapsedTime(props: { class?: string }) {
  const shown = usePlayerStore(selectShown)
  return (
    <span class={cn(overlayTextClass, props.class)}>{formatTime(shown())}</span>
  )
}

/** The video's length, shown after the elapsed time. */
export function TotalTime(props: { class?: string }) {
  const duration = usePlayerStore((state) => state.duration)
  return (
    <span class={cn(overlayTextClass, props.class)}>
      {formatTime(duration())}
    </span>
  )
}

/**
 * When the video would end at this speed, as Jellyfin shows it. Playing,
 * each time update works it out again; paused or loading, the end moves on
 * with the clock, so a timer does.
 */
export function EndsAt(props: { class?: string }) {
  const left = usePlayerStore((state) => state.duration - selectShown(state))
  const speed = usePlayerStore((state) => state.speed)
  const advancing = createMemo(
    usePlayerStore(
      (state) => state.playing && !state.waiting && state.scrub === null,
    ),
  )
  const [tick, setTick] = createSignal(0)
  createEffect(advancing, (moving) => {
    if (moving) return
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  })
  // Read with the time update it pairs with. A clock kept apart would lag
  // it and flicker the minute near a boundary.
  const text = createMemo(() => {
    tick()
    const remaining = left()
    const rate = speed()
    if (!(remaining > 0) || !(rate > 0)) return null
    return tr("player.endsAt", {
      time: formatClock(Date.now() + (remaining / rate) * 1000),
    })
  })
  return (
    <Show when={text()}>
      {(shown) => (
        <span class={cn(overlayTextClass, props.class)}>{shown()}</span>
      )}
    </Show>
  )
}

/** The episodes either side of this one, for a show's file. */
export type Episodes = {
  /** Null for a show's first episode. */
  previous: (() => void) | null
  /** Null for a show's last episode. */
  next: (() => void) | null
}

/** Play and pause, as one of the controls or the big one in the middle. */
function PlayButton(props: { big: boolean; onToggle: () => void }) {
  const playing = usePlayerStore((state) => state.playing)
  const label = () =>
    props.big
      ? playing()
        ? tr("player.pause")
        : tr("player.play")
      : playing()
        ? tr("player.pauseKey")
        : tr("player.playKey")
  return (
    <ControlButton
      label={label()}
      onClick={props.onToggle}
      class={
        props.big
          ? "size-24 text-white drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)] [&_svg]:size-12 [@media(pointer:coarse)]:size-24"
          : undefined
      }
    >
      <Show
        when={playing()}
        fallback={
          <Icon
            icon={Play}
            class={["fill-current", { "translate-x-0.5": props.big }]}
          />
        }
      >
        <Icon icon={Pause} class="fill-current" />
      </Show>
    </ControlButton>
  )
}

/**
 * Play, with the skips on either side of it and, for an episode, the
 * previous and next episodes outside those, as the phone app has them.
 * `big` is the row in the middle of a touch screen; without it, the row
 * starts the control bar. While the video loads, the big play button
 * leaves its place to the spinner.
 */
export function Transport(props: {
  big: boolean
  episodes: Episodes | null
  skipBackSeconds: number
  skipForwardSeconds: number
  onSkip: (by: number) => void
  onToggle: () => void
}) {
  const busy = usePlayerStore(selectBusy)
  const side = () =>
    props.big
      ? "size-16 [@media(pointer:coarse)]:size-16 [&_svg]:size-[30px]"
      : undefined
  const skip = () =>
    props.big
      ? "size-[72px] [@media(pointer:coarse)]:size-[72px] [&_svg]:size-10"
      : undefined
  // The Flutter phone's middle row: 96 play, 72 skips, 64 episodes, and
  // gaps that narrow from 32 before the buttons shrink together.
  const fit = () => {
    if (!props.big) return 1
    const widths = 96 + 72 * 2 + (props.episodes ? 64 * 2 : 0)
    const gaps = 8 * (props.episodes ? 4 : 2)
    return Math.min(1, viewport().width / (widths + gaps))
  }
  const skipButton = (props2: {
    icon: typeof RotateCcw
    label: string
    seconds: number
    by: number
  }) => (
    <ControlButton
      label={props2.label}
      onClick={() => props.onSkip(props2.by)}
      class={skip()}
    >
      <Show
        when={props.big}
        fallback={
          <Icon
            icon={props2.by < 0 ? Rewind : FastForward}
            class="fill-current"
          />
        }
      >
        <span class="relative grid place-items-center">
          <Icon icon={props2.icon} />
          <span
            aria-hidden="true"
            class="text-10px absolute pt-1 leading-none font-semibold"
          >
            {props2.seconds}
          </span>
        </span>
      </Show>
    </ControlButton>
  )
  return (
    <div
      class={cn("flex items-center", props.big ? "gap-2 sm:gap-8" : "gap-0.5")}
      style={{ transform: props.big ? `scale(${fit()})` : undefined }}
    >
      <Show when={props.episodes}>
        {(episodes) => (
          <ControlButton
            label={tr("player.previousEpisode")}
            onClick={() => episodes().previous?.()}
            disabled={episodes().previous === null}
            class={side()}
          >
            <Icon icon={SkipBack} class="fill-current" />
          </ControlButton>
        )}
      </Show>
      {skipButton({
        icon: RotateCcw,
        label: tr("player.skipBack", { seconds: props.skipBackSeconds }),
        seconds: props.skipBackSeconds,
        by: -props.skipBackSeconds,
      })}
      <Show
        when={props.big && busy()}
        fallback={<PlayButton big={props.big} onToggle={props.onToggle} />}
      >
        {/* The spinner in the middle of the player shows here. */}
        <span aria-hidden="true" class="size-24" />
      </Show>
      {skipButton({
        icon: RotateCw,
        label: tr("player.skipForward", {
          seconds: props.skipForwardSeconds,
        }),
        seconds: props.skipForwardSeconds,
        by: props.skipForwardSeconds,
      })}
      <Show when={props.episodes}>
        {(episodes) => (
          <ControlButton
            label={tr("player.nextEpisode")}
            onClick={() => episodes().next?.()}
            disabled={episodes().next === null}
            class={side()}
          >
            <Icon icon={SkipForward} class="fill-current" />
          </ControlButton>
        )}
      </Show>
    </div>
  )
}

/** The spinner in the middle of the player while the video loads. */
export function LoadingSpinner() {
  const busy = usePlayerStore(selectBusy)
  return (
    <Show when={busy()}>
      <div class="pointer-events-none absolute inset-0 grid place-items-center">
        <Spinner class="size-10 text-white/85" />
      </div>
    </Show>
  )
}

/** The mute button, with a volume slider that opens on hover or focus. */
export function VolumeControl(props: {
  onToggleMute: () => void
  onChange: (volume: number) => void
}) {
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const icon = () =>
    muted() || volume() === 0 ? VolumeX : volume() < 0.5 ? Volume1 : Volume2
  return (
    <div class="group/volume flex items-center">
      <ControlButton
        label={muted() ? tr("player.unmuteKey") : tr("player.muteKey")}
        onClick={props.onToggleMute}
      >
        <Icon icon={icon()} />
      </ControlButton>
      {/* Opens on hover or focus, like most players. It pushes the times
          along as it opens, so it's the one width that animates. */}
      <div class="hidden w-0 overflow-hidden transition-[width] duration-200 group-focus-within/volume:w-24 group-hover/volume:w-24 motion-reduce:transition-none sm:block">
        <MediaSlider
          label={tr("player.volume")}
          value={muted() ? 0 : volume()}
          max={1}
          step={VOLUME_STEP}
          valueText={formatPercent}
          onChange={props.onChange}
          class="w-24 px-2"
        />
      </div>
    </div>
  )
}

export function FullscreenButton(props: { onToggle: () => void }) {
  const [fullscreen, setFullscreen] = createSignal(
    document.fullscreenElement !== null,
  )
  onSettled(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  })
  return (
    <ControlButton
      label={
        fullscreen()
          ? tr("player.exitFullscreenKey")
          : tr("player.fullscreenKey")
      }
      onClick={props.onToggle}
    >
      <Icon icon={fullscreen() ? Minimize : Maximize} />
    </ControlButton>
  )
}

/** A short note over the picture, like the volume after a key press. */
export function FlashNote() {
  const flash = usePlayerStore((state) => state.flash)
  const { hideFlash } = usePlayerStoreApi().getState()
  // A timer clears each note; a newer one starts its own.
  createEffect(flash, (note) => {
    if (!note) return
    const timer = window.setTimeout(hideFlash, FLASH_MS)
    return () => window.clearTimeout(timer)
  })
  // Keyed, so each note mounts anew and plays its entrance again.
  return (
    <Show when={flash()} keyed>
      {(note) => (
        <div
          aria-hidden="true"
          class="animate-in fade-in-0 zoom-in-95 pointer-events-none absolute top-1/4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium backdrop-blur-md duration-150 [&_svg]:size-4"
        >
          <Show when={note.icon}>{(icon) => <Icon icon={icon()} />}</Show>
          {note.text}
        </div>
      )}
    </Show>
  )
}
