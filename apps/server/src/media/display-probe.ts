import {
  audioFormatName,
  type DisplayMediaProbe,
  type HdrFormat,
  knownChannelLayout,
  type MediaProbe,
  videoCodecName,
} from "@matinee/contracts"

const HDR_LABELS = {
  hdr10: "HDR10",
  hlg: "HLG",
  "dolby-vision": "Dolby Vision",
} satisfies Record<HdrFormat, string>

/** Cropped wide films keep the label of their full-width frame. */
function resolutionLabel(width: number, height: number): string {
  if (width >= 3200 || height >= 2000) return "4K"
  if (width >= 2400 || height >= 1400) return "1440p"
  if (width >= 1800 || height >= 1000) return "1080p"
  if (width >= 1200 || height >= 700) return "720p"
  return `${height}p`
}

/** Add display facts without changing the stored probe. */
export function displayProbe(probe: MediaProbe): DisplayMediaProbe {
  const video = probe.video
  return {
    ...probe,
    video: video
      ? {
          ...video,
          format: videoCodecName(video.codec),
          resolution: resolutionLabel(video.width, video.height),
          dynamicRange:
            video.hdr === "hdr10" && video.hdr10Plus
              ? "HDR10+"
              : video.hdr
                ? HDR_LABELS[video.hdr]
                : null,
        }
      : null,
    audio: probe.audio.map((stream) => ({
      ...stream,
      format: audioFormatName(stream.codec, stream.profile),
      layout: knownChannelLayout(stream.channelLayout, stream.channels),
    })),
  }
}
