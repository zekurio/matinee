import { videoColorRange } from "../../range"
import { hardwareDecoder } from "../decoder"
import {
  colorParams,
  swDeinterlaceFilter,
  swScaleFilter,
  swTonemapFilter,
} from "../filters"
import { isHardwareEncoder, swTonemapAvailable } from "../support"
import type { Chain, Decoder, Plan } from "../types"

/**
 * GetSwVidFilterChain: CPU filters, after a CPU decoder or a GPU one that
 * copies frames back. tonemapx tone maps, and reshapes Dolby Vision 5 with
 * the RPU the decoder passes along. A burned-in subtitle goes on after tone
 * mapping, since its pictures are SDR already.
 */
export function softwareChain(plan: Plan, decoder: Decoder | null): Chain {
  const toneMap = swTonemapAvailable(plan)
  const isDovi = toneMap && videoColorRange(plan.source).type === "DOVI"
  const vaapiEncoder = isHardwareEncoder(plan, "vaapi")
  const filters = [colorParams(plan, toneMap)]
  if (plan.deinterlace) filters.push(swDeinterlaceFilter(plan))

  let format = decoder === null ? "yuv420p" : "nv12"
  if (vaapiEncoder) format = "nv12"
  if (plan.keepHdr) {
    format = decoder === null && !vaapiEncoder ? "yuv420p10le" : "p010le"
  }
  filters.push(swScaleFilter(plan))

  if (toneMap) {
    // tonemapx reshapes Dolby Vision from yuv420p10 input only; ffmpeg
    // converts on the way when needed.
    const toneMapFormat = isDovi ? "yuv420p" : format
    filters.push(swTonemapFilter(plan.settings, toneMapFormat))
    // Jellyfin: the encoder's format again after Dolby Vision's.
    if (toneMapFormat !== format) filters.push(`format=${format}`)
  } else {
    filters.push(`format=${format}`)
  }
  let overlayAt: number | undefined
  if (plan.target.burnIn) {
    overlayAt = filters.length
    // The overlay leaves its own format; back to the encoder's.
    filters.push(`format=${format}`)
  }
  // The legacy VAAPI pipeline uploads for the encoder.
  if (vaapiEncoder) filters.push("hwupload=derive_device=vaapi")
  return {
    filters,
    decoder,
    toneMapper: toneMap ? "tonemapx" : null,
    hardwareScaling: false,
    opencl: "none",
    overlayAt,
  }
}

/**
 * A GPU chain that can't tone map gets the software chain instead, with
 * the GPU decoding into system memory. Jellyfin leaves such encodes washed
 * out; it falls back only when the GPU filters are missing altogether.
 */
export function softwareToneMapFallback(
  plan: Plan,
  decodes: boolean,
): Chain | null {
  if (!plan.wantToneMap || !swTonemapAvailable(plan)) return null
  return softwareChain(plan, decodes ? hardwareDecoder(plan, false) : null)
}
