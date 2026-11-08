import type { AudioTrack } from "@matinee/contracts"

import { perLocale, tr } from "@/i18n"

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

// In the interface's language, like the rest of it, but on the viewer's
// own clock: 21:42 where they use 24 hours, 9:42 PM where they don't.
const clock = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      hourCycle: new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
      }).resolvedOptions().hourCycle,
    }),
)

/** The wall-clock time of a moment, like `21:42`. */
export function formatClock(ms: number): string {
  return clock().format(ms)
}

const percents = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
)

/** A volume like `0.45` as `45%`, or `45 %` where that's the custom. */
export function formatPercent(fraction: number): string {
  return percents().format(fraction)
}

const delays = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      signDisplay: "exceptZero",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

/** A subtitle delay in milliseconds, like `+0.3 s`, `-1.5 s`, or `0.0 s`. */
export function formatDelay(ms: number): string {
  return tr("player.subtitles.delayValue", {
    seconds: delays().format(ms / 1000),
  })
}

// Other ways a track title may say a layout.
const LAYOUT_ALIASES = new Map([
  ["Mono", ["1.0"]],
  ["Stereo", ["2.0"]],
])

/**
 * `E-AC-3 5.1`, `AAC Stereo`, without what the label already says: a track
 * titled `German FLAC Stereo` gets nothing. Jellyfin does the same.
 */
export function audioDetail(track: AudioTrack): string | undefined {
  const label = track.label.toLowerCase()
  const says = (names: string[]) =>
    names.some((name) => label.includes(name.toLowerCase()))
  // The server writes "6 channels" for a count no layout fits.
  const layout =
    track.channels !== null && track.layout === `${track.channels} channels`
      ? tr("media.channels", { count: track.channels })
      : track.layout
  const parts = [
    !says([track.format, track.codec]) && track.format,
    layout && !says([layout, ...(LAYOUT_ALIASES.get(layout) ?? [])]) && layout,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : undefined
}

export function formatBitrate(bits: number): string {
  return bits >= 1_000_000
    ? tr("player.bitrate.mbps", { value: Math.round(bits / 100_000) / 10 })
    : tr("player.bitrate.kbps", { value: Math.round(bits / 1000) })
}

/** `1080p` for a 1920×800 scope picture too: what fits the frame. */
export function resolutionName(width: number, height: number): string {
  const frames = [
    [3840, 2160],
    [2560, 1440],
    [1920, 1080],
    [1280, 720],
    [854, 480],
  ]
  for (const [w = 0, h = 0] of frames) {
    if (width >= w * 0.9 || height >= h * 0.9) return `${h}p`
  }
  return `${height}p`
}
