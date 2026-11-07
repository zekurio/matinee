import { hardwareDecoder } from "../decoder"
import { hwDeinterlaceFilter, hwScaleFilter, hwTonemapFilter } from "../filters"
import {
  hasFilter,
  hwTonemapAvailable,
  isHardwareEncoder,
  isVideoToolboxFullSupported,
  versionAtLeast,
  videoToolboxTonemapAvailable,
} from "../support"
import type { Chain, Plan } from "../types"
import { softwareChain, softwareToneMapFallback } from "./software"

/** GetAppleVidFiltersPreferred: VideoToolbox decode, scale, and tone map. */
export function appleChain(plan: Plan, decodes: boolean): Chain {
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
