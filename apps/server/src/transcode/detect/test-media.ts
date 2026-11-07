import type { VideoStream } from "@matinee/contracts"

export const TEST_FRAMES = 12

/** A small 8-bit SDR source, as the probe would describe lavfi's. */
export const SDR_TEST_SOURCE: VideoStream = {
  index: 0,
  codec: "h264",
  codecTag: null,
  profile: "High",
  level: 30,
  width: 320,
  height: 240,
  frameRate: 24,
  bitRate: null,
  pixelFormat: "yuv420p",
  bitDepth: 8,
  colorTransfer: "bt709",
  colorPrimaries: "bt709",
  colorSpace: "bt709",
  colorRange: "tv",
  interlaced: false,
  hdr: null,
  dolbyVisionProfile: null,
  dolbyVision: null,
  hdr10Plus: false,
  masteringDisplay: false,
  contentLightLevel: null,
}

export const HDR_TEST_SOURCE: VideoStream = {
  ...SDR_TEST_SOURCE,
  codec: "hevc",
  profile: "Main 10",
  pixelFormat: "yuv420p10le",
  bitDepth: 10,
  colorTransfer: "smpte2084",
  colorPrimaries: "bt2020",
  colorSpace: "bt2020nc",
  hdr: "hdr10",
}

const HDR_PARAMS =
  "setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc"
export const SDR_LAVFI = `testsrc2=s=320x240:r=24:d=1`
export const HDR_LAVFI = `${SDR_LAVFI},format=yuv420p10le,${HDR_PARAMS}`
export const P010_LAVFI = `${SDR_LAVFI},format=p010le,${HDR_PARAMS}`
