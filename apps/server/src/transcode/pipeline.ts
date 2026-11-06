import type {
  EncoderPreset,
  HardwareAcceleration,
  HardwareCapability,
  TranscodeVideoCodec,
  TranscodingCapabilities,
  TranscodingSettings,
  VideoStream,
} from "@matinee/contracts"

import {
  baseLayerRange,
  isDoviWithHdr10Bl,
  isHdr10Plus,
  videoColorRange,
} from "./range"

/*
 * The video half of an HLS fMP4 transcode: ffmpeg arguments for decoding,
 * filtering, and encoding one video stream, ported from Jellyfin's
 * EncodingHelper (GetInputVideoHwaccelArgs, the Get*VidFilterChain methods,
 * GetVideoQualityParam, GetHlsVideoKeyFrameArguments). Pure: the settings
 * and the detected capabilities say everything it needs.
 *
 * Left out from Jellyfin: subtitle burn-in, rotation, 3D, AMF, Rockchip,
 * Windows (D3D11, QSV over D3D11), and the AMD Vulkan path, which falls
 * back to the limited VAAPI chain. Changed from Jellyfin, each marked
 * "Jellyfin" below: GPU paths that can't tone map fall back to tonemapx,
 * capabilities are what ran rather than what the build lists, odd sizes
 * become even, and `keepHdr` encodes 10-bit HDR, which Jellyfin never does.
 */

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
  /** The `-vf` chain, in order. Join with commas. Empty for none. */
  filters: string[]
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

const SOFTWARE_ENCODERS = new Map<TranscodeVideoCodec, string>([
  ["h264", "libx264"],
  ["hevc", "libx265"],
  ["av1", "libsvtav1"],
])

const HARDWARE_SUFFIXES = new Map<HardwareAcceleration, string>([
  ["vaapi", "vaapi"],
  ["qsv", "qsv"],
  ["nvenc", "nvenc"],
  ["videotoolbox", "videotoolbox"],
])

/** The encoder name for a codec on an acceleration, like `hevc_vaapi`. */
export function hardwareEncoderName(
  codec: TranscodeVideoCodec,
  acceleration: HardwareAcceleration,
): string | null {
  const suffix = HARDWARE_SUFFIXES.get(acceleration)
  return suffix ? `${codec}_${suffix}` : null
}

/** The software encoder for a codec. */
export function softwareEncoderName(codec: TranscodeVideoCodec): string {
  return SOFTWARE_ENCODERS.get(codec) ?? "libx264"
}

/**
 * The codecs transcodes may produce: H.264 always, HEVC and AV1 when the
 * settings allow them, each only with an encoder that works here.
 */
export function encodableVideoCodecs(
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): TranscodeVideoCodec[] {
  const allowed: TranscodeVideoCodec[] = ["h264"]
  if (settings.allowHevcEncoding) allowed.push("hevc")
  if (settings.allowAv1Encoding) allowed.push("av1")
  const hardware = usableHardware(settings, capabilities)
  return allowed.filter(
    (codec) =>
      capabilities.encoders.includes(softwareEncoderName(codec)) ||
      (hardware !== null &&
        settings.enableHardwareEncoding &&
        encoderWorks(hardware, codec, false)),
  )
}

/** The configured acceleration, if its device opened. */
function usableHardware(
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): HardwareCapability | null {
  if (settings.hardwareAcceleration === "none") return null
  const hardware = capabilities.hardware.find(
    (entry) => entry.acceleration === settings.hardwareAcceleration,
  )
  return hardware?.device.status === "ok" ? hardware : null
}

function encoderWorks(
  hardware: HardwareCapability,
  codec: TranscodeVideoCodec,
  tenBit: boolean,
): boolean {
  const check = hardware.encoders.find((entry) => entry.codec === codec)
  if (check?.status !== "ok") return false
  return !tenBit || check.tenBit === "ok"
}

/** Everything the chains read, worked out once. */
type Plan = {
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

/**
 * The ffmpeg arguments that turn `source` into `target`. Throws when this
 * ffmpeg has no encoder for the codec; `encodableVideoCodecs` says which
 * ones it has.
 */
export function buildVideoPipeline(
  source: VideoStream,
  target: VideoTarget,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): VideoPipeline {
  const hardware = usableHardware(settings, capabilities)
  const accel = hardware ? settings.hardwareAcceleration : "none"
  const bitDepth = videoBitDepth(source)
  const { range, type } = videoColorRange(source)
  const isHdr = range === "HDR"
  // Only a base layer of HDR10 or HLG survives an encode; Dolby Vision 5
  // has neither.
  const base = isHdr ? baseLayerRange(source, type) : null
  const keepHdr =
    target.keepHdr && base !== null && target.codec !== "h264" && bitDepth >= 10
  const plan: Plan = {
    source,
    target,
    settings,
    caps: capabilities,
    accel,
    hardware,
    encoder: chooseEncoder(
      target.codec,
      keepHdr,
      settings,
      capabilities,
      hardware,
    ),
    bitDepth,
    isHdr,
    keepHdr,
    // Jellyfin tone maps 10-bit sources only.
    wantToneMap: isHdr && !keepHdr && bitDepth >= 10,
    transfer:
      base === "HLG" || source.colorTransfer === "arib-std-b67"
        ? "arib-std-b67"
        : "smpte2084",
    // Jellyfin deinterlaces every interlaced source it encodes.
    deinterlace: source.interlaced,
    doubleRate:
      settings.deinterlaceDoubleRate && (source.frameRate ?? 60) <= 30,
  }

  const chain = filterChain(plan)
  const decoder = chain.decoder
  const inputArgs = [...deviceArgs(plan, chain), ...(decoder?.args ?? [])]
  const filters = chain.filters.filter((filter) => filter !== "")
  const size = outputSize(plan, chain.hardwareScaling)
  const encoding = encoderArgs(plan)
  const outputArgs = [
    ...encoding.args,
    ...keyframeArgs(plan),
    // Jellyfin: stops ffmpeg scaling hardware frames on its own when the
    // decoded size changes mid-stream.
    ...(decoder ? ["-noautoscale"] : []),
  ]
  return {
    inputArgs,
    filters,
    outputArgs,
    encoder: plan.encoder,
    decoder: decoder?.name ?? null,
    toneMapper: chain.toneMapper,
    toneMapMissing: plan.wantToneMap && chain.toneMapper === null,
    keyframesOnBoundaries:
      !GOP_ONLY_ENCODERS.includes(plan.encoder) ||
      (boundaryOffset(target) === 0 && gopLength(plan).exact),
    hdr: keepHdr,
    width: size.width,
    height: size.height,
    profile: encoding.profile,
    level: encoding.level,
  }
}

/** Bit depth, from the probe or the pixel format (GetVideoColorBitDepth). */
function videoBitDepth(source: VideoStream): number {
  if (source.bitDepth) return source.bitDepth
  const format = source.pixelFormat ?? ""
  if (format.includes("p10")) return 10
  if (format.includes("p12")) return 12
  return 8
}

/**
 * GetH26xOrAv1Encoder: the GPU's encoder when hardware encoding is on and
 * it passed its test encode, else the software one. An HDR encode needs
 * one that passed at 10 bits.
 */
function chooseEncoder(
  codec: TranscodeVideoCodec,
  tenBit: boolean,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
  hardware: HardwareCapability | null,
): string {
  const name = hardwareEncoderName(codec, settings.hardwareAcceleration)
  if (
    name &&
    hardware &&
    settings.enableHardwareEncoding &&
    encoderWorks(hardware, codec, tenBit)
  ) {
    return name
  }
  const software = softwareEncoderName(codec)
  if (capabilities.encoders.includes(software)) return software
  throw new Error(`This ffmpeg has no working encoder for ${codec}.`)
}

const isHardwareEncoder = (plan: Plan, suffix: string) =>
  plan.encoder.endsWith(`_${suffix}`)

/* Capability checks, from Jellyfin's Is*Supported. */

function hasFilter(plan: Plan, name: string): boolean {
  return plan.caps.filters.includes(name)
}

function hasHwaccel(plan: Plan, name: string): boolean {
  return plan.caps.hwaccels.includes(name)
}

function versionAtLeast(plan: Plan, wanted: [number, number, number]) {
  const version = plan.caps.versionNumbers
  if (!version) return false
  for (let i = 0; i < 3; i++) {
    const have = version[i] ?? 0
    const want = wanted[i] ?? 0
    if (have !== want) return have > want
  }
  return true
}

function isVaapiFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "drm") &&
    hasHwaccel(plan, "vaapi") &&
    [
      "scale_vaapi",
      "deinterlace_vaapi",
      "tonemap_vaapi",
      "procamp_vaapi",
      "transpose_vaapi",
      "hwupload_vaapi",
    ].every((name) => hasFilter(plan, name)) &&
    plan.caps.features.overlayVaapiFrameSync
  )
}

function isOpenclFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "opencl") &&
    hasFilter(plan, "scale_opencl") &&
    plan.caps.features.tonemapOpenclBt2390 &&
    plan.caps.features.overlayOpenclFrameSync
  )
}

function isCudaFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "cuda") &&
    plan.caps.features.scaleCudaFormat &&
    hasFilter(plan, "yadif_cuda") &&
    plan.caps.features.tonemapCudaName &&
    hasFilter(plan, "overlay_cuda") &&
    hasFilter(plan, "hwupload_cuda")
  )
}

function isVideoToolboxFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "videotoolbox") &&
    [
      "yadif_videotoolbox",
      "overlay_videotoolbox",
      "tonemap_videotoolbox",
      "scale_vt",
    ].every((name) => hasFilter(plan, name))
  )
}

/** VAAPI can't decode MPEG-4 part 2 (IsVaapiSupported). */
function isVaapiSupported(plan: Plan): boolean {
  return plan.source.codec !== "mpeg4" && hasHwaccel(plan, "vaapi")
}

function isHevcRext(source: VideoStream): boolean {
  return (
    source.codec === "hevc" &&
    (source.profile?.toLowerCase() === "rext" ||
      [
        "yuv420p12le",
        "yuv422p",
        "yuv422p10le",
        "yuv422p12le",
        "yuv444p",
        "yuv444p10le",
        "yuv444p12le",
      ].includes(source.pixelFormat ?? ""))
  )
}

const checkOk = (
  plan: Plan,
  key: "tonemap" | "vppTonemap" | "videoToolboxTonemap",
) => plan.hardware?.[key].status === "ok"

/** IsSwTonemapAvailable: tonemapx on a 10-bit HDR source. */
function swTonemapAvailable(plan: Plan): boolean {
  return plan.wantToneMap && plan.caps.features.tonemapx
}

/**
 * IsHwTonemapAvailable, for OpenCL, CUDA, and Metal. Dolby Vision 5 needs
 * a decoder that hands over the RPU: software, VAAPI, CUDA, or
 * VideoToolbox. Jellyfin: also needs the filter to have run here.
 */
function hwTonemapAvailable(plan: Plan, decoder: Decoder | null): boolean {
  if (!plan.wantToneMap || !plan.settings.enableTonemapping) return false
  if (!checkOk(plan, "tonemap")) return false
  if (videoColorRange(plan.source).type === "DOVI") {
    return (
      decoder === null ||
      ["vaapi", "cuda", "videotoolbox"].includes(decoder.name)
    )
  }
  return true
}

/** IsIntelVppTonemapAvailable: HDR10 and Dolby Vision over HDR10. */
function vppTonemapAvailable(plan: Plan): boolean {
  if (!plan.wantToneMap || !plan.settings.enableVppTonemapping) return false
  if (!checkOk(plan, "vppTonemap")) return false
  const { type } = videoColorRange(plan.source)
  return (
    type === "HDR10" ||
    isHdr10Plus(plan.source) ||
    isDoviWithHdr10Bl(plan.source)
  )
}

/** IsVideoToolboxTonemapAvailable: everything but Dolby Vision 5. */
function videoToolboxTonemapAvailable(plan: Plan): boolean {
  if (!plan.wantToneMap || !plan.settings.enableVideoToolboxTonemapping) {
    return false
  }
  if (!checkOk(plan, "videoToolboxTonemap")) return false
  const { type } = videoColorRange(plan.source)
  return (
    type === "HDR10" ||
    type === "HLG" ||
    type === "DOVIInvalid" ||
    isHdr10Plus(plan.source) ||
    isDoviWithHdr10Bl(plan.source)
  )
}

/* Decoding, from GetHardwareVideoDecoder and GetHwaccelType. */

type Decoder = {
  /** The hwaccel: vaapi, cuda, or videotoolbox. QSV decodes through VAAPI. */
  name: "vaapi" | "cuda" | "videotoolbox"
  args: string[]
  /** Frames stay on the GPU. */
  surface: boolean
}

/** Whether the GPU should decode this source, by the settings. */
function hardwareDecodes(plan: Plan): boolean {
  const { source, settings, accel, bitDepth } = plan
  if (accel === "none") return false
  const codec = source.codec
  // Only HEVC, VP9, and AV1 have 10-bit hardware decoders on most GPUs.
  if (bitDepth >= 10 && !["hevc", "vp9", "av1"].includes(codec)) return false
  // H.264 4:2:2 and 4:4:4 profiles.
  const profile = source.profile ?? ""
  if (
    codec === "h264" &&
    (profile.includes("4:2:2") || profile.includes("4:4:4"))
  ) {
    return false
  }
  const listed = settings.hardwareDecodingCodecs.some(
    (entry) => entry === codec,
  )
  if (!listed) return false
  if (accel !== "videotoolbox") {
    if (codec === "hevc") {
      if (isHevcRext(source)) {
        if (bitDepth <= 10 && !settings.enableDecodingColorDepth10HevcRext) {
          return false
        }
        if (bitDepth === 12 && !settings.enableDecodingColorDepth12HevcRext) {
          return false
        }
        if (accel === "vaapi" && plan.hardware?.vendor !== "intel-ihd") {
          return false
        }
      } else if (bitDepth === 10 && !settings.enableDecodingColorDepth10Hevc) {
        return false
      }
    }
    if (
      codec === "vp9" &&
      bitDepth === 10 &&
      !settings.enableDecodingColorDepth10Vp9
    ) {
      return false
    }
  }
  return pixelFormatDecodes(plan)
}

/** The pixel formats each GPU decodes, per codec (Get*VidDecoder). */
function pixelFormatDecodes(plan: Plan): boolean {
  const { source, accel } = plan
  const format = source.pixelFormat ?? ""
  const is8 = format === "yuv420p" || format === "yuvj420p"
  const is8or10 = is8 || format === "yuv420p10le"
  const is444to12 = [
    "yuv420p12le",
    "yuv444p",
    "yuv444p10le",
    "yuv444p12le",
  ].includes(format)
  const is422 = ["yuv422p", "yuv422p10le", "yuv422p12le"].includes(format)
  const codec = source.codec
  switch (accel) {
    case "vaapi":
    case "qsv":
      if (!isVaapiSupported(plan)) return false
      if (["h264", "mpeg2video", "vc1", "vp8"].includes(codec)) return is8
      if (codec === "vp9" || codec === "av1") return is8or10
      if (codec === "hevc") return is8or10 || is444to12 || is422
      return false
    case "nvenc":
      if (["h264", "mpeg2video", "vc1", "mpeg4", "vp8"].includes(codec)) {
        return is8
      }
      if (codec === "vp9" || codec === "av1") return is8or10
      if (codec === "hevc") return is8or10 || is444to12
      return false
    case "videotoolbox":
      if (codec === "vp8") return is8
      if (codec === "h264" || codec === "vp9") return is8or10
      if (codec === "hevc") return is8or10 || is444to12 || is422
      return false
    default:
      return false
  }
}

/** The hwaccel arguments; `surface` keeps frames on the GPU. */
function hardwareDecoder(plan: Plan, surface: boolean): Decoder {
  const { source } = plan
  // VAAPI decodes H.264 Baseline only when told the profile may not match.
  const profileMismatch =
    source.codec === "h264" && source.profile?.toLowerCase() === "baseline"
  switch (plan.accel) {
    case "nvenc":
      return {
        name: "cuda",
        surface,
        args: [
          "-hwaccel",
          "cuda",
          ...(surface
            ? ["-hwaccel_output_format", "cuda", "-noautorotate"]
            : []),
          // The filter chain makes the copy NVDEC would otherwise make.
          ...(versionAtLeast(plan, [6, 0, 0])
            ? ["-hwaccel_flags", "+unsafe_output"]
            : []),
          // NVDEC doesn't thread.
          "-threads",
          "1",
        ],
      }
    case "videotoolbox":
      return {
        name: "videotoolbox",
        surface,
        args: [
          "-hwaccel",
          "videotoolbox",
          ...(surface ? ["-hwaccel_output_format", "videotoolbox_vld"] : []),
          "-noautorotate",
        ],
      }
    default:
      return {
        name: "vaapi",
        surface,
        args: [
          "-hwaccel",
          "vaapi",
          ...(surface
            ? ["-hwaccel_output_format", "vaapi", "-noautorotate"]
            : []),
          ...(profileMismatch
            ? ["-hwaccel_flags", "+allow_profile_mismatch"]
            : []),
        ],
      }
  }
}

/* Filters shared by the chains. */

/** A frame size in pixels. */
type FrameSize = { width: number; height: number }

/** Up to six decimals, never in exponent notation. */
function num(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** GetFixedOutputSize: fit inside the maximum, even, at most 4096 on GPUs. */
function fixedOutputSize(
  width: number,
  height: number,
  target: VideoTarget,
  hardwareCap: boolean,
): FrameSize {
  let outW = width
  let outH = height
  const cap = hardwareCap ? 4096 : Number.POSITIVE_INFINITY
  const maxW = Math.min(target.maxWidth ?? outW, cap)
  const maxH = Math.min(target.maxHeight ?? outH, cap)
  if (outW > maxW || outH > maxH) {
    const scale = Math.min(maxW / outW, maxH / outH)
    outW = Math.min(maxW, Math.round(outW * scale))
    outH = Math.min(maxH, Math.round(outH * scale))
  }
  return { width: 2 * Math.floor(outW / 2), height: 2 * Math.floor(outH / 2) }
}

function outputSize(plan: Plan, hardwareScaling: boolean) {
  const { width, height } = plan.source
  if (hardwareScaling) return fixedOutputSize(width, height, plan.target, true)
  return softwareOutputSize(width, height, plan.target)
}

/** What the software scale expressions below come to. */
function softwareOutputSize(
  width: number,
  height: number,
  target: VideoTarget,
): FrameSize {
  const even = (value: number) => 2 * Math.trunc(value / 2)
  const a = width / height
  const { maxWidth: w, maxHeight: h } = target
  if (w && h) {
    return {
      width: even(Math.min(Math.max(width, height * a), Math.min(w, h * a))),
      height: even(Math.min(Math.max(width / a, height), Math.min(w / a, h))),
    }
  }
  if (w) {
    const out = even(Math.min(Math.max(width, height * a), w))
    return { width: out, height: even(out / a) }
  }
  if (h) {
    const out = even(Math.min(Math.max(width / a, height), h))
    return { width: even(out * a), height: out }
  }
  return { width: even(width), height: even(height) }
}

/**
 * GetSwScaleFilter for a maximum size. Jellyfin: also when no maximum is
 * given and the source has an odd size, which 4:2:0 encoders refuse, and
 * height-only fits stay even.
 */
function swScaleFilter(plan: Plan): string {
  const { maxWidth: w, maxHeight: h } = plan.target
  if (w && h) {
    return `scale=trunc(min(max(iw\\,ih*a)\\,min(${w}\\,${h}*a))/2)*2:trunc(min(max(iw/a\\,ih)\\,min(${w}/a\\,${h}))/2)*2`
  }
  if (w) return `scale=trunc(min(max(iw\\,ih*a)\\,${w})/2)*2:trunc(ow/a/2)*2`
  if (h) return `scale=trunc(oh*a/2)*2:trunc(min(max(iw/a\\,ih)\\,${h})/2)*2`
  if (plan.source.width % 2 !== 0 || plan.source.height % 2 !== 0) {
    return "scale=trunc(iw/2)*2:trunc(ih/2)*2"
  }
  return ""
}

/** GetHwScaleFilter: a GPU scaler, when the size or format changes. */
function hwScaleFilter(
  plan: Plan,
  prefix: string,
  suffix: string,
  format: string,
): string {
  const { width, height } = plan.source
  const out = fixedOutputSize(width, height, plan.target, true)
  const sizeFixed = out.width !== width || out.height !== height
  if (!sizeFixed && !format) return ""
  const size = sizeFixed ? `=w=${out.width}:h=${out.height}` : ""
  const pixel = format ? `${sizeFixed ? ":" : "="}format=${format}` : ""
  return `${prefix}_${suffix}${size}${pixel}`
}

function swDeinterlaceFilter(plan: Plan): string {
  // Jellyfin's software deinterlacer doubles only known 30 fps and below.
  const double =
    plan.settings.deinterlaceDoubleRate &&
    plan.source.frameRate !== null &&
    plan.source.frameRate <= 30
  return `${plan.settings.deinterlaceMethod}=${double ? 1 : 0}:-1:0`
}

function hwDeinterlaceFilter(
  plan: Plan,
  suffix: "vaapi" | "cuda" | "videotoolbox",
): string {
  const double = plan.doubleRate ? 1 : 0
  const bwdif = plan.settings.deinterlaceMethod === "bwdif"
  switch (suffix) {
    case "cuda":
      return `${bwdif && hasFilter(plan, "bwdif_cuda") ? "bwdif" : "yadif"}_cuda=${double}:-1:0`
    case "videotoolbox":
      return `${bwdif && hasFilter(plan, "bwdif_videotoolbox") ? "bwdif" : "yadif"}_videotoolbox=${double}:-1:0`
    default:
      return `deinterlace_vaapi=rate=${plan.doubleRate ? "field" : "frame"}`
  }
}

const SDR_PARAMS =
  "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709"

/** GetInputHdrParam: tags the frames as the HDR they are. */
function inputHdrParams(plan: Plan): string {
  return `setparams=color_primaries=bt2020:color_trc=${plan.transfer}:colorspace=bt2020nc`
}

/**
 * GetOverwriteColorPropertiesParam: HDR tags ahead of a tone mapper, BT.709
 * otherwise. An HDR source that nothing tone maps comes out washed out but
 * tagged SDR, as in Jellyfin.
 */
function colorParams(plan: Plan, toneMapping: boolean): string {
  if (plan.keepHdr || toneMapping) return inputHdrParams(plan)
  return SDR_PARAMS
}

/** GetHwTonemapFilter for OpenCL, CUDA, Metal, and VAAPI's VPP. */
function hwTonemapFilter(
  plan: Plan,
  suffix: "opencl" | "cuda" | "videotoolbox" | "vaapi",
  format: string,
): string {
  const s = plan.settings
  if (suffix === "vaapi") {
    const procamp: string[] = []
    const brightness = s.vppTonemappingBrightness
    if (brightness !== 0 && brightness >= -100 && brightness <= 100) {
      procamp.push(`b=${num(brightness)}`)
    }
    if (s.vppTonemappingContrast > 1 && s.vppTonemappingContrast <= 10) {
      procamp.push(`c=${num(s.vppTonemappingContrast)}`)
    }
    const tonemap = `tonemap_vaapi=format=${format}:p=bt709:t=bt709:m=bt709:extra_hw_frames=32`
    return procamp.length > 0
      ? `procamp_vaapi=${procamp.join(":")},${tonemap}`
      : tonemap
  }
  let filter = `tonemap_${suffix}=format=${format}:p=bt709:t=bt709:m=bt709:tonemap=${s.tonemappingAlgorithm}:peak=${num(s.tonemappingPeak)}:desat=${num(s.tonemappingDesat)}`
  const mode = s.tonemappingMode
  const legacyMode =
    (mode === "max" || mode === "rgb") && versionAtLeast(plan, [5, 1, 3])
  const advancedMode =
    (mode === "lum" || mode === "itp") && versionAtLeast(plan, [7, 0, 1])
  if (legacyMode || advancedMode) filter += `:tonemap_mode=${mode}`
  if (s.tonemappingParam !== 0) filter += `:param=${num(s.tonemappingParam)}`
  if (s.tonemappingRange !== "auto") filter += `:range=${s.tonemappingRange}`
  return filter
}

/* The chains. Each returns its filters and the decoder it was built for. */

type Chain = {
  filters: string[]
  decoder: Decoder | null
  toneMapper: ToneMapper | null
  /** The chain scales on the GPU, which caps the size at 4096. */
  hardwareScaling: boolean
  /** Devices beyond the acceleration's own that the chain needs. */
  opencl: "none" | "device" | "filter-device"
}

function filterChain(plan: Plan): Chain {
  const decodes = hardwareDecodes(plan)
  switch (plan.accel) {
    case "vaapi":
      return vaapiChain(plan, decodes)
    case "qsv":
      return qsvChain(plan, decodes)
    case "nvenc":
      return nvidiaChain(plan, decodes)
    case "videotoolbox":
      return appleChain(plan, decodes)
    default:
      return softwareChain(plan, null)
  }
}

/**
 * GetSwVidFilterChain: CPU filters, after a CPU decoder or a GPU one that
 * copies frames back. tonemapx tone maps, and reshapes Dolby Vision 5 with
 * the RPU the decoder passes along.
 */
function softwareChain(plan: Plan, decoder: Decoder | null): Chain {
  const toneMap = swTonemapAvailable(plan)
  const isDovi = toneMap && videoColorRange(plan.source).type === "DOVI"
  const vaapiEncoder = isHardwareEncoder(plan, "vaapi")
  const filters = [colorParams(plan, toneMap)]
  if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))

  let format = decoder === null ? "yuv420p" : "nv12"
  if (vaapiEncoder) format = "nv12"
  if (plan.keepHdr) {
    format = decoder === null && !vaapiEncoder ? "yuv420p10le" : "p010le"
  }
  filters.push(swScaleFilter(plan))

  if (toneMap) {
    // tonemapx reshapes Dolby Vision from yuv420p10 input only; ffmpeg
    // converts on the way when needed.
    const toneMapFormat = isDovi ? "yuv420p" : format
    let tonemap = `tonemapx=tonemap=${plan.settings.tonemappingAlgorithm}:desat=${num(plan.settings.tonemappingDesat)}:peak=${num(plan.settings.tonemappingPeak)}:t=bt709:m=bt709:p=bt709:format=${toneMapFormat}`
    if (plan.settings.tonemappingParam !== 0) {
      tonemap += `:param=${num(plan.settings.tonemappingParam)}`
    }
    if (plan.settings.tonemappingRange !== "auto") {
      tonemap += `:range=${plan.settings.tonemappingRange}`
    }
    filters.push(tonemap)
    // Jellyfin: the encoder's format again after Dolby Vision's.
    if (toneMapFormat !== format) filters.push(`format=${format}`)
  } else {
    filters.push(`format=${format}`)
  }
  // The legacy VAAPI pipeline uploads for the encoder.
  if (vaapiEncoder) filters.push("hwupload=derive_device=vaapi")
  return {
    filters,
    decoder,
    toneMapper: toneMap ? "tonemapx" : null,
    hardwareScaling: false,
    opencl: "none",
  }
}

/**
 * A GPU chain that can't tone map gets the software chain instead, with
 * the GPU decoding into system memory. Jellyfin leaves such encodes washed
 * out; it falls back only when the GPU filters are missing altogether.
 */
function softwareToneMapFallback(plan: Plan, decodes: boolean): Chain | null {
  if (!plan.wantToneMap || !swTonemapAvailable(plan)) return null
  return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
}

/**
 * GetVaapiVidFilterChain: Intel's iHD driver gets the full chain with VPP
 * and OpenCL tone mapping, i965 and AMD the limited one, and builds without
 * the VAAPI and OpenCL filters the legacy one (CPU filters, then upload).
 */
function vaapiChain(plan: Plan, decodes: boolean): Chain {
  const vaapiEncoder = isHardwareEncoder(plan, "vaapi")
  const full =
    isVaapiSupported(plan) &&
    isVaapiFullSupported(plan) &&
    isOpenclFullSupported(plan) &&
    hasFilter(plan, "alphasrc")
  if ((!decodes && !vaapiEncoder) || !full) {
    return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
  }
  const decoder = decodes ? hardwareDecoder(plan, true) : null
  const intel = plan.hardware?.vendor === "intel-ihd"
  const vpp = intel && decoder !== null && vppTonemapAvailable(plan)
  const opencl = !vpp && hwTonemapAvailable(plan, decoder)
  if (plan.wantToneMap && !vpp && !opencl) {
    const fallback = softwareToneMapFallback(plan, decodes)
    if (fallback) return fallback
  }
  return intel
    ? intelVaapiChain(plan, decoder, vpp, opencl)
    : limitedVaapiChain(plan, decoder, opencl)
}

/** GetIntelVaapiFullVidFiltersPrefered, without subtitles and rotation. */
function intelVaapiChain(
  plan: Plan,
  decoder: Decoder | null,
  vpp: boolean,
  opencl: boolean,
): Chain {
  const vaapiEncoder = isHardwareEncoder(plan, "vaapi")
  const swEncoder = !vaapiEncoder
  const vaapiDecoder = decoder !== null
  const vaInVaOut = vaapiDecoder && vaapiEncoder
  const toneMap = vpp || opencl
  const filters = [colorParams(plan, toneMap)]

  if (!vaapiDecoder) {
    if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))
    let format = opencl ? "yuv420p10le" : "nv12"
    if (plan.keepHdr) format = swEncoder ? "yuv420p10le" : "p010le"
    filters.push(swScaleFilter(plan), `format=${format}`)
    // Keep frames in memory but for OpenCL: uploading costs more than the
    // CPU filters.
    if (opencl) filters.push("hwupload=derive_device=opencl")
  } else {
    if (plan.deinterlace) filters.push(hwDeinterlaceFilter(plan, "vaapi"))
    let format = toneMap ? (isHevcRext(plan.source) ? "p010" : "") : "nv12"
    if (plan.keepHdr) format = "p010"
    let scale = hwScaleFilter(plan, "scale", "vaapi", format)
    // Extra pool for the VPP scaler.
    if (scale) scale += ":extra_hw_frames=24"
    filters.push(scale)
  }

  if (vpp && vaapiDecoder) {
    // Jellyfin, as after its QSV VPP tone mapping: tag the result BT.709,
    // which tonemap_vaapi leaves to the frames and software encoders miss.
    filters.push(hwTonemapFilter(plan, "vaapi", "nv12"), SDR_PARAMS)
  }
  // VAAPI to OpenCL through Intel's interop.
  if (opencl && vaapiDecoder)
    filters.push("hwmap=derive_device=opencl:mode=read")
  if (opencl) filters.push(hwTonemapFilter(plan, "opencl", "nv12"))
  if (opencl && vaInVaOut) {
    // And back, for the encoder.
    filters.push(
      "hwmap=derive_device=vaapi:mode=write:reverse=1",
      "format=vaapi",
    )
  }

  const uploadForOpencl = !vaapiDecoder && opencl
  let memoryOutput = false
  if ((vaapiDecoder && swEncoder) || uploadForOpencl) {
    memoryOutput = true
    const format = plan.keepHdr ? "p010" : "nv12"
    filters.push(
      uploadForOpencl && vaapiEncoder ? "hwdownload" : "hwmap=mode=read",
      `format=${format}`,
    )
  }
  if (!vaapiDecoder && vaapiEncoder) memoryOutput = true
  if (memoryOutput && vaapiEncoder) filters.push("hwupload_vaapi")

  return {
    filters,
    decoder,
    toneMapper: vpp ? "vpp" : opencl ? "opencl" : null,
    hardwareScaling: vaapiDecoder,
    opencl: opencl && !vaapiDecoder ? "filter-device" : "none",
  }
}

/**
 * GetVaapiLimitedVidFiltersPrefered: i965 and AMD scale and deinterlace on
 * the GPU; OpenCL tone mapping goes through system memory but on i965.
 */
function limitedVaapiChain(
  plan: Plan,
  decoder: Decoder | null,
  opencl: boolean,
): Chain {
  const vaapiEncoder = isHardwareEncoder(plan, "vaapi")
  const swEncoder = !vaapiEncoder
  const vaapiDecoder = decoder !== null
  const vaInVaOut = vaapiDecoder && vaapiEncoder
  const i965 = plan.hardware?.vendor === "intel-i965"
  const filters = [colorParams(plan, opencl)]

  if (!vaapiDecoder) {
    if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))
    let format = opencl ? "yuv420p10le" : "nv12"
    if (plan.keepHdr) format = swEncoder ? "yuv420p10le" : "p010le"
    filters.push(swScaleFilter(plan), `format=${format}`)
    if (opencl) filters.push("hwupload=derive_device=opencl")
  } else {
    if (plan.deinterlace) filters.push(hwDeinterlaceFilter(plan, "vaapi"))
    const format = plan.keepHdr ? "p010" : opencl ? "" : "nv12"
    let scale = hwScaleFilter(plan, "scale", "vaapi", format)
    if (scale) scale += ":extra_hw_frames=24"
    filters.push(scale)
  }

  if (opencl && vaapiDecoder) {
    if (i965) {
      filters.push("hwmap=derive_device=opencl")
    } else {
      filters.push(
        "hwdownload",
        "format=p010le",
        "hwupload=derive_device=opencl",
      )
    }
  }
  if (opencl) filters.push(hwTonemapFilter(plan, "opencl", "nv12"))
  if (opencl && vaInVaOut && i965) {
    filters.push("hwmap=derive_device=vaapi:reverse=1", "format=vaapi")
  }

  const uploadForOpencl = opencl && (!vaapiDecoder || !i965)
  let memoryOutput = false
  if ((vaapiDecoder && swEncoder) || uploadForOpencl) {
    memoryOutput = true
    const format = plan.keepHdr ? "p010" : "nv12"
    filters.push(uploadForOpencl ? "hwdownload" : "hwmap", `format=${format}`)
  }
  if (!vaapiDecoder && vaapiEncoder) memoryOutput = true
  if (memoryOutput && vaapiEncoder) filters.push("hwupload_vaapi")

  return {
    filters,
    decoder,
    toneMapper: opencl ? "opencl" : null,
    hardwareScaling: vaapiDecoder,
    // i965 maps VAAPI frames to OpenCL; AMD and CPU frames upload to an
    // OpenCL device of its own.
    opencl: opencl && (!vaapiDecoder || !i965) ? "filter-device" : "none",
  }
}

/**
 * GetIntelVidFilterChain on Linux: QSV encodes, VAAPI decodes (Jellyfin's
 * default "prefer the system's native decoder"), VAAPI and OpenCL filter.
 */
function qsvChain(plan: Plan, decodes: boolean): Chain {
  const qsvEncoder = isHardwareEncoder(plan, "qsv")
  const swEncoder = !qsvEncoder
  const supported =
    hasHwaccel(plan, "qsv") &&
    isVaapiSupported(plan) &&
    isOpenclFullSupported(plan) &&
    hasFilter(plan, "alphasrc")
  if ((!decodes && swEncoder) || !supported) {
    return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
  }
  const decoder = decodes ? hardwareDecoder(plan, true) : null
  const hwDecoder = decoder !== null
  // Jellyfin: VPP tone mapping needs the GPU to decode, as in the VAAPI
  // chain. Jellyfin's QSV chain skips tone mapping altogether otherwise.
  const vpp = hwDecoder && vppTonemapAvailable(plan)
  const opencl = !vpp && hwTonemapAvailable(plan, decoder)
  if (plan.wantToneMap && !vpp && !opencl) {
    const fallback = softwareToneMapFallback(plan, decodes)
    if (fallback) return fallback
  }
  const toneMap = vpp || opencl
  const qsvInQsvOut = hwDecoder && qsvEncoder
  const filters = [colorParams(plan, toneMap)]

  if (!hwDecoder) {
    if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))
    let format = opencl ? "yuv420p10le" : "nv12"
    if (plan.keepHdr) format = swEncoder ? "yuv420p10le" : "p010le"
    filters.push(swScaleFilter(plan), `format=${format}`)
    if (opencl) filters.push("hwupload=derive_device=opencl")
  } else {
    if (plan.deinterlace) filters.push(hwDeinterlaceFilter(plan, "vaapi"))
    let format = toneMap ? (isHevcRext(plan.source) ? "p010" : "") : "nv12"
    if (plan.keepHdr) format = "p010"
    let scale = hwScaleFilter(plan, "scale", "vaapi", format)
    if (scale) scale += ":extra_hw_frames=24"
    filters.push(scale)
  }

  if (vpp) filters.push(hwTonemapFilter(plan, "vaapi", "nv12"), SDR_PARAMS)
  if (opencl && hwDecoder) filters.push("hwmap=derive_device=opencl:mode=read")
  if (opencl) filters.push(hwTonemapFilter(plan, "opencl", "nv12"))

  const uploadForOpencl = !hwDecoder && opencl
  if ((hwDecoder && swEncoder) || uploadForOpencl) {
    const format = plan.keepHdr ? "p010" : "nv12"
    // Prefer hwmap to hwdownload on OpenCL and VAAPI.
    const hwmap = swEncoder && (opencl || hwDecoder)
    filters.push(hwmap ? "hwmap=mode=read" : "hwdownload", `format=${format}`)
  }
  if (qsvInQsvOut) {
    if (opencl) {
      // Back through the interop, with room for hevc_qsv.
      filters.push(
        "hwmap=derive_device=qsv:mode=write:reverse=1:extra_hw_frames=16",
        "format=qsv",
      )
    } else {
      filters.push("hwmap=derive_device=qsv", "format=qsv")
    }
  }

  return {
    filters,
    decoder,
    toneMapper: vpp ? "vpp" : opencl ? "opencl" : null,
    hardwareScaling: hwDecoder,
    opencl: opencl ? (hwDecoder ? "device" : "filter-device") : "none",
  }
}

/** GetNvidiaVidFiltersPrefered: CUDA decode, filters, and tone mapping. */
function nvidiaChain(plan: Plan, decodes: boolean): Chain {
  const nvencEncoder = isHardwareEncoder(plan, "nvenc")
  if (
    (!decodes && !nvencEncoder) ||
    !isCudaFullSupported(plan) ||
    !hasFilter(plan, "alphasrc")
  ) {
    return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
  }
  const decoder = decodes ? hardwareDecoder(plan, true) : null
  const cuda = hwTonemapAvailable(plan, decoder)
  if (plan.wantToneMap && !cuda) {
    const fallback = softwareToneMapFallback(plan, decodes)
    if (fallback) return fallback
  }
  const nvDecoder = decoder !== null
  const filters = [colorParams(plan, cuda)]

  if (!nvDecoder) {
    if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))
    const format = cuda || plan.keepHdr ? "p010le" : "yuv420p"
    filters.push(swScaleFilter(plan), `format=${format}`)
    if (cuda) filters.push("hwupload=derive_device=cuda")
  } else {
    if (plan.deinterlace) filters.push(hwDeinterlaceFilter(plan, "cuda"))
    const format = plan.keepHdr
      ? "p010"
      : cuda
        ? isHevcRext(plan.source)
          ? "p010"
          : ""
        : "yuv420p"
    filters.push(hwScaleFilter(plan, "scale", "cuda", format))
  }
  if (cuda) filters.push(hwTonemapFilter(plan, "cuda", "yuv420p"))
  if (nvDecoder && !nvencEncoder) {
    filters.push("hwdownload", `format=${plan.keepHdr ? "p010le" : "yuv420p"}`)
  }
  return {
    filters,
    decoder,
    toneMapper: cuda ? "cuda" : null,
    hardwareScaling: nvDecoder,
    opencl: "none",
  }
}

/** GetAppleVidFiltersPreferred: VideoToolbox decode, scale, and tone map. */
function appleChain(plan: Plan, decodes: boolean): Chain {
  const vtEncoder = isHardwareEncoder(plan, "videotoolbox")
  if (
    (!decodes && !vtEncoder) ||
    !isVideoToolboxFullSupported(plan) ||
    !hasFilter(plan, "alphasrc")
  ) {
    return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
  }
  const decoder = decodes ? hardwareDecoder(plan, true) : null
  const vt = videoToolboxTonemapAvailable(plan)
  const metal = !vt && hwTonemapAvailable(plan, decoder)
  if (plan.wantToneMap && !vt && !metal) {
    const fallback = softwareToneMapFallback(plan, decodes)
    if (fallback) return fallback
  }
  // Working VideoToolbox surfaces came with jellyfin-ffmpeg 7.0.1.
  const hwSurface = decoder !== null && versionAtLeast(plan, [7, 0, 1])
  const pixel = plan.source.pixelFormat ?? ""
  let format = ""
  // P010 for Metal tone mapping, else 8 bits.
  if (pixel !== "yuv420p") {
    if (metal) {
      if (pixel !== "yuv420p10le") format = "p010le"
    } else {
      format = "nv12"
    }
  }
  if (plan.keepHdr) format = "p010le"
  let scale = hwScaleFilter(plan, "scale", "vt", format)
  if (vt) {
    // scale_vt scales and tone maps in one go.
    const args = "color_matrix=bt709:color_primaries=bt709:color_transfer=bt709"
    scale = scale ? `${scale}:${args}` : `scale_vt=${args}`
  }
  const filters: string[] = []
  if (plan.deinterlace) filters.push(hwDeinterlaceFilter(plan, "videotoolbox"))
  filters.push(scale)
  if (metal) filters.push(hwTonemapFilter(plan, "videotoolbox", "nv12"))
  const download = vtEncoder
    ? []
    : ["hwdownload", `format=${plan.keepHdr ? "p010le" : "nv12"}`]
  if (hwSurface) {
    filters.push(...download)
  } else if (filters.some((filter) => filter !== "")) {
    // Without working surfaces, frames go up and come back.
    filters.unshift("format=nv12|p010le|videotoolbox_vld", "hwupload")
    filters.push(...download)
  }
  return {
    filters,
    decoder,
    toneMapper: vt ? "videotoolbox" : metal ? "metal" : null,
    hardwareScaling: true,
    opencl: "none",
  }
}

/* Devices, from GetInputVideoHwaccelArgs. */

const VAAPI = "va"
const QSV = "qs"
const OPENCL = "ocl"
const CUDA = "cu"
const VIDEOTOOLBOX = "vt"

/**
 * A VAAPI device on the configured node, or Intel's when there is none:
 * by vendor id from 7.0.1, by kernel driver before.
 */
function vaapiDevice(plan: Plan, path: string, driver: string | null): string {
  const intel = versionAtLeast(plan, [7, 0, 1])
    ? ",vendor_id=0x8086"
    : ",kernel_driver=i915"
  const node = path || intel
  return `vaapi=${VAAPI}:${node}${driver ? `,driver=${driver}` : ""}`
}

/** OpenCL for the VAAPI vendor: Intel's maps VAAPI frames, AMD's is ROCm. */
export function openclDevice(vendor: string | null | undefined): string {
  if (vendor === "amd")
    return `opencl=${OPENCL}:.0,device_vendor=Advanced Micro Devices`
  if (vendor === "intel-ihd" || vendor === "intel-i965")
    return `opencl=${OPENCL}@${VAAPI}`
  return `opencl=${OPENCL}:0.0`
}

function deviceArgs(plan: Plan, chain: Chain): string[] {
  const decoder = chain.decoder
  const s = plan.settings
  switch (plan.accel) {
    case "vaapi": {
      if (!hasHwaccel(plan, "vaapi")) return []
      if (!decoder && !isHardwareEncoder(plan, "vaapi")) return []
      const vendor = plan.hardware?.vendor
      const driver =
        vendor === "intel-ihd" ? "iHD" : vendor === "intel-i965" ? "i965" : null
      const args = ["-init_hw_device", vaapiDevice(plan, s.vaapiDevice, driver)]
      if (chain.opencl === "filter-device") {
        args.push(
          "-init_hw_device",
          openclDevice(vendor),
          "-filter_hw_device",
          OPENCL,
        )
      } else if (vendor === "amd") {
        args.push("-filter_hw_device", VAAPI)
      }
      return args
    }
    case "qsv": {
      if (!hasHwaccel(plan, "qsv")) return []
      if (!decoder && !isHardwareEncoder(plan, "qsv")) return []
      // QSV on Linux is derived from Intel's VAAPI device.
      const args = [
        "-init_hw_device",
        vaapiDevice(plan, s.qsvDevice, "iHD"),
        "-init_hw_device",
        `qsv=${QSV}@${VAAPI}`,
      ]
      let filterDevice = QSV
      if (chain.opencl !== "none") {
        args.push("-init_hw_device", `opencl=${OPENCL}@${VAAPI}`)
        if (chain.opencl === "filter-device") filterDevice = OPENCL
      }
      return [...args, "-filter_hw_device", filterDevice]
    }
    case "nvenc":
      if (!isCudaFullSupported(plan)) return []
      if (!decoder && !isHardwareEncoder(plan, "nvenc")) return []
      return ["-init_hw_device", `cuda=${CUDA}:0`, "-filter_hw_device", CUDA]
    case "videotoolbox":
      if (!hasHwaccel(plan, "videotoolbox")) return []
      if (!decoder && !isHardwareEncoder(plan, "videotoolbox")) return []
      return ["-init_hw_device", `videotoolbox=${VIDEOTOOLBOX}`]
    default:
      return []
  }
}

/* Encoding, from GetVideoQualityParam and its helpers. */

/** x264 preset names in Jellyfin's order, fastest last. */
const PRESET_ORDER: readonly EncoderPreset[] = [
  "veryslow",
  "slower",
  "slow",
  "medium",
  "fast",
  "faster",
  "veryfast",
  "superfast",
  "ultrafast",
]

const SVT_PRESETS = new Map<EncoderPreset, string>([
  ["veryslow", "5"],
  ["slower", "6"],
  ["slow", "7"],
  ["medium", "8"],
  ["fast", "9"],
  ["faster", "10"],
  ["veryfast", "11"],
  ["superfast", "12"],
  ["ultrafast", "13"],
])

const NVENC_PRESETS = new Map<EncoderPreset, string>([
  ["veryslow", "p7"],
  ["slower", "p6"],
  ["slow", "p5"],
  ["medium", "p4"],
  ["fast", "p3"],
  ["faster", "p2"],
])

/** GetEncoderParam: the preset, and CRF for x264 and x265. */
function presetArgs(plan: Plan): string[] {
  const { encoder, settings } = plan
  const preset = settings.encoderPreset
  if (encoder === "libx264" || encoder === "libx265") {
    const crf = encoder === "libx265" ? settings.hevcCrf : settings.h264Crf
    return [
      "-preset",
      preset === "auto" ? "veryfast" : preset,
      "-crf",
      String(crf),
    ]
  }
  if (encoder === "libsvtav1") {
    // 10 is SVT-AV1's recommendation; below 5 is too slow to stream.
    return ["-preset", SVT_PRESETS.get(preset) ?? "10"]
  }
  if (encoder.endsWith("_vaapi")) {
    // compression_level isn't reliable on AMD.
    if (plan.hardware?.vendor !== "intel-ihd" || preset === "auto") return []
    const level = Math.min(PRESET_ORDER.indexOf(preset) + 1, 7)
    return ["-compression_level", String(level)]
  }
  if (encoder.endsWith("_qsv")) {
    const valid = PRESET_ORDER.slice(0, 7).includes(preset)
    const args = ["-preset", valid ? preset : "veryfast"]
    // Macroblock-level rate control looks better.
    if (encoder !== "av1_qsv") args.push("-mbbrc", "1")
    return args
  }
  if (encoder.endsWith("_nvenc")) {
    const args = ["-preset", NVENC_PRESETS.get(preset) ?? "p1"]
    // Spatial AQ, but not for H.264, which Maxwell 1 lacks.
    if (encoder !== "h264_nvenc")
      args.push("-spatial-aq", "1", "-aq-strength", "15")
    return args
  }
  if (encoder.endsWith("_videotoolbox")) {
    const slow = ["veryslow", "slower", "slow", "medium"].includes(preset)
    return ["-prio_speed", slow ? "0" : "1"]
  }
  return []
}

/** GetVideoBitrateParam. */
function bitrateArgs(plan: Plan, bitrate: number): string[] {
  const { encoder } = plan
  const rate = Math.round(
    encoder === "h264_qsv" ? Math.max(bitrate, 1000) : bitrate,
  )
  const bufsize = String(rate * 2)
  if (encoder === "libsvtav1")
    return ["-b:v", String(rate), "-bufsize", bufsize]
  if (encoder === "libx264" || encoder === "libx265") {
    return ["-maxrate", String(rate), "-bufsize", bufsize]
  }
  if (encoder.endsWith("_qsv")) {
    // Weak H.264 decoders need the strict buffer of low levels.
    const factor =
      plan.target.codec === "h264" &&
      plan.target.level !== undefined &&
      plan.target.level < 51
        ? 1
        : 2
    // maxrate one above the bitrate makes QSV pick VBR; the larger buffer
    // copes with scene changes.
    return [
      "-b:v",
      String(rate),
      "-maxrate",
      String(rate + 1),
      "-rc_init_occupancy",
      String(rate * factor),
      "-bufsize",
      String(rate * 2 * factor),
    ]
  }
  if (encoder.endsWith("_vaapi")) {
    // VBR on i965 can come out blocky.
    const mode = plan.hardware?.vendor === "intel-i965" ? "CBR" : "VBR"
    return [
      "-rc_mode",
      mode,
      "-b:v",
      String(rate),
      "-maxrate",
      String(rate),
      "-bufsize",
      bufsize,
    ]
  }
  if (encoder.endsWith("_videotoolbox")) {
    // maxrate and bufsize can stall VideoToolbox.
    return ["-b:v", String(rate), "-qmin", "-1", "-qmax", "-1"]
  }
  return ["-b:v", String(rate), "-maxrate", String(rate), "-bufsize", bufsize]
}

/**
 * Jellyfin: without a bitrate, the GPU encoders run at a constant quality
 * from the CRF setting, as alloy does; Jellyfin always has a bitrate.
 */
function qualityArgs(plan: Plan): string[] {
  const { encoder, settings } = plan
  const quality =
    plan.target.codec === "h264" ? settings.h264Crf : settings.hevcCrf
  if (encoder.endsWith("_nvenc"))
    return ["-rc", "vbr", "-cq", String(quality), "-b:v", "0"]
  if (encoder.endsWith("_qsv")) return ["-global_quality", String(quality)]
  if (encoder.endsWith("_vaapi"))
    return ["-rc_mode", "CQP", "-qp", String(quality)]
  if (encoder.endsWith("_videotoolbox")) {
    const q = Math.max(
      1,
      Math.min(100, Math.round(((51 - quality) * 100) / 51)),
    )
    return ["-q:v", String(q)]
  }
  return []
}

/** The profile, as GetVideoQualityParam settles it for each encoder. */
function profileFor(plan: Plan): string | null {
  const { encoder } = plan
  switch (plan.target.codec) {
    case "h264":
      return "high"
    case "hevc":
      return plan.keepHdr ? "main10" : "main"
    default:
      // av1_nvenc has no profile option.
      return encoder === "av1_nvenc" ? null : "main"
  }
}

/** NormalizeTranscodingLevel: at most H.264 5.1, HEVC 5.0, AV1 5.3. */
function normalizedLevel(plan: Plan): number | null {
  const level = plan.target.level
  if (level === undefined || !Number.isFinite(level)) return null
  switch (plan.target.codec) {
    case "av1":
      return level < 0 || level >= 15 ? 15 : Math.round(level)
    case "hevc":
      return level < 0 || level >= 150 ? 150 : Math.round(level)
    default:
      return level < 0 || level >= 51 ? 51 : Math.round(level)
  }
}

/** The level the way each encoder spells it, or null to leave it out. */
function levelArg(plan: Plan, level: number): string | null {
  const { encoder } = plan
  if (encoder === "h264_qsv" || encoder === "libx264") return String(level)
  // hevc_qsv takes 51 for 5.1, not 153.
  if (encoder === "hevc_qsv") return num(level / 3)
  if (encoder === "av1_qsv" || encoder === "libsvtav1") {
    // They take 53 for the seq_level_idx 15.
    return String((2 + (level >> 2)) * 10 + (level & 3))
  }
  // NVENC can't adjust a level, it fails.
  if (encoder.endsWith("_nvenc")) return null
  if (encoder.endsWith("_vaapi")) {
    // A level can corrupt frames on AMD.
    const intel =
      plan.hardware?.vendor === "intel-ihd" ||
      plan.hardware?.vendor === "intel-i965"
    return intel ? String(level) : null
  }
  // x265 takes a level only in its params, and fails on a wrong one.
  if (encoder === "libx265") return null
  return String(level)
}

/** The encoder's arguments, and the profile and level among them. */
type Encoding = { args: string[]; profile: string | null; level: number | null }

function encoderArgs(plan: Plan): Encoding {
  const { encoder, target, keepHdr } = plan
  const args = ["-c:v:0", encoder, ...presetArgs(plan)]
  args.push(
    ...(target.bitrate ? bitrateArgs(plan, target.bitrate) : qualityArgs(plan)),
  )

  const profile = profileFor(plan)
  if (profile) args.push("-profile:v:0", profile)
  const level = normalizedLevel(plan)
  const levelText = level === null ? null : levelArg(plan, level)
  if (levelText !== null) args.push("-level", levelText)

  if (encoder === "libx264") {
    args.push(
      "-x264opts:0",
      "subme=0:me_range=16:rc_lookahead=10:me=hex:open_gop=0",
    )
  }
  if (encoder === "libx265") {
    let params = "no-scenecut=1:no-open-gop=1:no-info=1"
    if (plan.settings.encoderPreset !== "ultrafast") {
      // Slower than ultrafast itself.
      params +=
        ":subme=3:merange=25:rc-lookahead=10:me=star:ctu=32:max-tu-size=32:min-cu-size=16:rskip=2:rskip-edge-threshold=2:no-sao=1:no-strong-intra-smoothing=1"
    }
    args.push("-x265-params:0", params)
    // B-frames broke fMP4 HLS on iOS before 7.0.1.
    if (!versionAtLeast(plan, [7, 0, 1])) args.push("-bf", "0")
  }
  if (encoder === "libsvtav1" && versionAtLeast(plan, [5, 1, 0])) {
    // rc=1 is VBR, which wants a bitrate. Without one SVT-AV1 keeps CRF.
    const rc = target.bitrate ? "rc=1:" : ""
    args.push(
      "-svtav1-params:0",
      `${rc}tune=0:film-grain=0:enable-overlays=1:enable-tf=0`,
    )
  }
  // "Access unit too large" without it.
  if (
    (encoder === "h264_vaapi" || encoder === "hevc_vaapi") &&
    versionAtLeast(plan, [6, 0, 0])
  ) {
    args.push("-sei", "-a53_cc")
  }
  // fMP4 HLS wants hvc1 over hev1.
  if (target.codec === "hevc") args.push("-tag:v:0", "hvc1")

  if (keepHdr) {
    // An encode carries the base layer's static HDR only. libx265 and
    // libsvtav1 write Dolby Vision when ffmpeg hands them the source's
    // configuration; never let them.
    if (
      (encoder === "libx265" || encoder === "libsvtav1") &&
      plan.caps.features.encoderDolbyVisionOption
    ) {
      args.push("-dolbyvision", "0")
    }
  }
  // No -color_* options: the frames carry their tags, and options that
  // differ make ffmpeg insert a CPU converter after GPU filters, which fails.
  return { args, profile, level }
}

/** Encoders that ignore forced keyframes and take a GOP length instead. */
const GOP_ONLY_ENCODERS = [
  "h264_qsv",
  "h264_nvenc",
  "hevc_qsv",
  "hevc_nvenc",
  "av1_qsv",
  "av1_nvenc",
  "libsvtav1",
]

type GopLength = { frames: number; exact: boolean }

/**
 * Frames per segment at the output frame rate, rounded up unless whole;
 * zero when the rate is unknown. `exact` when a segment is a whole number
 * of frames, so the GOP is exactly one segment long.
 */
function gopLength(plan: Plan): GopLength {
  const fps =
    (plan.source.frameRate ?? 0) * (plan.deinterlace && plan.doubleRate ? 2 : 1)
  const frames = plan.target.segmentSeconds * fps
  const whole = Math.round(frames)
  // Within a hundredth of a frame is whole: the probe rounds frame rates.
  const exact = frames > 0 && Math.abs(frames - whole) < 0.01
  return { frames: exact ? whole : Math.ceil(frames), exact }
}

/** Seconds from `startSeconds` to the next segment boundary, 0 on one. */
function boundaryOffset(target: VideoTarget): number {
  const offset = target.startSeconds % target.segmentSeconds
  const toNext = target.segmentSeconds - offset
  return offset > 0.001 && toNext > 0.001 ? toNext : 0
}

/**
 * GetHlsVideoKeyFrameArguments: a keyframe at every segment boundary.
 * Encoders that ignore forced keyframes get a fixed GOP instead. ffmpeg's
 * `t` counts from the encode's first frame, `-copyts` or not, so a start
 * between boundaries delays the first forced keyframe to the next one.
 */
function keyframeArgs(plan: Plan): string[] {
  const { encoder, target } = plan
  const segment = target.segmentSeconds
  // Jellyfin: always starts on a boundary.
  const first = boundaryOffset(target)
  const force = [
    "-force_key_frames:0",
    first > 0
      ? `expr:gte(t,${num(first)}+n_forced*${num(segment)})`
      : `expr:gte(t,n_forced*${num(segment)})`,
  ]
  // Forcing alone isn't enough: a scene cut halfway would push the next
  // keyframe past the segment.
  const { frames } = gopLength(plan)
  const gop =
    frames > 0
      ? ["-g:v:0", String(frames), "-keyint_min:v:0", String(frames)]
      : []
  // These count the GOP from the first frame, see keyframesOnBoundaries.
  if (GOP_ONLY_ENCODERS.includes(encoder)) return gop
  // AMD's HEVC VAAPI parameter sets disagree with the extradata, which
  // breaks hvc1. Take the extradata from the stream instead.
  const amdExtradata =
    encoder === "hevc_vaapi" && plan.hardware?.vendor === "amd"
      ? ["-flags:v", "-global_header", "-bsf:v", "extract_extradata=remove=0"]
      : []
  if (
    ["libx264", "libx265", "h264_vaapi", "hevc_vaapi", "av1_vaapi"].includes(
      encoder,
    )
  ) {
    // libx264 would move them at scene cuts.
    if (encoder === "libx264") return [...force, "-sc_threshold:v:0", "0"]
    return [...force, ...amdExtradata]
  }
  return [...force, ...gop]
}
