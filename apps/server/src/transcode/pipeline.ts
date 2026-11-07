import type {
  TranscodeVideoCodec,
  TranscodingCapabilities,
  TranscodingSettings,
  VideoStream,
} from "@matinee/contracts"

import { baseLayerRange, videoColorRange } from "./range"
import { appleChain } from "./video/chains/apple"
import { nvidiaChain } from "./video/chains/nvidia"
import { qsvChain } from "./video/chains/qsv"
import { softwareChain } from "./video/chains/software"
import { vaapiChain } from "./video/chains/vaapi"
import { hardwareDecoder, hardwareDecodes } from "./video/decoder"
import { deviceArgs } from "./video/devices"
import {
  chooseEncoder,
  encoderWorks,
  softwareEncoderName,
  usableHardware,
} from "./video/encoders"
import { encoderArgs } from "./video/encoding"
import { outputSize, subtitleFitFilters } from "./video/filters"
import {
  boundaryOffset,
  GOP_ONLY_ENCODERS,
  gopLength,
  keyframeArgs,
} from "./video/keyframes"
import type {
  Chain,
  Overlay,
  Plan,
  VideoPipeline,
  VideoTarget,
} from "./video/types"

/*
 * The video half of an HLS fMP4 transcode: ffmpeg arguments for decoding,
 * filtering, and encoding one video stream, ported from Jellyfin's
 * EncodingHelper (GetInputVideoHwaccelArgs, the Get*VidFilterChain methods,
 * GetVideoQualityParam, GetHlsVideoKeyFrameArguments). Pure: the settings
 * and the detected capabilities say everything it needs.
 *
 * Left out from Jellyfin: text subtitle burn-in, rotation, 3D, AMF,
 * Rockchip, Windows (D3D11, QSV over D3D11), and the AMD Vulkan path, which
 * falls back to the limited VAAPI chain. Changed from Jellyfin, each marked
 * "Jellyfin" below: GPU paths that can't tone map fall back to tonemapx,
 * capabilities are what ran rather than what the build lists, odd sizes
 * become even, `keepHdr` encodes 10-bit HDR, which Jellyfin never does, and
 * picture subtitles burn in on the CPU, where Jellyfin overlays them on the
 * GPU.
 */

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

/**
 * The codec an encode for a player comes in: the first of `wanted`, the
 * player's codecs in the order it wants them, that this server can make.
 * H.264 when there is none.
 */
export function encodeCodecFor(
  wanted: readonly TranscodeVideoCodec[],
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): TranscodeVideoCodec {
  const encodable = encodableVideoCodecs(settings, capabilities)
  return wanted.find((codec) => encodable.includes(codec)) ?? "h264"
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
  const used = (filters: string[]) => filters.filter((filter) => filter !== "")
  const overlayAt = chain.overlayAt ?? chain.filters.length
  const size = outputSize(plan, chain.hardwareScaling)
  const overlay: Overlay | null = target.burnIn
    ? {
        stream: target.burnIn,
        fit: subtitleFitFilters(size),
        filters: [
          `overlay=eof_action=pass:repeatlast=0:format=${keepHdr ? "yuv420p10" : "yuv420"}`,
          ...used(chain.filters.slice(overlayAt)),
        ],
      }
    : null
  const filters = used(
    overlay ? chain.filters.slice(0, overlayAt) : chain.filters,
  )
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
    overlay,
    outputArgs,
    encoder: plan.encoder,
    decoder: decoder?.name ?? null,
    toneMapper: chain.toneMapper,
    toneMapMissing: plan.wantToneMap && chain.toneMapper === null,
    keyframesOnBoundaries:
      !GOP_ONLY_ENCODERS.includes(plan.encoder) ||
      (boundaryOffset(target) === 0 && gopLength(plan).exact),
    keyframeSeconds: keyframeSeconds(plan),
    hdr: keepHdr,
    width: size.width,
    height: size.height,
    profile: encoding.profile,
    level: encoding.level,
  }
}

/**
 * `-map` and the filters for the video stream `index` of the first input:
 * a `-vf` chain, or with a subtitle to burn in, a filter graph that draws
 * it on. The encoder's `outputArgs` go after these.
 */
export function videoMapArgs(index: number, pipeline: VideoPipeline): string[] {
  const { filters, overlay } = pipeline
  if (!overlay) {
    return [
      "-map",
      `0:${index}`,
      ...(filters.length > 0 ? ["-vf", filters.join(",")] : []),
    ]
  }
  const graph = [
    `[0:${index}]${filters.length > 0 ? filters.join(",") : "null"}[main]`,
    `[${overlay.stream}]${overlay.fit.join(",")}[sub]`,
    `[main][sub]${overlay.filters.join(",")}[video]`,
  ]
  return ["-filter_complex", graph.join(";"), "-map", "[video]"]
}

/**
 * How to decode `source` for a CPU filter chain, as trickplay reads frames:
 * the input arguments for the configured GPU when the transcoding settings
 * let it decode the source, with each frame copied back to memory. Empty
 * when the CPU decodes. ffmpeg falls back to the CPU on its own when the
 * GPU turns a stream down; a device that won't open fails the run.
 */
export function frameDecoderArgs(
  source: VideoStream,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): string[] {
  const hardware = usableHardware(settings, capabilities)
  if (!hardware) return []
  const plan: Plan = {
    source,
    // Decoding reads none of the target.
    target: {
      codec: "h264",
      segmentSeconds: 6,
      startSeconds: 0,
      keepHdr: false,
    },
    settings,
    caps: capabilities,
    accel: settings.hardwareAcceleration,
    hardware,
    encoder: softwareEncoderName("h264"),
    bitDepth: videoBitDepth(source),
    isHdr: videoColorRange(source).range === "HDR",
    keepHdr: false,
    wantToneMap: false,
    transfer: "smpte2084",
    deinterlace: false,
    doubleRate: false,
  }
  if (!hardwareDecodes(plan)) return []
  const decoder = hardwareDecoder(plan, false)
  const devices = deviceArgs(plan, {
    filters: [],
    decoder,
    toneMapper: null,
    hardwareScaling: false,
    opencl: "none",
  })
  // No device arguments: this ffmpeg lacks the hwaccel.
  if (devices.length === 0) return []
  return [...devices, ...decoder.args]
}

function keyframeSeconds(plan: Plan): number {
  const segment = plan.target.segmentSeconds
  if (!GOP_ONLY_ENCODERS.includes(plan.encoder)) return segment
  const { frames } = gopLength(plan)
  const fps =
    (plan.source.frameRate ?? 0) * (plan.deinterlace && plan.doubleRate ? 2 : 1)
  return frames > 0 && fps > 0 ? frames / fps : segment
}

/** Bit depth, from the probe or the pixel format (GetVideoColorBitDepth). */
export function videoBitDepth(source: VideoStream): number {
  if (source.bitDepth) return source.bitDepth
  const format = source.pixelFormat ?? ""
  if (format.includes("p10")) return 10
  if (format.includes("p12")) return 12
  return 8
}

function filterChain(plan: Plan): Chain {
  const decodes = hardwareDecodes(plan)
  // The overlay works on frames in memory. The GPU still decodes and
  // encodes when it can.
  if (plan.target.burnIn) {
    return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
  }
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
