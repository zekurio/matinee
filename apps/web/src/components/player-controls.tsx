import { Slider } from "@base-ui/react/slider"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import {
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react"
import { useShallow } from "zustand/shallow"

import { tr } from "@/i18n"
import { selectBusy, usePlayerStore } from "@/stores/player"

import { formatClock, formatPercent, formatTime } from "./player-format"
import { type TrickplayTiles, TrickplayThumb } from "./trickplay-thumb"

export const SKIP_S = 10
export const VOLUME_STEP = 0.05
// How far the menu's buttons and G and H move the subtitles, as in mpv.
export const SUBTITLE_STEP_MS = 100
const FLASH_MS = 700

/** Text over the picture: 12px Red Hat reads thin there, so 14px, full white, and a shadow. */
const overlayTextClass =
  "text-sm font-medium text-white tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"

export const controlButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-full text-white/85 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white [@media(pointer:coarse)]:size-11 [&_svg]:size-5"

export function ControlButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(controlButtonClass, className)}
    >
      {children}
    </button>
  )
}

/** A circular arrow with the skip length inside it. */
export function SkipIcon({
  direction,
  className,
}: {
  direction: "back" | "forward"
  className?: string
}) {
  const Icon = direction === "back" ? RotateCcwIcon : RotateCwIcon
  return (
    <span aria-hidden className="relative grid place-items-center">
      <Icon className={cn("!size-6", className)} strokeWidth={1.75} />
      <span className="absolute pt-px text-[9px] leading-none font-bold tabular-nums">
        {SKIP_S}
      </span>
    </span>
  )
}

/** The thumb's width, `size-3.5`. Edge alignment keeps it inside the track. */
const THUMB_PX = 14

/** The track for seeking and volume: the accent on translucent white. */
export function MediaSlider({
  ref,
  label,
  value,
  max,
  step,
  buffered,
  valueText,
  renderPreview,
  previewAtThumb = false,
  onChange,
  onCommit,
  className,
}: {
  ref?: Ref<HTMLDivElement>
  label: string
  value: number
  max: number
  step: number
  buffered?: number
  valueText: (value: number) => string
  /**
   * Shown above the pointer, like the time it would seek to. It stays
   * inside the track by `--preview-inset`, half its width, when set.
   */
  renderPreview?: (value: number) => ReactNode
  /**
   * Show the preview over the thumb with its value while it's dragged,
   * rather than at the pointer. Touch has no pointer to hover with.
   */
  previewAtThumb?: boolean
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  className?: string
}) {
  const safeMax = max > 0 ? max : 1
  const shown = Math.min(value, safeMax)
  const [hover, setHover] = useState<{ x: number; value: number } | null>(null)
  const track = (event: PointerEvent<HTMLDivElement>) => {
    if (!renderPreview || event.pointerType === "touch") return
    const box = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(box.width, event.clientX - box.left))
    // The value a click here seeks to: with edge alignment the thumb's
    // centre runs half a thumb in from each end.
    const along = (x - THUMB_PX / 2) / Math.max(1, box.width - THUMB_PX)
    setHover({ x, value: Math.max(0, Math.min(1, along)) * safeMax })
  }
  // A drag shows exactly where it lets go; a hover follows the pointer.
  const previewAt = previewAtThumb
    ? {
        left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${shown / safeMax})`,
        value: shown,
      }
    : hover
      ? { left: `${hover.x}px`, value: hover.value }
      : null
  return (
    <Slider.Root
      ref={ref}
      value={shown}
      min={0}
      max={safeMax}
      step={step}
      onValueChange={(next) =>
        onChange(Array.isArray(next) ? (next[0] ?? 0) : next)
      }
      onValueCommitted={(next) =>
        onCommit?.(Array.isArray(next) ? (next[0] ?? 0) : next)
      }
      thumbAlignment="edge"
      className={cn("group/slider", className)}
    >
      {/* The track stays thin; the hit area is 32px, or 44px for touch. */}
      <Slider.Control
        onPointerMove={track}
        onPointerLeave={() => setHover(null)}
        className="relative flex h-8 w-full cursor-pointer touch-none items-center select-none [@media(pointer:coarse)]:h-11"
      >
        {renderPreview && previewAt && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2"
            style={{
              left: `clamp(var(--preview-inset, 0px), ${previewAt.left}, calc(100% - var(--preview-inset, 0px)))`,
            }}
          >
            {renderPreview(previewAt.value)}
          </span>
        )}
        <Slider.Track className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/slider:h-1.5">
          {buffered !== undefined && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${Math.min(100, (buffered / safeMax) * 100)}%` }}
            />
          )}
          {renderPreview && hover && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-white/20"
              style={{ width: hover.x }}
            />
          )}
          <Slider.Indicator className="bg-primary rounded-full" />
          <Slider.Thumb
            aria-label={label}
            getAriaValueText={(_formatted, current) => valueText(current)}
            className="size-3.5 rounded-full bg-white opacity-0 shadow transition-opacity outline-none group-hover/slider:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/60 data-dragging:opacity-100"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

/** What the seek bar shows above the pointer: the thumbnail there, and the time. */
function SeekPreview({
  time,
  trickplay,
}: {
  time: number
  trickplay: TrickplayTiles | null
}) {
  if (!trickplay) {
    return (
      <span className="block rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white tabular-nums shadow-lg ring-1 ring-white/15 backdrop-blur-md">
        {formatTime(time)}
      </span>
    )
  }
  return (
    <span className="flex flex-col items-center gap-1 rounded-lg bg-black/45 p-1 pb-1.5 text-xs font-medium text-white tabular-nums shadow-lg ring-1 ring-white/15 backdrop-blur-md">
      <TrickplayThumb
        tiles={trickplay}
        time={time}
        className="w-40 rounded-md sm:w-60"
      />
      {formatTime(time)}
    </span>
  )
}

/** The time, the seek bar, and the time left or the length. */
export function SeekBar({
  ref,
  trickplay,
  onSeek,
}: {
  ref?: Ref<HTMLDivElement>
  /** Thumbnails to show while hovering or dragging. */
  trickplay: TrickplayTiles | null
  onSeek: (to: number) => void
}) {
  const { shown, scrubbing, duration, buffered, setScrub, commitScrub } =
    usePlayerStore(
      useShallow((state) => ({
        // A drag, then a switch on its way, show where they're headed.
        shown: state.scrub ?? state.pending ?? state.time,
        scrubbing: state.scrub !== null,
        duration: state.duration,
        buffered: state.buffered,
        setScrub: state.setScrub,
        commitScrub: state.commitScrub,
      })),
    )
  const [remaining, setRemaining] = useState(true)
  const timeText = (value: number) =>
    tr("player.seekValue", {
      time: formatTime(value),
      duration: formatTime(duration),
    })

  return (
    <div className="flex items-center gap-3 px-1">
      <span className={cn("min-w-11", overlayTextClass)}>
        {formatTime(shown)}
      </span>
      <MediaSlider
        ref={ref}
        label={tr("player.seek")}
        value={shown}
        max={duration}
        step={1}
        buffered={buffered}
        valueText={timeText}
        renderPreview={(value) => (
          <SeekPreview time={value} trickplay={trickplay} />
        )}
        // Touch has no hover, so a drag shows where it's headed.
        previewAtThumb={scrubbing}
        onChange={setScrub}
        onCommit={(value) => {
          commitScrub(value)
          onSeek(value)
        }}
        className={cn(
          "flex-1",
          // Half the thumbnail and its padding, for 10rem and 15rem.
          trickplay && "[--preview-inset:5.25rem] sm:[--preview-inset:7.75rem]",
        )}
      />
      <button
        type="button"
        title={remaining ? tr("player.showLength") : tr("player.showTimeLeft")}
        onClick={() => setRemaining((on) => !on)}
        className={cn(
          "min-w-11 rounded text-right outline-none focus-visible:ring-2 focus-visible:ring-white",
          overlayTextClass,
        )}
      >
        {remaining
          ? `-${formatTime(Math.max(0, duration - shown))}`
          : formatTime(duration)}
      </button>
    </div>
  )
}

/**
 * When the video would end at this speed, as Jellyfin shows it. Playing,
 * each time update renders it again; paused or loading, the end moves on
 * with the clock, so a timer does.
 */
export function EndsAt({ className }: { className?: string }) {
  const { left, speed, advancing } = usePlayerStore(
    useShallow((state) => ({
      left: state.duration - (state.scrub ?? state.pending ?? state.time),
      speed: state.speed,
      advancing: state.playing && !state.waiting && state.scrub === null,
    })),
  )
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (advancing) return
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [advancing])
  if (!(left > 0) || !(speed > 0)) return null
  // Read in render, right after the time update it pairs with. A clock
  // kept in state would lag it and flicker the minute near a boundary.
  const end = Date.now() + (left / speed) * 1000
  return (
    <span className={cn(overlayTextClass, className)}>
      {tr("player.endsAt", { time: formatClock(end) })}
    </span>
  )
}

export function PlayButton({ onToggle }: { onToggle: () => void }) {
  const playing = usePlayerStore((state) => state.playing)
  return (
    <ControlButton
      label={playing ? tr("player.pauseKey") : tr("player.playKey")}
      onClick={onToggle}
    >
      {playing ? (
        <PauseIcon className="fill-current" />
      ) : (
        <PlayIcon className="fill-current" />
      )}
    </ControlButton>
  )
}

/** The spinner while loading, or a big play button over the picture. */
export function CenterControls({
  coarse,
  hidden,
  onToggle,
}: {
  /** On touch screens the button stays while the controls show. */
  coarse: boolean
  hidden: boolean
  onToggle: () => void
}) {
  const { busy, playing } = usePlayerStore(
    useShallow((state) => ({
      busy: selectBusy(state),
      playing: state.playing,
    })),
  )
  const button = !busy && (!playing || (coarse && !hidden))
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {busy && <Spinner className="size-10 text-white/85" />}
      {button && (
        <button
          type="button"
          aria-label={playing ? tr("player.pause") : tr("player.play")}
          onClick={onToggle}
          className="pointer-events-auto grid size-18 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none [&_svg]:size-8"
        >
          {playing ? (
            <PauseIcon className="fill-current" />
          ) : (
            <PlayIcon className="translate-x-0.5 fill-current" />
          )}
        </button>
      )}
    </div>
  )
}

/** The mute button, with a volume slider that opens on hover or focus. */
export function VolumeControl({
  onToggleMute,
  onChange,
}: {
  onToggleMute: () => void
  onChange: (volume: number) => void
}) {
  const { volume, muted } = usePlayerStore(
    useShallow((state) => ({ volume: state.volume, muted: state.muted })),
  )
  const VolumeIcon =
    muted || volume === 0
      ? VolumeXIcon
      : volume < 0.5
        ? Volume1Icon
        : Volume2Icon
  return (
    <div className="group/volume flex items-center">
      <ControlButton
        label={muted ? tr("player.unmuteKey") : tr("player.muteKey")}
        onClick={onToggleMute}
      >
        <VolumeIcon />
      </ControlButton>
      {/* Opens on hover or focus, like most players. */}
      <div className="hidden w-0 overflow-hidden transition-[width] duration-200 group-focus-within/volume:w-24 group-hover/volume:w-24 motion-reduce:transition-none sm:block">
        <MediaSlider
          label={tr("player.volume")}
          value={muted ? 0 : volume}
          max={1}
          step={VOLUME_STEP}
          valueText={formatPercent}
          onChange={onChange}
          className="w-24 px-2"
        />
      </div>
    </div>
  )
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange)
  return () => document.removeEventListener("fullscreenchange", onChange)
}

function isFullscreen() {
  return document.fullscreenElement !== null
}

export function FullscreenButton({ onToggle }: { onToggle: () => void }) {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen)
  return (
    <ControlButton
      label={
        fullscreen ? tr("player.exitFullscreenKey") : tr("player.fullscreenKey")
      }
      onClick={onToggle}
    >
      {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
    </ControlButton>
  )
}

/** A short note over the picture, like the volume after a key press. */
export function FlashNote() {
  const flash = usePlayerStore((state) => state.flash)
  const hideFlash = usePlayerStore((state) => state.hideFlash)
  // A timer clears each note; a newer one starts its own.
  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(hideFlash, FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])
  if (!flash) return null
  return (
    <div
      key={flash.id}
      aria-hidden
      className="animate-in fade-in-0 zoom-in-95 pointer-events-none absolute top-1/4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium tabular-nums backdrop-blur-md duration-150 [&_svg]:size-4"
    >
      {flash.Icon && <flash.Icon />}
      {flash.text}
    </div>
  )
}
