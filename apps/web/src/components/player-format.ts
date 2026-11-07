import type { AudioTrack } from "@matinee/contracts"

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

// English like the rest of the interface, but on the viewer's own clock:
// 21:42 where they use 24 hours, 9:42 PM where they don't.
const clock = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
  hourCycle: new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions().hourCycle,
})

/** The wall-clock time of a moment, like `21:42`. */
export function formatClock(ms: number): string {
  return clock.format(ms)
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
  const layout = track.layout
  const parts = [
    !says([track.format, track.codec]) && track.format,
    layout && !says([layout, ...(LAYOUT_ALIASES.get(layout) ?? [])]) && layout,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : undefined
}

export function formatBitrate(bits: number): string {
  return bits >= 1_000_000
    ? `${Math.round(bits / 100_000) / 10} Mbps`
    : `${Math.round(bits / 1000)} kbps`
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
