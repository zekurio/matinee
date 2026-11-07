import type { EncoderPreset } from "@matinee/contracts"

import { num } from "./filters"
import { versionAtLeast } from "./support"
import type { Plan } from "./types"

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

/**
 * EnableIntelLowPower*HwEncoder. Jellyfin: only where the encoder passed
 * a test encode in low-power mode, which covers the Intel driver check.
 */
function lowPowerArgs(plan: Plan): string[] {
  const { settings, target } = plan
  const enabled =
    target.codec === "h264"
      ? settings.enableIntelLowPowerH264HwEncoder
      : target.codec === "hevc" && settings.enableIntelLowPowerHevcHwEncoder
  const check = plan.hardware?.encoders.find(
    (entry) => entry.encoder === plan.encoder,
  )
  return enabled && check?.lowPower.status === "ok" ? ["-low_power", "1"] : []
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

export function encoderArgs(plan: Plan): Encoding {
  const { encoder, target, keepHdr } = plan
  const args = ["-c:v:0", encoder, ...lowPowerArgs(plan), ...presetArgs(plan)]
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
