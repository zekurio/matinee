import type {
  TranscodingCapabilities,
  TranscodingSettings,
  TrickplaySettings,
  VideoStream,
} from "@matinee/contracts"

import { videoBitDepth } from "./pipeline"
import { baseLayerRange, videoColorRange } from "./range"
import { hdrInputParams, swTonemapFilter } from "./video/filters"

/*
 * The filters that turn a video stream into trickplay thumbnails: a frame
 * per interval, scaled to the width with square pixels, and HDR tone
 * mapped to SDR. Jellyfin runs its whole transcode chain for these
 * (ExtractVideoImagesOnIntervalAccelerated). Thumbnails need less, so this
 * stays on the CPU and puts `fps` first: the filters after it see one
 * frame per thumbnail, which makes tone mapping 4K nearly free.
 */

export type ThumbnailSpacing = Pick<
  TrickplaySettings,
  "width" | "intervalSeconds"
>

/** The transfer an HDR source signals, as the transcode plan reads it. */
function hdrTransfer(video: VideoStream): "smpte2084" | "arib-std-b67" {
  return baseLayerRange(video) === "HLG" ||
    video.colorTransfer === "arib-std-b67"
    ? "arib-std-b67"
    : "smpte2084"
}

/**
 * The `-vf` chain for the thumbnails, in order. Each is `width` wide, and
 * as high as the aspect ratio makes it. Without tonemapx, HDR comes out
 * washed out, as transcodes do.
 */
export function thumbnailFilters(
  video: VideoStream,
  thumbnails: ThumbnailSpacing,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): string[] {
  const filters = [`fps=1/${thumbnails.intervalSeconds}`]
  // Frames this far apart have nothing to borrow from each other, so yadif
  // builds each one from its own field, which is plenty for a thumbnail.
  if (video.interlaced) filters.push("yadif")
  // As Jellyfin decides it: HDR by its rules, and 10-bit or more.
  const toneMap =
    videoColorRange(video).range === "HDR" &&
    videoBitDepth(video) >= 10 &&
    capabilities.features.tonemapx
  if (toneMap) filters.push(hdrInputParams(hdrTransfer(video)))
  // `dar` gives anamorphic video its display shape. 4:2:0 needs an even
  // height.
  filters.push(`scale=${thumbnails.width}:trunc(ow/dar/2)*2`, "setsar=1")
  // To 8-bit, which is what a JPEG holds.
  if (toneMap) filters.push(swTonemapFilter(settings, "yuv420p"))
  // Full range, which mjpeg takes. Left to ffmpeg, a file without one
  // decodable frame fails to open the encoder instead of ending empty.
  filters.push("format=yuvj420p")
  return filters
}
