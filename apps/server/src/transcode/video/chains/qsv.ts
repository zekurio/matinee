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
  hasHwaccel,
  hwTonemapAvailable,
  isHardwareEncoder,
  isHevcRext,
  isOpenclFullSupported,
  isVaapiSupported,
  vppTonemapAvailable,
} from "../support"
import type { Chain, Plan } from "../types"
import { softwareChain, softwareToneMapFallback } from "./software"

/**
 * GetIntelVidFilterChain on Linux: QSV encodes, VAAPI decodes (Jellyfin's
 * default "prefer the system's native decoder"), VAAPI and OpenCL filter.
 */
export function qsvChain(plan: Plan, decodes: boolean): Chain {
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
