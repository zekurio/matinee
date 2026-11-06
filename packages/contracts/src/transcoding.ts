import { z } from "zod"

/*
 * Transcoding settings and what the server's ffmpeg can do. The settings are
 * Jellyfin's EncodingOptions, with Jellyfin's defaults, minus what Matinee
 * doesn't do yet (subtitle burn-in, AMF, Rockchip, Windows).
 */

export const HARDWARE_ACCELERATIONS = [
  "none",
  "vaapi",
  "qsv",
  "nvenc",
  "videotoolbox",
] as const
export const HardwareAcceleration = z.enum(HARDWARE_ACCELERATIONS)
export type HardwareAcceleration = z.infer<typeof HardwareAcceleration>

/** The accelerations that use a GPU. */
export const HARDWARE_DEVICES = [
  "vaapi",
  "qsv",
  "nvenc",
  "videotoolbox",
] as const
export const HardwareDevice = z.enum(HARDWARE_DEVICES)
export type HardwareDevice = z.infer<typeof HardwareDevice>

/** Codecs a transcode can produce. H.264 is always allowed. */
export const TRANSCODE_VIDEO_CODECS = ["h264", "hevc", "av1"] as const
export const TranscodeVideoCodec = z.enum(TRANSCODE_VIDEO_CODECS)
export type TranscodeVideoCodec = z.infer<typeof TranscodeVideoCodec>

/** Source codecs a GPU can decode, as ffprobe names them. */
export const HARDWARE_DECODE_CODECS = [
  "h264",
  "hevc",
  "mpeg2video",
  "mpeg4",
  "vc1",
  "vp8",
  "vp9",
  "av1",
] as const
export const HardwareDecodeCodec = z.enum(HARDWARE_DECODE_CODECS)
export type HardwareDecodeCodec = z.infer<typeof HardwareDecodeCodec>

/** Which codecs each acceleration can decode, as Jellyfin's dashboard lists them. */
export const HARDWARE_DECODE_SUPPORT = new Map<
  HardwareDevice,
  readonly HardwareDecodeCodec[]
>([
  ["vaapi", ["h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"]],
  ["qsv", ["h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"]],
  [
    "nvenc",
    ["h264", "hevc", "mpeg2video", "mpeg4", "vc1", "vp8", "vp9", "av1"],
  ],
  // AV1 needs an Apple GPU that decodes it, which detection can't tell.
  ["videotoolbox", ["h264", "hevc", "vp8", "vp9"]],
])

/** x264's names. Auto is veryfast for software, each encoder's own pick otherwise. */
export const ENCODER_PRESETS = [
  "auto",
  "veryslow",
  "slower",
  "slow",
  "medium",
  "fast",
  "faster",
  "veryfast",
  "superfast",
  "ultrafast",
] as const
export const EncoderPreset = z.enum(ENCODER_PRESETS)
export type EncoderPreset = z.infer<typeof EncoderPreset>

export const TONEMAP_ALGORITHMS = [
  "none",
  "clip",
  "linear",
  "gamma",
  "reinhard",
  "hable",
  "mobius",
  "bt2390",
] as const
export const TonemapAlgorithm = z.enum(TONEMAP_ALGORITHMS)
export type TonemapAlgorithm = z.infer<typeof TonemapAlgorithm>

/** Only the GPU filters (OpenCL, CUDA, Metal) take a mode. */
export const TONEMAP_MODES = ["auto", "max", "rgb", "lum", "itp"] as const
export const TonemapMode = z.enum(TONEMAP_MODES)
export type TonemapMode = z.infer<typeof TonemapMode>

/** Output range: auto keeps the input's, tv is limited, pc is full. */
export const TONEMAP_RANGES = ["auto", "tv", "pc"] as const
export const TonemapRange = z.enum(TONEMAP_RANGES)
export type TonemapRange = z.infer<typeof TonemapRange>

export const DEINTERLACE_METHODS = ["yadif", "bwdif"] as const
export const DeinterlaceMethod = z.enum(DEINTERLACE_METHODS)
export type DeinterlaceMethod = z.infer<typeof DeinterlaceMethod>

/**
 * A device node. It goes into ffmpeg's `-init_hw_device` string, so commas,
 * `@`, and spaces, which that syntax gives a meaning, are refused.
 */
export const DevicePath = z
  .string()
  .trim()
  .max(256)
  .refine(
    (value) =>
      value === "" ||
      (/^\/dev\/[A-Za-z0-9._:/-]+$/.test(value) &&
        !value.split("/").includes("..")),
    "Use a device under /dev, like /dev/dri/renderD128.",
  )

const Crf = z
  .number()
  .int("Use a whole number.")
  .min(0, "Use 0 to 51.")
  .max(51, "Use 0 to 51.")

export const TranscodingSettings = z.object({
  hardwareAcceleration: HardwareAcceleration,
  /** The VAAPI render node. */
  vaapiDevice: DevicePath,
  /** The QSV render node on a machine with several GPUs. "" picks the Intel one. */
  qsvDevice: DevicePath,
  /** Encode on the GPU. Off decodes and filters there but encodes in software. */
  enableHardwareEncoding: z.boolean(),
  /** Source codecs the GPU decodes. The rest decode in software. */
  hardwareDecodingCodecs: z
    .array(HardwareDecodeCodec)
    .max(HARDWARE_DECODE_CODECS.length)
    .refine(
      (codecs) => new Set(codecs).size === codecs.length,
      "Each codec can be listed once.",
    ),
  enableDecodingColorDepth10Hevc: z.boolean(),
  enableDecodingColorDepth10Vp9: z.boolean(),
  /** HEVC 4:2:2 and 4:4:4 (RExt) at 8 and 10 bits. */
  enableDecodingColorDepth10HevcRext: z.boolean(),
  enableDecodingColorDepth12HevcRext: z.boolean(),
  /** Let transcodes produce HEVC. */
  allowHevcEncoding: z.boolean(),
  /** Let transcodes produce AV1. */
  allowAv1Encoding: z.boolean(),
  encoderPreset: EncoderPreset,
  /** libx264's quality without a bitrate cap. Lower is better. */
  h264Crf: Crf,
  /** libx265's. AV1 has none: like Jellyfin, it always encodes to a bitrate. */
  hevcCrf: Crf,
  /**
   * Tone map on the GPU: OpenCL for VAAPI and QSV, CUDA for NVENC, Metal
   * for VideoToolbox. Without it, or where the GPU can't, tonemapx does it
   * in software when this ffmpeg has it.
   */
  enableTonemapping: z.boolean(),
  /** Intel's VPP tone mapping, ahead of OpenCL. HDR10 sources only. */
  enableVppTonemapping: z.boolean(),
  /** VideoToolbox's own tone mapping, ahead of Metal. Not Dolby Vision 5. */
  enableVideoToolboxTonemapping: z.boolean(),
  tonemappingAlgorithm: TonemapAlgorithm,
  tonemappingMode: TonemapMode,
  tonemappingRange: TonemapRange,
  /** Desaturate highlights brighter than this. 0 turns it off. */
  tonemappingDesat: z.number().min(0).max(100),
  /** The source's peak brightness in units of 10 nits. 100 means 1000 nits. */
  tonemappingPeak: z.number().min(0).max(10_000),
  /** Tunes the algorithm. 0 keeps its default. */
  tonemappingParam: z.number().min(0).max(1000),
  /** Brightness gain for VPP tone mapping. */
  vppTonemappingBrightness: z.number().min(0).max(100),
  /** Contrast gain for VPP tone mapping. */
  vppTonemappingContrast: z.number().min(1).max(2),
  deinterlaceMethod: DeinterlaceMethod,
  /** Output one frame per field, doubling 25 or 30 fps to 50 or 60. */
  deinterlaceDoubleRate: z.boolean(),
  /** Pause ffmpeg once it is far enough ahead of the player. */
  enableThrottling: z.boolean(),
  throttleDelaySeconds: z.number().int().min(10).max(3600),
  /** Delete segments the player has fetched. */
  enableSegmentDeletion: z.boolean(),
  segmentKeepSeconds: z
    .number()
    .int()
    .min(60)
    .max(24 * 3600),
})
export type TranscodingSettings = z.infer<typeof TranscodingSettings>

/** A save. Empty device fields fall back to the environment's. */
export const TranscodingSettingsInput = TranscodingSettings
export type TranscodingSettingsInput = z.infer<typeof TranscodingSettingsInput>

/**
 * A feature tried on this server: `ok` it ran, `failed` ffmpeg has it but
 * running it failed (see `error`), `missing` this ffmpeg build lacks it.
 */
export const CHECK_STATUSES = ["ok", "failed", "missing"] as const
export const CheckStatus = z.enum(CHECK_STATUSES)
export type CheckStatus = z.infer<typeof CheckStatus>

export const CapabilityCheck = z.object({
  status: CheckStatus,
  /** The last lines ffmpeg printed when it failed. */
  error: z.string().nullable(),
})
export type CapabilityCheck = z.infer<typeof CapabilityCheck>

export const EncoderCheck = CapabilityCheck.extend({
  codec: TranscodeVideoCodec,
  /** ffmpeg's name, like `hevc_vaapi`. */
  encoder: z.string(),
  /** A 10-bit HDR encode, which keeping HDR needs. Missing for H.264. */
  tenBit: CheckStatus,
})
export type EncoderCheck = z.infer<typeof EncoderCheck>

export const GPU_VENDORS = [
  "intel-ihd",
  "intel-i965",
  "amd",
  "nvidia",
  "apple",
  "other",
] as const
export const GpuVendor = z.enum(GPU_VENDORS)
export type GpuVendor = z.infer<typeof GpuVendor>

/** One acceleration on this server, tried with tiny encodes. */
export const HardwareCapability = z.object({
  acceleration: HardwareDevice,
  /** The device opened. Everything else here is `missing` or `failed` without it. */
  device: CapabilityCheck,
  /** The node or index that was opened, like /dev/dri/renderD128. */
  devicePath: z.string().nullable(),
  /** What the driver calls itself, such as "Intel iHD driver ...". */
  driver: z.string().nullable(),
  vendor: GpuVendor.nullable(),
  /** One per codec, tried with a short encode from system memory. */
  encoders: z.array(EncoderCheck),
  /** OpenCL (VAAPI, QSV), CUDA (NVENC), or Metal (VideoToolbox) tone mapping. */
  tonemap: CapabilityCheck,
  /** Intel VPP tone mapping. Missing for NVENC and VideoToolbox. */
  vppTonemap: CapabilityCheck,
  /** VideoToolbox's own tone mapping. Missing elsewhere. */
  videoToolboxTonemap: CapabilityCheck,
})
export type HardwareCapability = z.infer<typeof HardwareCapability>

export const TranscodingCapabilities = z.object({
  ffmpegPath: z.string(),
  /** Such as `8.1.3-Jellyfin`. Null when ffmpeg didn't run. */
  version: z.string().nullable(),
  /** Major, minor, and patch, for comparing. Null for git builds. */
  versionNumbers: z.array(z.number().int()).length(3).nullable(),
  /** The build is jellyfin-ffmpeg. */
  jellyfin: z.boolean(),
  /** Why ffmpeg couldn't run at all. */
  error: z.string().nullable(),
  detectedAt: z.date(),
  /** From `ffmpeg -hwaccels`. */
  hwaccels: z.array(z.string()),
  /** The encoders the pipeline uses that this build has. */
  encoders: z.array(z.string()),
  /** The filters the pipeline uses that this build has. */
  filters: z.array(z.string()),
  /** Options of filters and bitstream filters, by Jellyfin's checks. */
  features: z.object({
    /** tonemapx: software tone mapping, with Dolby Vision reshaping. */
    tonemapx: z.boolean(),
    /** `p` and `u` pause and resume ffmpeg, which throttling needs. */
    pauseKeys: z.boolean(),
    tonemapOpenclBt2390: z.boolean(),
    tonemapCudaName: z.boolean(),
    scaleCudaFormat: z.boolean(),
    overlayOpenclFrameSync: z.boolean(),
    overlayVaapiFrameSync: z.boolean(),
    /** Bitstream filters that drop Dolby Vision or HDR10+ in a stream copy. */
    hevcRemoveDovi: z.boolean(),
    hevcRemoveHdr10Plus: z.boolean(),
    av1RemoveDovi: z.boolean(),
    av1RemoveHdr10Plus: z.boolean(),
    doviRpuStrip: z.boolean(),
    /** libx265 and libsvtav1 take `-dolbyvision`, so an encode can leave the RPU out. */
    encoderDolbyVisionOption: z.boolean(),
  }),
  hardware: z.array(HardwareCapability),
})
export type TranscodingCapabilities = z.infer<typeof TranscodingCapabilities>

export const AdminTranscodingSettings = z.object({
  /** In use: saved values over the environment's. */
  settings: TranscodingSettings,
  /** What an empty device field falls back to. */
  defaults: TranscodingSettings,
  /** What ffmpeg and the GPUs can do, detected for the devices in use. */
  capabilities: TranscodingCapabilities,
})
export type AdminTranscodingSettings = z.infer<typeof AdminTranscodingSettings>
