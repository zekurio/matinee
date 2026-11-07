/*
 * Display names for what ffprobe reports. Its names are for machines:
 * `truehd` with the profile `Dolby TrueHD + Dolby Atmos`, seven channels
 * laid out as `6.1(back)`. People read `TrueHD Atmos 6.1`.
 */

const AUDIO_FORMATS = new Map([
  ["aac", "AAC"],
  ["aac_latm", "AAC"],
  ["ac3", "AC-3"],
  ["eac3", "E-AC-3"],
  ["ac4", "AC-4"],
  ["truehd", "TrueHD"],
  ["mlp", "MLP"],
  ["dts", "DTS"],
  ["flac", "FLAC"],
  ["alac", "ALAC"],
  ["opus", "Opus"],
  ["vorbis", "Vorbis"],
  ["mp3", "MP3"],
  ["mp2", "MP2"],
  ["wmav1", "WMA"],
  ["wmav2", "WMA"],
  ["wmapro", "WMA Pro"],
  ["wmalossless", "WMA Lossless"],
  ["wavpack", "WavPack"],
  ["mpegh_3d_audio", "MPEG-H"],
])

// The profiles in ffmpeg's libavcodec/profiles.c that name a format of
// their own. The rest, like AAC's `LC`, say nothing a viewer needs.
const AUDIO_PROFILES = new Map([
  ["Dolby TrueHD + Dolby Atmos", "TrueHD Atmos"],
  ["Dolby Digital Plus + Dolby Atmos", "E-AC-3 Atmos"],
  ["DTS-ES", "DTS-ES"],
  ["DTS 96/24", "DTS 96/24"],
  ["DTS-HD HRA", "DTS-HD HRA"],
  ["DTS-HD MA", "DTS-HD MA"],
  ["DTS-HD MA + DTS:X", "DTS:X"],
  ["DTS-HD MA + DTS:X IMAX", "DTS:X IMAX"],
  ["DTS Express", "DTS Express"],
  ["HE-AAC", "HE-AAC"],
  ["HE-AACv2", "HE-AAC v2"],
  ["xHE-AAC", "xHE-AAC"],
])

// ffmpeg's layout names that aren't speaker counts.
const LAYOUT_NAMES = new Map([
  ["mono", "Mono"],
  ["stereo", "Stereo"],
  ["downmix", "Stereo"],
  ["binaural", "Binaural"],
  ["quad", "4.0"],
  ["hexagonal", "6.0"],
  ["octagonal", "8.0"],
  ["cube", "4.0.4"],
  ["hexadecagonal", "16.0"],
])

// Jellyfin's guesses for a stream that doesn't name its layout.
const GUESSED_LAYOUTS = new Map([
  [1, "Mono"],
  [2, "Stereo"],
  [3, "2.1"],
  [4, "4.0"],
  [5, "5.0"],
  [6, "5.1"],
  [7, "6.1"],
  [8, "7.1"],
])

const SPEAKER_COUNT = /^\d+\.\d+(\.\d+)?$/

const VIDEO_CODECS = new Map([
  ["h264", "H.264"],
  ["hevc", "HEVC"],
  ["av1", "AV1"],
  ["vp8", "VP8"],
  ["vp9", "VP9"],
  ["vvc", "VVC"],
  ["mpeg1video", "MPEG-1"],
  ["mpeg2video", "MPEG-2"],
  ["mpeg4", "MPEG-4"],
  ["vc1", "VC-1"],
  ["wmv3", "WMV"],
  ["prores", "ProRes"],
  ["theora", "Theora"],
])

/**
 * `TrueHD Atmos` for ffprobe's `truehd` with the Atmos profile, `DTS-HD MA`
 * for `dts`, and `AAC` for `aac`.
 */
export function audioFormatName(
  codec: string,
  profile: string | null = null,
): string {
  const named = profile === null ? undefined : AUDIO_PROFILES.get(profile)
  if (named) return named
  if (codec.startsWith("pcm_")) return "PCM"
  return AUDIO_FORMATS.get(codec) ?? codec.toUpperCase()
}

/**
 * `5.1` for ffprobe's `5.1(side)`, `Stereo` for `stereo`. A stream without
 * a layout ffmpeg names gets Jellyfin's guess from its channel count, so
 * seven channels read `6.1`. Null when the stream says neither.
 */
export function channelLayoutName(
  layout: string | null,
  channels: number | null,
): string | null {
  const known = knownChannelLayout(layout, channels)
  if (known || !channels || channels < 1) return known
  return `${channels} channels`
}

/**
 * `channelLayoutName` without the English "8 channels" for a count no
 * layout fits, for a client that says that in its own language.
 */
export function knownChannelLayout(
  layout: string | null,
  channels: number | null,
): string | null {
  // The part in parentheses places the speakers, without changing the count.
  const name = layout?.split("(")[0]?.trim().toLowerCase()
  if (name) {
    const known =
      LAYOUT_NAMES.get(name) ?? (SPEAKER_COUNT.test(name) ? name : undefined)
    if (known) return known
  }
  if (!channels || channels < 1) return null
  return GUESSED_LAYOUTS.get(channels) ?? null
}

/** `HEVC` for ffprobe's `hevc`. */
export function videoCodecName(codec: string): string {
  return VIDEO_CODECS.get(codec) ?? codec.toUpperCase()
}
