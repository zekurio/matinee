import {
  PLAYBACK_QUALITIES,
  type PlaybackMethod,
  type PlaybackQuality,
  type StatsRange,
  type StatsUnit,
  videoCodecName,
} from "@matinee/contracts"

import { perLocale, tr } from "@/i18n"

import { formatMonth } from "./format"

/** What the range chips say. */
export function rangeName(range: StatsRange): string {
  return tr(`stats.range.${range}`)
}

/** How a sentence ends for the range: "in the last 30 days". */
export function rangePhrase(range: StatsRange): string {
  return tr(`stats.period.${range}`)
}

/** The visitor's time zone, so days and hours match their clock. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function methodName(method: PlaybackMethod): string {
  return tr(`stats.method.${method}`)
}

const ACCELERATIONS = new Map([
  ["vaapi", "VAAPI"],
  ["qsv", "Quick Sync"],
  ["nvenc", "NVENC"],
  ["videotoolbox", "VideoToolbox"],
])

const SOFTWARE_ENCODERS = new Map([
  ["libx264", "x264"],
  ["libx265", "x265"],
  ["libsvtav1", "SVT-AV1"],
])

/** `VAAPI H.264` for `h264_vaapi`, `x264 (CPU)` for `libx264`. */
export function encoderName(encoder: string): string {
  const software = SOFTWARE_ENCODERS.get(encoder)
  if (software) return `${software} (CPU)`
  const [codec = encoder, acceleration = ""] = encoder.split("_")
  const name = ACCELERATIONS.get(acceleration)
  return name ? `${name} ${videoCodecName(codec)}` : encoder
}

const SOFTWARE_CODECS = new Map([
  ["libx264", "h264"],
  ["libx265", "hevc"],
  ["libsvtav1", "av1"],
])

/** What an encoder makes: `H.264` for `h264_qsv` and `libx264`. */
export function encoderOutput(encoder: string): string {
  return videoCodecName(
    SOFTWARE_CODECS.get(encoder) ?? encoder.split("_")[0] ?? encoder,
  )
}

/** Where an encoder runs: `Quick Sync` for `h264_qsv`, `CPU` for `libx264`. */
export function encoderDevice(encoder: string): string {
  return ACCELERATIONS.get(encoder.split("_")[1] ?? "") ?? "CPU"
}

const AUDIO_ENCODERS = new Map([
  ["libopus", "Opus"],
  ["aac", "AAC"],
  ["aac_at", "AAC"],
  ["libfdk_aac", "AAC"],
])

/** `Opus` for `libopus`. */
export function audioEncoderName(encoder: string): string {
  return AUDIO_ENCODERS.get(encoder) ?? encoder
}

/** Named for what the frame fits, as the player names it: 1920x800 is 1080p. */
export function resolutionOf(width: number, height: number): string {
  if (width >= 3456 || height >= 1944) return "4K"
  if (width >= 2304 || height >= 1296) return "1440p"
  if (width >= 1728 || height >= 972) return "1080p"
  if (width >= 1152 || height >= 648) return "720p"
  return width >= 768 || height >= 432 ? "480p" : "SD"
}

const TONE_MAPPERS = new Map([
  ["tonemapx", "tonemapx (CPU)"],
  ["opencl", "OpenCL"],
  ["vpp", "Intel VPP"],
  ["cuda", "CUDA"],
  ["videotoolbox", "VideoToolbox"],
  ["metal", "Metal"],
])

export function toneMapperName(mapper: string): string {
  return TONE_MAPPERS.get(mapper) ?? mapper
}

/** `1080p 10 Mbps` for `1080p-10`; `Original` copies the video. */
export function qualityName(quality: PlaybackQuality): string {
  const preset = PLAYBACK_QUALITIES.find((entry) => entry.id === quality)
  if (!preset) return tr("stats.quality.original")
  return tr("stats.quality.preset", {
    height: String(preset.height),
    bitrate: preset.bitrate / 1_000_000,
  })
}

/** A bucket's first day, at noon so no time zone moves it. */
function bucketDate(start: string): Date {
  return new Date(`${start}T12:00:00`)
}

const axisDays = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
)

/** Under a bar: "Nov 5", or "Nov 2025" for months. */
export function bucketAxisLabel(start: string, unit: StatsUnit): string {
  const date = bucketDate(start)
  return unit === "month" ? formatMonth(date) : axisDays().format(date)
}

const longMonths = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
)

// A day, with its weekday for a day's bucket and its year outside this one.
const dayFormats = perLocale((locale) => {
  const make = (weekday: boolean, year: boolean) =>
    new Intl.DateTimeFormat(locale, {
      weekday: weekday ? "short" : undefined,
      month: "short",
      day: "numeric",
      year: year ? "numeric" : undefined,
    })
  return {
    day: make(true, false),
    dayOtherYear: make(true, true),
    week: make(false, false),
    weekOtherYear: make(false, true),
  }
})

/** A bucket in full: "Wed, Nov 5", "Week of Nov 3", "November 2025". */
export function bucketName(start: string, unit: StatsUnit): string {
  const date = bucketDate(start)
  if (unit === "month") return longMonths().format(date)
  const otherYear = date.getFullYear() !== new Date().getFullYear()
  const formats = dayFormats()
  if (unit === "day") {
    return (otherYear ? formats.dayOtherYear : formats.day).format(date)
  }
  const day = (otherYear ? formats.weekOtherYear : formats.week).format(date)
  return tr("stats.bucket.week", { date: day })
}

/** ISO weekdays, 1 to 7. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

const weekdayFormats = perLocale((locale) => ({
  long: new Intl.DateTimeFormat(locale, { weekday: "long" }),
  short: new Intl.DateTimeFormat(locale, { weekday: "short" }),
}))

/** "Monday", or "Mon" when `short`, for ISO weekday 1. */
export function weekdayName(weekday: number, width: "long" | "short"): string {
  // January 2024 starts on a Monday, so its day numbers are ISO weekdays.
  return weekdayFormats()[width].format(new Date(2024, 0, weekday, 12))
}

const hours = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { hour: "numeric" }),
)

/** "9 PM" for 21. */
export function hourName(hour: number): string {
  return hours().format(new Date(2000, 0, 1, hour))
}

const DYNAMIC_RANGES = new Map([
  ["sdr", "SDR"],
  ["hdr10", "HDR10"],
  ["hlg", "HLG"],
  ["dolby-vision", "Dolby Vision"],
])

/** `Dolby Vision` for `dolby-vision`. */
export function dynamicRangeName(name: string): string {
  if (name === "unknown") return tr("stats.notRead")
  return DYNAMIC_RANGES.get(name) ?? name
}

/** Resolutions best first, the way people read them. */
export const RESOLUTION_ORDER = [
  "4K",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "SD",
  "unknown",
]

/** `Not read yet` for the files ffprobe hasn't read or couldn't. */
export function resolutionName(name: string): string {
  return name === "unknown" ? tr("stats.notRead") : name
}
