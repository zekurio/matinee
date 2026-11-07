import type { TranscodingSettings } from "@matinee/contracts"

import { hasFilter, versionAtLeast } from "./support"
import type { Plan, VideoTarget } from "./types"

/* Filters shared by the chains. */

/** A frame size in pixels. */
export type FrameSize = { width: number; height: number }

/** Up to six decimals, never in exponent notation. */
export function num(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** GetFixedOutputSize: fit inside the maximum, even, at most 4096 on GPUs. */
function fixedOutputSize(
  width: number,
  height: number,
  target: VideoTarget,
  hardwareCap: boolean,
): FrameSize {
  let outW = width
  let outH = height
  const cap = hardwareCap ? 4096 : Number.POSITIVE_INFINITY
  const maxW = Math.min(target.maxWidth ?? outW, cap)
  const maxH = Math.min(target.maxHeight ?? outH, cap)
  if (outW > maxW || outH > maxH) {
    const scale = Math.min(maxW / outW, maxH / outH)
    outW = Math.min(maxW, Math.round(outW * scale))
    outH = Math.min(maxH, Math.round(outH * scale))
  }
  return { width: 2 * Math.floor(outW / 2), height: 2 * Math.floor(outH / 2) }
}

export function outputSize(plan: Plan, hardwareScaling: boolean) {
  const { width, height } = plan.source
  if (hardwareScaling) return fixedOutputSize(width, height, plan.target, true)
  return softwareOutputSize(width, height, plan.target)
}

/** What the software scale expressions below come to. */
function softwareOutputSize(
  width: number,
  height: number,
  target: VideoTarget,
): FrameSize {
  const even = (value: number) => 2 * Math.trunc(value / 2)
  const a = width / height
  const { maxWidth: w, maxHeight: h } = target
  if (w && h) {
    return {
      width: even(Math.min(Math.max(width, height * a), Math.min(w, h * a))),
      height: even(Math.min(Math.max(width / a, height), Math.min(w / a, h))),
    }
  }
  if (w) {
    const out = even(Math.min(Math.max(width, height * a), w))
    return { width: out, height: even(out / a) }
  }
  if (h) {
    const out = even(Math.min(Math.max(width / a, height), h))
    return { width: even(out * a), height: out }
  }
  return { width: even(width), height: even(height) }
}

/**
 * GetSwScaleFilter for a maximum size. Jellyfin: also when no maximum is
 * given and the source has an odd size, which 4:2:0 encoders refuse, and
 * height-only fits stay even.
 */
export function swScaleFilter(plan: Plan): string {
  const { maxWidth: w, maxHeight: h } = plan.target
  if (w && h) {
    return `scale=trunc(min(max(iw\\,ih*a)\\,min(${w}\\,${h}*a))/2)*2:trunc(min(max(iw/a\\,ih)\\,min(${w}/a\\,${h}))/2)*2`
  }
  if (w) return `scale=trunc(min(max(iw\\,ih*a)\\,${w})/2)*2:trunc(ow/a/2)*2`
  if (h) return `scale=trunc(oh*a/2)*2:trunc(min(max(iw/a\\,ih)\\,${h})/2)*2`
  if (plan.source.width % 2 !== 0 || plan.source.height % 2 !== 0) {
    return "scale=trunc(iw/2)*2:trunc(ih/2)*2"
  }
  return ""
}

/** GetHwScaleFilter: a GPU scaler, when the size or format changes. */
export function hwScaleFilter(
  plan: Plan,
  prefix: string,
  suffix: string,
  format: string,
): string {
  const { width, height } = plan.source
  const out = fixedOutputSize(width, height, plan.target, true)
  const sizeFixed = out.width !== width || out.height !== height
  if (!sizeFixed && !format) return ""
  const size = sizeFixed ? `=w=${out.width}:h=${out.height}` : ""
  const pixel = format ? `${sizeFixed ? ":" : "="}format=${format}` : ""
  return `${prefix}_${suffix}${size}${pixel}`
}

export function swDeinterlaceFilter(plan: Plan): string {
  // Jellyfin's software deinterlacer doubles only known 30 fps and below.
  const double =
    plan.settings.deinterlaceDoubleRate &&
    plan.source.frameRate !== null &&
    plan.source.frameRate <= 30
  return `${plan.settings.deinterlaceMethod}=${double ? 1 : 0}:-1:0`
}

export function hwDeinterlaceFilter(
  plan: Plan,
  suffix: "vaapi" | "cuda" | "videotoolbox",
): string {
  const double = plan.doubleRate ? 1 : 0
  const bwdif = plan.settings.deinterlaceMethod === "bwdif"
  switch (suffix) {
    case "cuda":
      return `${bwdif && hasFilter(plan, "bwdif_cuda") ? "bwdif" : "yadif"}_cuda=${double}:-1:0`
    case "videotoolbox":
      return `${bwdif && hasFilter(plan, "bwdif_videotoolbox") ? "bwdif" : "yadif"}_videotoolbox=${double}:-1:0`
    default:
      return `deinterlace_vaapi=rate=${plan.doubleRate ? "field" : "frame"}`
  }
}

export const SDR_PARAMS =
  "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709"

/**
 * GetGraphicalSubPreProcessFilters: a subtitle's pictures at the output's
 * height, centered and cut to its width. A 1080p PGS canvas over a video
 * cropped to 1920x800 keeps its shape rather than being squashed.
 */
export function subtitleFitFilters(size: FrameSize): string[] {
  const { width, height } = size
  return [
    `scale=-1:${height}:fast_bilinear`,
    `pad=max(${width}\\,iw):max(${height}\\,ih):(ow-iw)/2:(oh-ih)/2:black@0`,
    `crop=${width}:${height}`,
  ]
}

/** GetInputHdrParam: tags the frames as the HDR they are. */
export function hdrInputParams(transfer: Plan["transfer"]): string {
  return `setparams=color_primaries=bt2020:color_trc=${transfer}:colorspace=bt2020nc`
}

/**
 * GetOverwriteColorPropertiesParam: HDR tags ahead of a tone mapper, BT.709
 * otherwise. An HDR source that nothing tone maps comes out washed out but
 * tagged SDR, as in Jellyfin.
 */
export function colorParams(plan: Plan, toneMapping: boolean): string {
  if (plan.keepHdr || toneMapping) return hdrInputParams(plan.transfer)
  return SDR_PARAMS
}

/** jellyfin-ffmpeg's software tone mapper, to BT.709 in `format`. */
export function swTonemapFilter(
  settings: TranscodingSettings,
  format: string,
): string {
  let filter = `tonemapx=tonemap=${settings.tonemappingAlgorithm}:desat=${num(settings.tonemappingDesat)}:peak=${num(settings.tonemappingPeak)}:t=bt709:m=bt709:p=bt709:format=${format}`
  if (settings.tonemappingParam !== 0) {
    filter += `:param=${num(settings.tonemappingParam)}`
  }
  if (settings.tonemappingRange !== "auto") {
    filter += `:range=${settings.tonemappingRange}`
  }
  return filter
}

/** GetHwTonemapFilter for OpenCL, CUDA, Metal, and VAAPI's VPP. */
export function hwTonemapFilter(
  plan: Plan,
  suffix: "opencl" | "cuda" | "videotoolbox" | "vaapi",
  format: string,
): string {
  const s = plan.settings
  if (suffix === "vaapi") {
    const procamp: string[] = []
    const brightness = s.vppTonemappingBrightness
    if (brightness !== 0 && brightness >= -100 && brightness <= 100) {
      procamp.push(`b=${num(brightness)}`)
    }
    if (s.vppTonemappingContrast > 1 && s.vppTonemappingContrast <= 10) {
      procamp.push(`c=${num(s.vppTonemappingContrast)}`)
    }
    const tonemap = `tonemap_vaapi=format=${format}:p=bt709:t=bt709:m=bt709:extra_hw_frames=32`
    return procamp.length > 0
      ? `procamp_vaapi=${procamp.join(":")},${tonemap}`
      : tonemap
  }
  let filter = `tonemap_${suffix}=format=${format}:p=bt709:t=bt709:m=bt709:tonemap=${s.tonemappingAlgorithm}:peak=${num(s.tonemappingPeak)}:desat=${num(s.tonemappingDesat)}`
  const mode = s.tonemappingMode
  const legacyMode =
    (mode === "max" || mode === "rgb") && versionAtLeast(plan, [5, 1, 3])
  const advancedMode =
    (mode === "lum" || mode === "itp") && versionAtLeast(plan, [7, 0, 1])
  if (legacyMode || advancedMode) filter += `:tonemap_mode=${mode}`
  if (s.tonemappingParam !== 0) filter += `:param=${num(s.tonemappingParam)}`
  if (s.tonemappingRange !== "auto") filter += `:range=${s.tonemappingRange}`
  return filter
}
