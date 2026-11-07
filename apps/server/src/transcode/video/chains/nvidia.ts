import { hardwareDecoder } from "../decoder"
import {
  colorParams,
  hwDeinterlaceFilter,
  hwScaleFilter,
  hwTonemapFilter,
  swDeinterlaceFilter,
  swScaleFilter,
} from "../filters"
import {
  hasFilter,
  hwTonemapAvailable,
  isCudaFullSupported,
  isHardwareEncoder,
  isHevcRext,
} from "../support"
import type { Chain, Plan } from "../types"
import { softwareChain, softwareToneMapFallback } from "./software"

/** GetNvidiaVidFiltersPrefered: CUDA decode, filters, and tone mapping. */
export function nvidiaChain(plan: Plan, decodes: boolean): Chain {
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
