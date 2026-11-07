import { t } from "./schema"

/*
 * Transcoding settings and what the server's ffmpeg can do. The settings are
 * Jellyfin's EncodingOptions, with Jellyfin's defaults, minus what Matinee
 * doesn't do yet (text subtitle burn-in, AMF, Rockchip, Windows).
 */

export const HARDWARE_ACCELERATIONS = [
  "none",
  "vaapi",
  "qsv",
  "nvenc",
  "videotoolbox",
] as const
export const HardwareAcceleration = t.enum(HARDWARE_ACCELERATIONS)
export type HardwareAcceleration = t.infer<typeof HardwareAcceleration>

/** The accelerations that use a GPU. */
export const HARDWARE_DEVICES = [
  "vaapi",
  "qsv",
  "nvenc",
  "videotoolbox",
] as const
export const HardwareDevice = t.enum(HARDWARE_DEVICES)
export type HardwareDevice = t.infer<typeof HardwareDevice>

/** Codecs a transcode can produce. H.264 is always allowed. */
export const TRANSCODE_VIDEO_CODECS = ["h264", "hevc", "av1"] as const
export const TranscodeVideoCodec = t.enum(TRANSCODE_VIDEO_CODECS)
export type TranscodeVideoCodec = t.infer<typeof TranscodeVideoCodec>

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
export const HardwareDecodeCodec = t.enum(HARDWARE_DECODE_CODECS)
export type HardwareDecodeCodec = t.infer<typeof HardwareDecodeCodec>

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
export const EncoderPreset = t.enum(ENCODER_PRESETS)
export type EncoderPreset = t.infer<typeof EncoderPreset>

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
export const TonemapAlgorithm = t.enum(TONEMAP_ALGORITHMS)
export type TonemapAlgorithm = t.infer<typeof TonemapAlgorithm>

/** Only the GPU filters (OpenCL, CUDA, Metal) take a mode. */
export const TONEMAP_MODES = ["auto", "max", "rgb", "lum", "itp"] as const
export const TonemapMode = t.enum(TONEMAP_MODES)
export type TonemapMode = t.infer<typeof TonemapMode>

/** Output range: auto keeps the input's, tv is limited, pc is full. */
export const TONEMAP_RANGES = ["auto", "tv", "pc"] as const
export const TonemapRange = t.enum(TONEMAP_RANGES)
export type TonemapRange = t.infer<typeof TonemapRange>

export const DEINTERLACE_METHODS = ["yadif", "bwdif"] as const
export const DeinterlaceMethod = t.enum(DEINTERLACE_METHODS)
export type DeinterlaceMethod = t.infer<typeof DeinterlaceMethod>

/**
 * How surround becomes stereo: Jellyfin's DownMixStereoAlgorithms. `none`
 * leaves it to ffmpeg's `-ac 2`, which drops the LFE channel.
 */
export const DOWNMIX_ALGORITHMS = [
  "none",
  "dave750",
  "nightmode-dialogue",
  "rfc7845",
  "ac4",
] as const
export const DownmixAlgorithm = t.enum(DOWNMIX_ALGORITHMS)
export type DownmixAlgorithm = t.infer<typeof DownmixAlgorithm>

/**
 * A device node. It goes into ffmpeg's `-init_hw_device` string, so commas,
 * `@`, and spaces, which that syntax gives a meaning, are refused.
 */
export const DevicePath = t
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

const Crf = t
  .number()
  .int("Use a whole number.")
  .min(0, "Use 0 to 51.")
  .max(51, "Use 0 to 51.")

export const TranscodingSettings = t.object({
  hardwareAcceleration: HardwareAcceleration,
  /** The VAAPI render node. */
  vaapiDevice: DevicePath,
  /** The QSV render node on a machine with several GPUs. "" picks the Intel one. */
  qsvDevice: DevicePath,
  /** Encode on the GPU. Off decodes and filters there but encodes in software. */
  enableHardwareEncoding: t.boolean(),
  /**
   * Intel's low-power encoders (VDENC) on QSV and on VAAPI with an Intel
   * driver. They skip CPU-GPU syncs, which helps 4K and tone mapped
   * encodes, but need the HuC firmware for bitrate control.
   */
  enableIntelLowPowerH264HwEncoder: t.boolean(),
  enableIntelLowPowerHevcHwEncoder: t.boolean(),
  /** Source codecs the GPU decodes. The rest decode in software. */
  hardwareDecodingCodecs: t
    .array(HardwareDecodeCodec)
    .max(HARDWARE_DECODE_CODECS.length)
    .refine(
      (codecs) => new Set(codecs).size === codecs.length,
      "Each codec can be listed once.",
    ),
  enableDecodingColorDepth10Hevc: t.boolean(),
  enableDecodingColorDepth10Vp9: t.boolean(),
  /** HEVC 4:2:2 and 4:4:4 (RExt) at 8 and 10 bits. */
  enableDecodingColorDepth10HevcRext: t.boolean(),
  enableDecodingColorDepth12HevcRext: t.boolean(),
  /** Let transcodes produce HEVC. */
  allowHevcEncoding: t.boolean(),
  /** Let transcodes produce AV1. */
  allowAv1Encoding: t.boolean(),
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
  enableTonemapping: t.boolean(),
  /** Intel's VPP tone mapping, ahead of OpenCL. HDR10 sources only. */
  enableVppTonemapping: t.boolean(),
  /** VideoToolbox's own tone mapping, ahead of Metal. Not Dolby Vision 5. */
  enableVideoToolboxTonemapping: t.boolean(),
  tonemappingAlgorithm: TonemapAlgorithm,
  tonemappingMode: TonemapMode,
  tonemappingRange: TonemapRange,
  /** Desaturate highlights brighter than this. 0 turns it off. */
  tonemappingDesat: t.number().min(0).max(100),
  /** The source's peak brightness in units of 10 nits. 100 means 1000 nits. */
  tonemappingPeak: t.number().min(0).max(10_000),
  /** Tunes the algorithm. 0 keeps its default. */
  tonemappingParam: t.number().min(0).max(1000),
  /** Brightness gain for VPP tone mapping. */
  vppTonemappingBrightness: t.number().min(0).max(100),
  /** Contrast gain for VPP tone mapping. */
  vppTonemappingContrast: t.number().min(1).max(2),
  deinterlaceMethod: DeinterlaceMethod,
  /** Output one frame per field, doubling 25 or 30 fps to 50 or 60. */
  deinterlaceDoubleRate: t.boolean(),
  /** How surround becomes stereo for players that get stereo. */
  downMixStereoAlgorithm: DownmixAlgorithm,
  /** Gain on surround downmixed to stereo, which comes out quieter. 1 leaves it. */
  downMixAudioBoost: t.number().min(0.5).max(3),
  /** Variable bit rate for the AAC encoders that have it, aac_at and libfdk_aac. */
  enableAudioVbr: t.boolean(),
  /** Pause ffmpeg once it is far enough ahead of the player. */
  enableThrottling: t.boolean(),
  throttleDelaySeconds: t.number().int().min(10).max(3600),
  /** Delete segments the player has fetched. */
  enableSegmentDeletion: t.boolean(),
  segmentKeepSeconds: t
    .number()
    .int()
    .min(60)
    .max(24 * 3600),
})
export type TranscodingSettings = t.infer<typeof TranscodingSettings>

/** A save. Empty device fields fall back to the environment's. */
export const TranscodingSettingsInput = TranscodingSettings
export type TranscodingSettingsInput = t.infer<typeof TranscodingSettingsInput>

/**
 * A feature tried on this server: `ok` it ran, `failed` ffmpeg has it but
 * running it failed (see `error`), `missing` this ffmpeg build lacks it.
 */
export const CHECK_STATUSES = ["ok", "failed", "missing"] as const
export const CheckStatus = t.enum(CHECK_STATUSES)
export type CheckStatus = t.infer<typeof CheckStatus>

export const CapabilityCheck = t.object({
  status: CheckStatus,
  /** The last lines ffmpeg printed when it failed. */
  error: t.string().nullable(),
})
export type CapabilityCheck = t.infer<typeof CapabilityCheck>

export const EncoderCheck = CapabilityCheck.extend({
  codec: TranscodeVideoCodec,
  /** ffmpeg's name, like `hevc_vaapi`. */
  encoder: t.string(),
  /** A 10-bit HDR encode, which keeping HDR needs. Missing for H.264. */
  tenBit: CheckStatus,
  /**
   * An SDR encode in Intel's low-power mode, which its settings need.
   * Missing but for H.264 and HEVC on QSV and Intel VAAPI.
   */
  lowPower: CapabilityCheck,
})
export type EncoderCheck = t.infer<typeof EncoderCheck>

export const GPU_VENDORS = [
  "intel-ihd",
  "intel-i965",
  "amd",
  "nvidia",
  "apple",
  "other",
] as const
export const GpuVendor = t.enum(GPU_VENDORS)
export type GpuVendor = t.infer<typeof GpuVendor>

/** One acceleration on this server, tried with tiny encodes. */
export const HardwareCapability = t.object({
  acceleration: HardwareDevice,
  /** The device opened. Everything else here is `missing` or `failed` without it. */
  device: CapabilityCheck,
  /** The node or index that was opened, like /dev/dri/renderD128. */
  devicePath: t.string().nullable(),
  /** What the driver calls itself, such as "Intel iHD driver ...". */
  driver: t.string().nullable(),
  vendor: GpuVendor.nullable(),
  /** One per codec, tried with a short encode from system memory. */
  encoders: t.array(EncoderCheck),
  /** OpenCL (VAAPI, QSV), CUDA (NVENC), or Metal (VideoToolbox) tone mapping. */
  tonemap: CapabilityCheck,
  /** Intel VPP tone mapping. Missing for NVENC and VideoToolbox. */
  vppTonemap: CapabilityCheck,
  /** VideoToolbox's own tone mapping. Missing elsewhere. */
  videoToolboxTonemap: CapabilityCheck,
})
export type HardwareCapability = t.infer<typeof HardwareCapability>

export const TranscodingCapabilities = t.object({
  ffmpegPath: t.string(),
  /** Such as `8.1.3-Jellyfin`. Null when ffmpeg didn't run. */
  version: t.string().nullable(),
  /** Major, minor, and patch, for comparing. Null for git builds. */
  versionNumbers: t.array(t.number().int()).length(3).nullable(),
  /** The build is jellyfin-ffmpeg. */
  jellyfin: t.boolean(),
  /** Why ffmpeg couldn't run at all. */
  error: t.string().nullable(),
  detectedAt: t.date(),
  /** From `ffmpeg -hwaccels`. */
  hwaccels: t.array(t.string()),
  /** The encoders the pipeline uses that this build has. */
  encoders: t.array(t.string()),
  /** The filters the pipeline uses that this build has. */
  filters: t.array(t.string()),
  /** Options of filters and bitstream filters, by Jellyfin's checks. */
  features: t.object({
    /** tonemapx: software tone mapping, with Dolby Vision reshaping. */
    tonemapx: t.boolean(),
    /** `p` and `u` pause and resume ffmpeg, which throttling needs. */
    pauseKeys: t.boolean(),
    tonemapOpenclBt2390: t.boolean(),
    tonemapCudaName: t.boolean(),
    scaleCudaFormat: t.boolean(),
    overlayOpenclFrameSync: t.boolean(),
    overlayVaapiFrameSync: t.boolean(),
    /** Bitstream filters that drop Dolby Vision or HDR10+ in a stream copy. */
    hevcRemoveDovi: t.boolean(),
    hevcRemoveHdr10Plus: t.boolean(),
    av1RemoveDovi: t.boolean(),
    av1RemoveHdr10Plus: t.boolean(),
    doviRpuStrip: t.boolean(),
    /** libx265 and libsvtav1 take `-dolbyvision`, so an encode can leave the RPU out. */
    encoderDolbyVisionOption: t.boolean(),
  }),
  hardware: t.array(HardwareCapability),
})
export type TranscodingCapabilities = t.infer<typeof TranscodingCapabilities>

export const AdminTranscodingSettings = t.object({
  /** In use: saved values over the environment's. */
  settings: TranscodingSettings,
  /** What an empty device field falls back to. */
  defaults: TranscodingSettings,
  /** What ffmpeg and the GPUs can do, detected for the devices in use. */
  capabilities: TranscodingCapabilities,
})
export type AdminTranscodingSettings = t.infer<typeof AdminTranscodingSettings>

/**
 * What the player's quality menu offers. `original` sends the video as it
 * is; the rest encode it to H.264 that fits the frame and aims for the bit
 * rate.
 */
export const PLAYBACK_QUALITY_IDS = [
  "original",
  "2160p-40",
  "1080p-20",
  "1080p-10",
  "720p-6",
  "720p-4",
  "480p-2",
  "360p-1",
] as const
export const PlaybackQuality = t.enum(PLAYBACK_QUALITY_IDS)
export type PlaybackQuality = t.infer<typeof PlaybackQuality>

export type PlaybackQualityPreset = {
  id: Exclude<PlaybackQuality, "original">
  width: number
  height: number
  /** Bits per second of the video. */
  bitrate: number
}

/**
 * Audio codecs a player can say it decodes in MP4, as ffprobe names them.
 * A stream copies a track in one of them and encodes the rest: to Opus
 * when the player listed it, else AAC.
 */
export const PLAYBACK_AUDIO_CODECS = [
  "opus",
  "aac",
  "mp3",
  "flac",
  "alac",
  "ac3",
  "eac3",
] as const
export const PlaybackAudioCodec = t.enum(PLAYBACK_AUDIO_CODECS)
export type PlaybackAudioCodec = t.infer<typeof PlaybackAudioCodec>

/** What a stream assumes a player decodes when it doesn't say. */
export const DEFAULT_PLAYBACK_AUDIO_CODECS: readonly PlaybackAudioCodec[] = [
  "aac",
  "mp3",
]

/** The encodes, largest first. */
export const PLAYBACK_QUALITIES: readonly PlaybackQualityPreset[] = [
  { id: "2160p-40", width: 3840, height: 2160, bitrate: 40_000_000 },
  { id: "1080p-20", width: 1920, height: 1080, bitrate: 20_000_000 },
  { id: "1080p-10", width: 1920, height: 1080, bitrate: 10_000_000 },
  { id: "720p-6", width: 1280, height: 720, bitrate: 6_000_000 },
  { id: "720p-4", width: 1280, height: 720, bitrate: 4_000_000 },
  { id: "480p-2", width: 854, height: 480, bitrate: 2_000_000 },
  { id: "360p-1", width: 640, height: 360, bitrate: 1_000_000 },
]
