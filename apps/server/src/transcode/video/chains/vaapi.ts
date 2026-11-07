import { hardwareDecoder } from "../decoder"
import {
  colorParams,
  hwDeinterlaceFilter,
  hwScaleFilter,
  hwTonemapFilter,
  SDR_PARAMS,
  swDeinterlaceFilter,
  swScaleFilter,
} from "../filters"
import {
  hasFilter,
  hwTonemapAvailable,
  isHardwareEncoder,
  isHevcRext,
  isOpenclFullSupported,
  isVaapiFullSupported,
  isVaapiSupported,
  vppTonemapAvailable,
} from "../support"
import type { Chain, Decoder, Plan } from "../types"
import { softwareChain, softwareToneMapFallback } from "./software"

/**
 * GetVaapiVidFilterChain: Intel's iHD driver gets the full chain with VPP
 * and OpenCL tone mapping, i965 and AMD the limited one, and builds without
 * the VAAPI and OpenCL filters the legacy one (CPU filters, then upload).
 */
export function vaapiChain(plan: Plan, decodes: boolean): Chain {
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
