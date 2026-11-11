import {
  type AudioStream,
  type DownloadAudio,
  type DownmixAlgorithm,
  downloadAudioBitrate,
  type PlaybackAudioCodec,
  type TranscodeAudioCodec,
  type TranscodingCapabilities,
  type TranscodingSettings,
} from "@matinee/contracts"

/*
 * The audio half of a stream, the way Jellyfin builds it for a browser:
 * the track copied when the player decodes it, else encoded to the first
 * codec on the player's list this server can encode, else AAC. Browsers
 * get stereo, so surround goes through Jellyfin's downmix filters and
 * boost.
 */

// Jellyfin's AC-4 step from 7.1 to 5.1, ahead of a 5.1 downmix.
const SEVEN_TO_FIVE =
  "pan=5.1(side)|c0=c0|c1=c1|c2=c2|c3=c3|c4=0.707*c4+0.707*c6|c5=0.707*c5+0.707*c7"
const DAVE750 =
  "pan=stereo|c0=0.5*c2+0.707*c0+0.707*c4+0.5*c3|c1=0.5*c2+0.707*c1+0.707*c5+0.5*c3"
const NIGHTMODE = "pan=stereo|c0=c2+0.30*c0+0.30*c4|c1=c2+0.30*c1+0.30*c5"
const AC4_51 = "pan=stereo|c0=c0+0.707*c2+0.707*c4|c1=c1+0.707*c2+0.707*c5"

/** Jellyfin's DownMixAlgorithmsHelper: a filter per algorithm and source layout. */
const DOWNMIX_FILTERS = new Map<DownmixAlgorithm, Map<string, string>>([
  [
    "dave750",
    new Map([
      ["5.1", DAVE750],
      ["7.1", `${SEVEN_TO_FIVE},${DAVE750}`],
    ]),
  ],
  [
    "nightmode-dialogue",
    new Map([
      ["5.1", NIGHTMODE],
      ["7.1", `${SEVEN_TO_FIVE},${NIGHTMODE}`],
    ]),
  ],
  [
    "rfc7845",
    new Map([
      [
        "3.0",
        "pan=stereo|c0=0.414214*c2+0.585786*c0|c1=0.414214*c2+0.585786*c1",
      ],
      [
        "quad",
        "pan=stereo|c0=0.422650*c0+0.366025*c2+0.211325*c3|c1=0.422650*c1+0.366025*c3+0.211325*c2",
      ],
      [
        "5.0",
        "pan=stereo|c0=0.460186*c2+0.650802*c0+0.563611*c3+0.325401*c4|c1=0.460186*c2+0.650802*c1+0.563611*c4+0.325401*c3",
      ],
      [
        "5.1",
        "pan=stereo|c0=0.374107*c2+0.529067*c0+0.458186*c4+0.264534*c5+0.374107*c3|c1=0.374107*c2+0.529067*c1+0.458186*c5+0.264534*c4+0.374107*c3",
      ],
      [
        "6.1",
        "pan=stereo|c0=0.321953*c2+0.455310*c0+0.394310*c5+0.227655*c6+0.278819*c4+0.321953*c3|c1=0.321953*c2+0.455310*c1+0.394310*c6+0.227655*c5+0.278819*c4+0.321953*c3",
      ],
      [
        "7.1",
        "pan=stereo|c0=0.274804*c2+0.388631*c0+0.336565*c6+0.194316*c7+0.336565*c4+0.194316*c5+0.274804*c3|c1=0.274804*c2+0.388631*c1+0.336565*c7+0.194316*c6+0.336565*c5+0.194316*c4+0.274804*c3",
      ],
    ]),
  ],
  [
    "ac4",
    new Map([
      ["3.0", "pan=stereo|c0=c0+0.707*c2|c1=c1+0.707*c2"],
      ["5.0", "pan=stereo|c0=c0+0.707*c2+0.707*c3|c1=c1+0.707*c2+0.707*c4"],
      ["5.1", AC4_51],
      [
        "7.0",
        "pan=5.0(side)|c0=c0|c1=c1|c2=c2|c3=0.707*c3+0.707*c5|c4=0.707*c4+0.707*c6,pan=stereo|c0=c0+0.707*c2+0.707*c3|c1=c1+0.707*c2+0.707*c4",
      ],
      ["7.1", `${SEVEN_TO_FIVE},${AC4_51}`],
    ]),
  ],
])

/** Jellyfin's guesses for a stream that doesn't name its layout. */
const GUESSED_LAYOUTS = new Map([
  [1, "mono"],
  [2, "stereo"],
  [3, "2.1"],
  [4, "4.0"],
  [5, "5.0"],
  [6, "5.1"],
  [7, "6.1"],
  [8, "7.1"],
])

// What browsers get; they would downmix surround themselves anyway.
const MAX_CHANNELS = 2
// FLAC in MP4 is experimental before FFmpeg 6.
const FLAC_IN_MP4_MAJOR = 6

/** `5.1` for ffprobe's `5.1(side)`, as Jellyfin's probe stores it. */
function layoutOf(stream: AudioStream): string | null {
  const named = stream.channelLayout?.split("(")[0]?.trim()
  if (named) return named
  return GUESSED_LAYOUTS.get(stream.channels ?? 0) ?? null
}

/** Jellyfin's pick: Apple's encoder sounds best, then Fraunhofer's, then ffmpeg's. */
function aacEncoder(capabilities: TranscodingCapabilities): string {
  return (
    ["aac_at", "libfdk_aac"].find((name) =>
      capabilities.encoders.includes(name),
    ) ?? "aac"
  )
}

export type AudioPipeline = {
  /** `-c:a` and the rest, after the track's `-map`. */
  args: string[]
  /** The ffmpeg encoder, like `libopus`. Null when the track is copied. */
  encoder: string | null
}

/**
 * The codecs a stream can convert to here: Opus with libopus, and AAC,
 * which ffmpeg always has.
 */
export function encodableAudioCodecs(
  capabilities: TranscodingCapabilities,
): TranscodeAudioCodec[] {
  return capabilities.encoders.includes("libopus") ? ["opus", "aac"] : ["aac"]
}

/**
 * The arguments that copy or encode `stream` for a player that decodes
 * `decodes`. The player lists the codecs in the order it wants them, so
 * the first one this server encodes is what the rest become. Additional
 * bitstream filters run on both copied and encoded audio, after any
 * container conversion.
 */
export function buildAudioPipeline(
  stream: AudioStream,
  decodes: readonly PlaybackAudioCodec[],
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
  bitstreamFilters: readonly string[] = [],
): AudioPipeline {
  const filtersArgs = (filters: readonly string[]) =>
    filters.length > 0 ? ["-bsf:a", filters.join(",")] : []
  if (decodes.some((codec) => codec === stream.codec)) {
    const oldFfmpeg =
      capabilities.versionNumbers !== null &&
      (capabilities.versionNumbers[0] ?? 0) < FLAC_IN_MP4_MAJOR
    return {
      args: [
        "-c:a",
        "copy",
        ...(stream.codec === "flac" && oldFfmpeg ? ["-strict", "-2"] : []),
        // AAC from MPEG-TS has a header on every packet, which MP4 can't
        // hold. ffmpeg stops on it when it writes to a pipe. AAC from other
        // containers passes through the filter as it is.
        ...filtersArgs([
          ...(stream.codec === "aac" ? ["aac_adtstoasc"] : []),
          ...bitstreamFilters,
        ]),
      ],
      encoder: null,
    }
  }

  const encodable = encodableAudioCodecs(capabilities)
  const opus =
    decodes.find((codec) => encodable.some((entry) => entry === codec)) ===
    "opus"
  const encoder = opus ? "libopus" : aacEncoder(capabilities)
  const source =
    stream.channels !== null && stream.channels > 0 ? stream.channels : null
  const channels = Math.min(source ?? MAX_CHANNELS, MAX_CHANNELS)
  // StreamBuilder picks 384k for AAC and 192k for the rest; EncodingHelper
  // caps that at 128k a channel.
  const bitrate = Math.min(channels * 128_000, opus ? 192_000 : 384_000)

  const filters: string[] = []
  let pan: string | undefined
  if (source !== null && source > MAX_CHANNELS) {
    const layout = layoutOf(stream)
    pan = layout
      ? DOWNMIX_FILTERS.get(settings.downMixStereoAlgorithm)?.get(layout)
      : undefined
    if (pan) filters.push(pan)
    if (settings.downMixAudioBoost !== 1) {
      filters.push(`volume=${settings.downMixAudioBoost}`)
    }
  }

  // VBR as Jellyfin sets it; libopus is VBR already.
  const rate =
    settings.enableAudioVbr && encoder === "libfdk_aac"
      ? // Jellyfin's mode for 96k a channel and up, which every rate here is.
        ["-vbr:a", "5"]
      : settings.enableAudioVbr && encoder === "aac_at"
        ? ["-aac_at_mode:a", "2", "-b:a", String(bitrate)]
        : ["-b:a", String(bitrate)]

  return {
    args: [
      "-c:a",
      encoder,
      // The pan filter makes stereo itself.
      ...(pan ? [] : ["-ac", String(channels)]),
      ...rate,
      ...(filters.length > 0 ? ["-af", filters.join(",")] : []),
      ...filtersArgs(bitstreamFilters),
    ],
    encoder,
  }
}

/** One audio track of a download, as `buildDownloadAudio` makes it. */
export type DownloadAudioPipeline = {
  /** The output's arguments, after the track's `-map`, without filters. */
  args: string[]
  /** The track's filters, for `-filter:a:<output>`. Empty for none. */
  filters: string[]
  /** The filters end in a resampler to the encoder's rate. */
  resamples: boolean
  /** Global arguments the output needs, like `-strict`. */
  global: string[]
  /** ffmpeg's codec name in the download. */
  codec: string
  channels: number | null
  /** Bits per second of a conversion; null for a copy. */
  bitrate: number | null
  /** The ffmpeg encoder; null for a copy. */
  encoder: string | null
}

// libopus takes 48 kHz. The resampler is in the filters rather than left
// to ffmpeg, so every run of a download resamples the same way.
const OPUS_RATE = 48_000

/**
 * The arguments for audio stream `output` of a download, which keeps
 * `stream` or converts it as `choice` says. A download isn't for a
 * browser, so a conversion keeps up to the channels it asks for: to
 * stereo through the same downmix as playback, and from 7.1 to 5.1
 * through Jellyfin's step for it. The caller checks that the codec can be
 * kept or encoded here.
 */
export function buildDownloadAudio(
  stream: AudioStream,
  choice: DownloadAudio,
  output: number,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): DownloadAudioPipeline {
  const spec = `a:${output}`
  if (choice.mode === "copy") {
    const oldFfmpeg =
      capabilities.versionNumbers !== null &&
      (capabilities.versionNumbers[0] ?? 0) < FLAC_IN_MP4_MAJOR
    return {
      args: [`-c:${spec}`, "copy"],
      filters: [],
      resamples: false,
      global: stream.codec === "flac" && oldFfmpeg ? ["-strict", "-2"] : [],
      codec: stream.codec,
      channels: stream.channels,
      bitrate: null,
      encoder: null,
    }
  }

  const encoder = choice.codec === "opus" ? "libopus" : aacEncoder(capabilities)
  const source =
    stream.channels !== null && stream.channels > 0 ? stream.channels : null
  const channels = Math.min(choice.channels, source ?? choice.channels)
  const bitrate = choice.bitrate ?? downloadAudioBitrate(choice.codec, channels)

  const filters: string[] = []
  let pan: string | undefined
  if (source !== null && source > channels) {
    const layout = layoutOf(stream)
    if (channels === MAX_CHANNELS && layout) {
      pan = DOWNMIX_FILTERS.get(settings.downMixStereoAlgorithm)?.get(layout)
    } else if (channels === 6 && layout === "7.1") {
      pan = SEVEN_TO_FIVE
    }
    if (pan) filters.push(pan)
    if (channels === MAX_CHANNELS && settings.downMixAudioBoost !== 1) {
      filters.push(`volume=${settings.downMixAudioBoost}`)
    }
  }
  const resamples = encoder === "libopus"
  if (resamples) filters.push(`aresample=${OPUS_RATE}`)

  const rate =
    settings.enableAudioVbr && encoder === "libfdk_aac"
      ? [`-vbr:${spec}`, "5"]
      : settings.enableAudioVbr && encoder === "aac_at"
        ? [`-aac_at_mode:${spec}`, "2", `-b:${spec}`, String(bitrate)]
        : [`-b:${spec}`, String(bitrate)]

  return {
    args: [
      `-c:${spec}`,
      encoder,
      // A pan filter sets the channels itself.
      ...(pan ? [] : [`-ac:${spec}`, String(channels)]),
      ...rate,
    ],
    filters,
    resamples,
    global: [],
    codec: choice.codec,
    channels,
    bitrate,
    encoder,
  }
}
