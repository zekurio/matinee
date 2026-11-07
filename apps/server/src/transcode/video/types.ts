import type {
  HardwareAcceleration,
  HardwareCapability,
  TranscodeVideoCodec,
  TranscodingCapabilities,
  TranscodingSettings,
  VideoStream,
} from "@matinee/contracts"

/** What the engine wants the video to become. */
export type VideoTarget = {
  codec: TranscodeVideoCodec
  /** Scale down to fit, keeping the aspect ratio. Never scales up. */
  maxWidth?: number
  maxHeight?: number
  /**
   * Bits per second to aim for, as a cap for x264 and x265 (CRF below it)
   * and the target for everything else. Without it, x264 and x265 use the
   * CRF setting alone and the GPU encoders a constant quality.
   */
  bitrate?: number
  /**
   * The highest level the client takes, as ffprobe writes it: 41 for H.264
   * 4.1, 150 for HEVC 5.0, 8 (5.0) for AV1. Capped like Jellyfin caps it.
   * Without it the encoder picks.
   */
  level?: number
  /** HLS segment length; keyframes land on its multiples. */
  segmentSeconds: number
  /**
   * Where in the source the encode starts. Keyframes land on the segment
   * boundaries after it, `n * segmentSeconds` of source time, as long as
   * the encode's first frame is at this time.
   */
  startSeconds: number
  /**
   * Encode 10-bit HDR10 or HLG instead of tone mapping to SDR, see
   * `toneMapDecision`. Applies only to HEVC and AV1 and to sources with an
   * HDR10 or HLG base layer; otherwise the encode is SDR.
   */
  keepHdr: boolean
  /**
   * A picture-based subtitle stream to draw onto the video, as ffmpeg's
   * filter graph names it: `0:5` for a stream of the file, `1:s:0` for a
   * subtitle file given as a second input.
   */
  burnIn?: string
}

/** Where tone mapping runs. */
export type ToneMapper =
  /** jellyfin-ffmpeg's software filter, with Dolby Vision reshaping. */
  | "tonemapx"
  /** tonemap_opencl, over VAAPI or QSV surfaces. */
  | "opencl"
  /** tonemap_vaapi, Intel's VPP. */
  | "vpp"
  | "cuda"
  /** scale_vt's own tone mapping. */
  | "videotoolbox"
  /** tonemap_videotoolbox. */
  | "metal"

export type VideoPipeline = {
  /** Before `-i`: hardware devices and the decoder. */
  inputArgs: string[]
  /**
   * The `-vf` chain, in order. Join with commas. Empty for none. With
   * `overlay`, the chain up to where the subtitle goes on.
   */
  filters: string[]
  /** How a burned-in subtitle goes on. `videoMapArgs` puts it together. */
  overlay: Overlay | null
  /** After the input and the map: the encoder and its options. */
  outputArgs: string[]
  /** The ffmpeg encoder, like `libx264` or `hevc_vaapi`. */
  encoder: string
  /** The hardware decoder, like `vaapi` or `cuda`; null decodes on the CPU. */
  decoder: string | null
  /** Null when the encode needs no tone mapping, or nothing could do it. */
  toneMapper: ToneMapper | null
  /** The source is HDR, the encode is SDR, and nothing could tone map it. */
  toneMapMissing: boolean
  /**
   * Keyframes land on the segment boundaries. False for the encoders that
   * only take a GOP length (QSV, NVENC, SVT-AV1) unless the encode starts
   * on a boundary and a segment is a whole number of frames: at 23.976 fps
   * a six-second GOP is 6.006 s, and keyframes drift from the boundaries.
   */
  keyframesOnBoundaries: boolean
  /**
   * Seconds of source between keyframes: `segmentSeconds`, or for the
   * encoders that only take a GOP length the GOP itself, like 6.006 s for
   * six at 23.976 fps. HLS segments of this length start on keyframes in
   * every encode, wherever it starts on a multiple of it.
   */
  keyframeSeconds: number
  /** The encode is 10-bit HDR10 or HLG. */
  hdr: boolean
  /** The output frame size. The software scaler works it out the same way. */
  width: number
  height: number
  /** The profile passed to the encoder, like `high` or `main10`. */
  profile: string | null
  /** The level passed to the encoder, as ffprobe writes it. */
  level: number | null
}

/** A subtitle burned in, as filters around ffmpeg's `overlay`. */
export type Overlay = {
  /** The subtitle stream, as in `VideoTarget.burnIn`. */
  stream: string
  /** Fit the subtitle's pictures to the output frame. */
  fit: string[]
  /** The overlay, then what the encoder needs after it. */
  filters: string[]
}

/** Everything the chains read, worked out once. */
export type Plan = {
  source: VideoStream
  target: VideoTarget
  settings: TranscodingSettings
  caps: TranscodingCapabilities
  /** The acceleration in use: the configured one if its device opened. */
  accel: HardwareAcceleration
  hardware: HardwareCapability | null
  encoder: string
  bitDepth: number
  /** The source is HDR by Jellyfin's rules. */
  isHdr: boolean
  /** The encode stays HDR. */
  keepHdr: boolean
  /** The source needs tone mapping to become SDR. */
  wantToneMap: boolean
  /** The transfer the HDR source signals: PQ or HLG. */
  transfer: "smpte2084" | "arib-std-b67"
  deinterlace: boolean
  doubleRate: boolean
}

export type Decoder = {
  /** The hwaccel: vaapi, cuda, or videotoolbox. QSV decodes through VAAPI. */
  name: "vaapi" | "cuda" | "videotoolbox"
  args: string[]
  /** Frames stay on the GPU. */
  surface: boolean
}

/* The chains. Each returns its filters and the decoder it was built for. */

export type Chain = {
  filters: string[]
  decoder: Decoder | null
  toneMapper: ToneMapper | null
  /** The chain scales on the GPU, which caps the size at 4096. */
  hardwareScaling: boolean
  /** Devices beyond the acceleration's own that the chain needs. */
  opencl: "none" | "device" | "filter-device"
  /**
   * With a subtitle to burn in, where in `filters` it goes on: the filters
   * from here on follow the overlay.
   */
  overlayAt?: number
}
