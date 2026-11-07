import { isHevcRext, isVaapiSupported, versionAtLeast } from "./support"
import type { Decoder, Plan } from "./types"

/* Decoding, from GetHardwareVideoDecoder and GetHwaccelType. */

/** Whether the GPU should decode this source, by the settings. */
export function hardwareDecodes(plan: Plan): boolean {
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
export function hardwareDecoder(plan: Plan, surface: boolean): Decoder {
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
