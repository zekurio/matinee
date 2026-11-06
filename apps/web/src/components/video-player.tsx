import { Slider } from "@base-ui/react/slider"
import type { Subtitles } from "@matinee/contracts"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  ArrowLeftIcon,
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
  type FocusEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { SubtitlesMenu } from "./subtitles-menu"
import { useSubtitles } from "./use-subtitles"

const IDLE_MS = 2500
const SKIP_S = 10

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

/** True once the pointer and keyboard have rested for `ms`. */
function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
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
  }, [ms])
  return idle
}

const controlButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-full text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white [@media(pointer:coarse)]:size-11 [&_svg]:size-5"

function ControlButton({
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
function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  const Icon = direction === "back" ? RotateCcwIcon : RotateCwIcon
  return (
    <span aria-hidden className="relative grid place-items-center">
      <Icon className="!size-6" strokeWidth={1.75} />
      <span className="absolute pt-px text-[9px] leading-none font-semibold tabular-nums">
        {SKIP_S}
      </span>
    </span>
  )
}

/** The track used for seeking and volume: white on translucent white. */
function MediaSlider({
  ref,
  label,
  value,
  max,
  step,
  buffered,
  valueText,
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
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  className?: string
}) {
  const safeMax = max > 0 ? max : 1
  return (
    <Slider.Root
      ref={ref}
      value={Math.min(value, safeMax)}
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
      <Slider.Control className="flex h-8 w-full cursor-pointer touch-none items-center select-none [@media(pointer:coarse)]:h-11">
        <Slider.Track className="relative h-1 w-full rounded-full bg-white/35 transition-[height] group-hover/slider:h-1.5">
          {buffered !== undefined && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-white/35"
              style={{ width: `${Math.min(100, (buffered / safeMax) * 100)}%` }}
            />
          )}
          <Slider.Indicator className="rounded-full bg-white" />
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

export type ProgressReport = {
  positionSeconds: number
  durationSeconds?: number
  /** The page is going away; the request must survive it. */
  leaving?: boolean
}

const REPORT_EVERY_MS = 10_000

/**
 * Full-screen player with themed controls. Space or K plays and pauses,
 * arrows or J/L skip ten seconds, M mutes, F toggles full screen, C turns
 * subtitles on and off.
 */
export function VideoPlayer({
  src,
  title,
  subtitle,
  subtitles,
  subtitleSrc,
  startAt,
  onBack,
  onUnsupported,
  onProgress,
  onResumed,
}: {
  src: string
  title: string
  subtitle: string
  /** The file's subtitle tracks. Undefined while they load. */
  subtitles?: Subtitles
  /** Where a subtitle track's WebVTT loads from. */
  subtitleSrc: (trackId: string) => string
  /** Seconds to resume from once the video can seek. */
  startAt?: number
  onBack: () => void
  onUnsupported: () => void
  /** Called while playing, on pause and end, and when the player closes. */
  onProgress?: (report: ProgressReport) => void
  /** Called once playback has actually jumped to `startAt`. */
  onResumed?: (seconds: number) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  // The latest callback, read by the timer and unmount report.
  const progressRef = useRef(onProgress)
  useEffect(() => {
    progressRef.current = onProgress
  }, [onProgress])
  const resumed = useRef(false)

  const report = useCallback((leaving = false, ended = false) => {
    const el = video.current
    if (!el || el.currentTime <= 0) return
    const duration = Number.isFinite(el.duration) ? el.duration : undefined
    progressRef.current?.({
      positionSeconds: ended && duration ? duration : el.currentTime,
      durationSeconds: duration,
      leaving,
    })
  }, [])

  // Report while playing, and once more when the player goes away.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (video.current && !video.current.paused) report()
    }, REPORT_EVERY_MS)
    const onPageHide = () => report(true)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      report()
    }
  }, [report])
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [time, setTime] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const idle = useIdle(IDLE_MS)
  // Controls never hide while they hold keyboard focus or a menu is open.
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hidden = idle && playing && scrub === null && !focused && !menuOpen
  const subs = useSubtitles(subtitles, video, controls, !hidden)
  const toggleSubtitles = subs.toggle
  const focusHandlers = {
    onFocus: () => setFocused(true),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    },
  }

  const toggle = useCallback(() => {
    const el = video.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }, [])
  const skip = useCallback((by: number) => {
    const el = video.current
    if (el)
      el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + by))
  }, [])
  const toggleMute = useCallback(() => {
    const el = video.current
    if (el) el.muted = !el.muted
  }, [])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void container.current?.requestFullscreen()
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      // Sliders, buttons, and open menus handle their own keys.
      if (
        target?.closest(
          '[role="slider"], [role="menu"], [role="dialog"], input, textarea',
        )
      )
        return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const back = () => skip(-SKIP_S)
      const ahead = () => skip(SKIP_S)
      const actions = new Map([
        [" ", toggle],
        ["k", toggle],
        ["ArrowLeft", back],
        ["j", back],
        ["ArrowRight", ahead],
        ["l", ahead],
        ["m", toggleMute],
        ["f", toggleFullscreen],
        ["c", toggleSubtitles],
      ])
      const action = actions.get(event.key)
      if (!action) return
      if (event.key === " " && target?.closest("button")) return
      event.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle, skip, toggleMute, toggleFullscreen, toggleSubtitles])

  const VolumeIcon =
    muted || volume === 0
      ? VolumeXIcon
      : volume < 0.5
        ? Volume1Icon
        : Volume2Icon
  const shown = scrub ?? time

  return (
    <div
      ref={container}
      className={cn(
        "fixed inset-0 bg-black text-white",
        hidden && "cursor-none",
      )}
    >
      {/* Clicks on the picture play and pause; keyboard users have Space. */}
      <video
        ref={video}
        src={src}
        autoPlay
        playsInline
        className="size-full object-contain"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          report()
        }}
        onEnded={() => report(false, true)}
        onLoadedMetadata={(event) => {
          // Resume once, as soon as the file can seek.
          if (startAt && !resumed.current) {
            resumed.current = true
            event.currentTarget.currentTime = startAt
            onResumed?.(startAt)
          }
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onProgress={(event) => {
          const el = event.currentTarget
          for (let i = 0; i < el.buffered.length; i++) {
            if (el.buffered.start(i) <= el.currentTime) {
              setBuffered(el.buffered.end(i))
            }
          }
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onError={(event) => {
          if (
            event.currentTarget.error?.code ===
            MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ) {
            onUnsupported()
          }
        }}
      >
        {subs.current && (
          <track
            key={subs.current.id}
            data-track-id={subs.current.id}
            kind="subtitles"
            src={subtitleSrc(subs.current.id)}
            srcLang={subs.current.language ?? undefined}
            label={subs.current.label}
          />
        )}
      </video>

      {waiting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner className="size-8 text-white/80" />
        </div>
      )}

      <div
        {...focusHandlers}
        className={cn(
          "absolute inset-x-0 top-0 flex items-center gap-3 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.85),rgb(0_0_0/0.7)_45%,transparent)] p-4 pb-16 transition-opacity duration-300 motion-reduce:transition-none",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <ControlButton label="Back" onClick={onBack} className="bg-white/10">
          <ArrowLeftIcon />
        </ControlButton>
        <div className="min-w-0">
          <h1 className="truncate text-base font-medium [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {title}
          </h1>
          <p className="truncate text-[13px] text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {subtitle}
          </p>
        </div>
      </div>

      <div
        {...focusHandlers}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pt-16 pb-3 transition-opacity duration-300 motion-reduce:transition-none sm:px-6",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <MediaSlider
          ref={controls}
          label="Seek"
          value={shown}
          max={duration}
          step={1}
          buffered={buffered}
          valueText={(value) =>
            `${formatTime(value)} of ${formatTime(duration)}`
          }
          onChange={setScrub}
          onCommit={(value) => {
            if (video.current) video.current.currentTime = value
            setTime(value)
            setScrub(null)
          }}
        />
        <div className="mt-1 flex items-center gap-1">
          <ControlButton label={playing ? "Pause" : "Play"} onClick={toggle}>
            {playing ? (
              <PauseIcon className="fill-current" />
            ) : (
              <PlayIcon className="fill-current" />
            )}
          </ControlButton>
          <ControlButton label="Back 10 seconds" onClick={() => skip(-SKIP_S)}>
            <SkipIcon direction="back" />
          </ControlButton>
          <ControlButton
            label="Forward 10 seconds"
            onClick={() => skip(SKIP_S)}
          >
            <SkipIcon direction="forward" />
          </ControlButton>
          <div className="group/volume flex items-center">
            <ControlButton
              label={muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              <VolumeIcon />
            </ControlButton>
            <MediaSlider
              label="Volume"
              value={muted ? 0 : volume}
              max={1}
              step={0.05}
              valueText={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => {
                const el = video.current
                if (!el) return
                el.volume = value
                el.muted = value === 0
              }}
              className="hidden w-24 pr-2 sm:block"
            />
          </div>
          <span className="ml-2 text-[13px] text-white/80 tabular-nums">
            {formatTime(shown)} / {formatTime(duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {subs.tracks.length > 0 && (
              <SubtitlesMenu
                tracks={subs.tracks}
                selectedId={subs.selected}
                loading={subs.loading}
                onSelect={subs.select}
                onOpenChange={setMenuOpen}
                container={container}
                triggerClassName={controlButtonClass}
              />
            )}
            <ControlButton
              label={fullscreen ? "Exit full screen" : "Full screen"}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  )
}
