import {
  PLAYBACK_QUALITIES,
  type PlaybackMethod,
  type PlaybackQuality,
  type StatsRange,
  type StatsUnit,
  videoCodecName,
} from "@matinee/contracts"

/** What the range chips say. */
export const RANGE_NAMES = new Map<StatsRange, string>([
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["365d", "Year"],
  ["all", "All time"],
])

/** How a sentence ends for the range: "in the last 30 days". */
export function rangePhrase(range: StatsRange): string {
  if (range === "all") return "so far"
  if (range === "365d") return "in the last year"
  return `in the last ${RANGE_NAMES.get(range) ?? range}`
}

/** The visitor's time zone, so days and hours match their clock. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export const METHOD_NAMES = new Map<PlaybackMethod, string>([
  ["direct", "Direct play"],
  ["remux", "Direct stream"],
  ["transcode", "Transcode"],
])

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
  if (!preset) return "Original"
  return `${preset.height}p ${preset.bitrate / 1_000_000} Mbps`
}

const LOCALE = "en"

/** A bucket's first day, at noon so no time zone moves it. */
export function bucketDate(start: string): Date {
  return new Date(`${start}T12:00:00`)
}

/** Under a bar: "Nov 5", or "Nov 2025" for months. */
export function bucketAxisLabel(start: string, unit: StatsUnit): string {
  const date = bucketDate(start)
  return unit === "month"
    ? date.toLocaleDateString(LOCALE, { month: "short", year: "numeric" })
    : date.toLocaleDateString(LOCALE, { month: "short", day: "numeric" })
}

/** A bucket in full: "Wed, Nov 5", "Week of Nov 3", "November 2025". */
export function bucketName(start: string, unit: StatsUnit): string {
  const date = bucketDate(start)
  if (unit === "month") {
    return date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" })
  }
  const day = date.toLocaleDateString(LOCALE, {
    weekday: unit === "day" ? "short" : undefined,
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
  return unit === "week" ? `Week of ${day}` : day
}

/** ISO weekdays, 1 to 7. */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const hours = new Intl.DateTimeFormat(LOCALE, { hour: "numeric" })

/** "9 PM" for 21. */
export function hourName(hour: number): string {
  return hours.format(new Date(2000, 0, 1, hour))
}

const DYNAMIC_RANGES = new Map([
  ["sdr", "SDR"],
  ["hdr10", "HDR10"],
  ["hlg", "HLG"],
  ["dolby-vision", "Dolby Vision"],
  ["unknown", "Not read yet"],
])

/** `Dolby Vision` for `dolby-vision`. */
export function dynamicRangeName(name: string): string {
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
  return name === "unknown" ? "Not read yet" : name
}
