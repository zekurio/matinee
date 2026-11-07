import type { VideoStream } from "@matinee/contracts"

import { isDoviWithHdr10Bl, isHdr10Plus, videoColorRange } from "../range"
import type { Decoder, Plan } from "./types"

export const isHardwareEncoder = (plan: Plan, suffix: string) =>
  plan.encoder.endsWith(`_${suffix}`)

/* Capability checks, from Jellyfin's Is*Supported. */

export function hasFilter(plan: Plan, name: string): boolean {
  return plan.caps.filters.includes(name)
}

export function hasHwaccel(plan: Plan, name: string): boolean {
  return plan.caps.hwaccels.includes(name)
}

export function versionAtLeast(plan: Plan, wanted: [number, number, number]) {
  const version = plan.caps.versionNumbers
  if (!version) return false
  for (let i = 0; i < 3; i++) {
    const have = version[i] ?? 0
    const want = wanted[i] ?? 0
    if (have !== want) return have > want
  }
  return true
}

export function isVaapiFullSupported(plan: Plan): boolean {
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

export function isOpenclFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "opencl") &&
    hasFilter(plan, "scale_opencl") &&
    plan.caps.features.tonemapOpenclBt2390 &&
    plan.caps.features.overlayOpenclFrameSync
  )
}

export function isCudaFullSupported(plan: Plan): boolean {
  return (
    hasHwaccel(plan, "cuda") &&
    plan.caps.features.scaleCudaFormat &&
    hasFilter(plan, "yadif_cuda") &&
    plan.caps.features.tonemapCudaName &&
    hasFilter(plan, "overlay_cuda") &&
    hasFilter(plan, "hwupload_cuda")
  )
}

export function isVideoToolboxFullSupported(plan: Plan): boolean {
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
export function isVaapiSupported(plan: Plan): boolean {
  return plan.source.codec !== "mpeg4" && hasHwaccel(plan, "vaapi")
}

export function isHevcRext(source: VideoStream): boolean {
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
export function swTonemapAvailable(plan: Plan): boolean {
  return plan.wantToneMap && plan.caps.features.tonemapx
}

/**
 * IsHwTonemapAvailable, for OpenCL, CUDA, and Metal. Dolby Vision 5 needs
 * a decoder that hands over the RPU: software, VAAPI, CUDA, or
 * VideoToolbox. Jellyfin: also needs the filter to have run here.
 */
export function hwTonemapAvailable(
  plan: Plan,
  decoder: Decoder | null,
): boolean {
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
export function vppTonemapAvailable(plan: Plan): boolean {
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
export function videoToolboxTonemapAvailable(plan: Plan): boolean {
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
