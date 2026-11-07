import type {
  GpuVendor,
  HardwareCapability,
  HardwareDevice,
  TranscodingCapabilities,
} from "@matinee/contracts"

import { openclDevice } from "../video/devices"
import { check, missing } from "./ffmpeg"
import { P010_LAVFI, TEST_FRAMES } from "./test-media"

/** Runs a filter chain on HDR10 test frames on the device. */
function testFilters(init: string[], filterDevice: string, filters: string[]) {
  return check([
    ...init,
    "-filter_hw_device",
    filterDevice,
    "-f",
    "lavfi",
    "-i",
    P010_LAVFI,
    "-vf",
    filters.join(","),
    "-frames:v",
    String(TEST_FRAMES),
    "-f",
    "null",
    "-",
  ])
}

/** Uploads the frames, runs the filters, and downloads them again. */
function testUploaded(
  init: string[],
  filterDevice: string,
  filters: string[],
  format = "nv12",
) {
  return testFilters(init, filterDevice, [
    "hwupload",
    ...filters,
    "hwdownload",
    `format=${format}`,
  ])
}

const TONEMAP_ARGS = "p=bt709:t=bt709:m=bt709:tonemap=bt2390:peak=100:desat=0"
const VPP_TONEMAP = [
  "procamp_vaapi=b=16",
  "tonemap_vaapi=format=nv12:p=bt709:t=bt709:m=bt709:extra_hw_frames=32",
]

const OPENCL_TONEMAP = `tonemap_opencl=format=nv12:${TONEMAP_ARGS}`

type ToneMapping = Pick<
  HardwareCapability,
  "tonemap" | "vppTonemap" | "videoToolboxTonemap"
>

const hasFilter = (base: TranscodingCapabilities, name: string) =>
  base.filters.includes(name)

/** The tone mappers of an acceleration, run the way its chain runs them. */
export function testToneMapping(
  acceleration: HardwareDevice,
  init: string[],
  vendor: GpuVendor | null,
  base: TranscodingCapabilities,
): Promise<ToneMapping> {
  switch (acceleration) {
    case "vaapi":
      return testVaapiToneMapping(init, vendor, base)
    case "qsv":
      return testQsvToneMapping(init, base)
    case "nvenc":
      return testCudaToneMapping(init, base)
    default:
      return testVideoToolboxToneMapping(init, base)
  }
}

function noToneMapping(): ToneMapping {
  return {
    tonemap: missing(),
    vppTonemap: missing(),
    videoToolboxTonemap: missing(),
  }
}

async function testVaapiToneMapping(
  init: string[],
  vendor: GpuVendor | null,
  base: TranscodingCapabilities,
): Promise<ToneMapping> {
  const result = noToneMapping()
  if (base.hwaccels.includes("opencl") && hasFilter(base, "tonemap_opencl")) {
    const intel = vendor === "intel-ihd" || vendor === "intel-i965"
    // Intel maps VAAPI frames to OpenCL and back; others go through
    // memory to their own OpenCL device.
    result.tonemap = intel
      ? await testFilters(
          [...init, "-init_hw_device", openclDevice(vendor)],
          "va",
          [
            "hwupload",
            "hwmap=derive_device=opencl:mode=read",
            OPENCL_TONEMAP,
            "hwmap=derive_device=vaapi:mode=write:reverse=1",
            "format=vaapi",
            "hwdownload",
            "format=nv12",
          ],
        )
      : await testUploaded(
          [...init, "-init_hw_device", openclDevice(vendor)],
          "ocl",
          [OPENCL_TONEMAP],
        )
  }
  if (
    vendor === "intel-ihd" &&
    hasFilter(base, "tonemap_vaapi") &&
    hasFilter(base, "procamp_vaapi")
  ) {
    result.vppTonemap = await testUploaded(init, "va", VPP_TONEMAP)
  }
  return result
}

async function testQsvToneMapping(
  init: string[],
  base: TranscodingCapabilities,
): Promise<ToneMapping> {
  const result = noToneMapping()
  if (base.hwaccels.includes("opencl") && hasFilter(base, "tonemap_opencl")) {
    result.tonemap = await testFilters(
      [...init, "-init_hw_device", "opencl=ocl@va"],
      "va",
      [
        "hwupload",
        "hwmap=derive_device=opencl:mode=read",
        OPENCL_TONEMAP,
        "hwmap=derive_device=qsv:mode=write:reverse=1:extra_hw_frames=16",
        "format=qsv",
        "hwdownload",
        "format=nv12",
      ],
    )
  }
  if (hasFilter(base, "tonemap_vaapi") && hasFilter(base, "procamp_vaapi")) {
    result.vppTonemap = await testFilters(init, "va", [
      "hwupload",
      ...VPP_TONEMAP,
      "hwmap=derive_device=qsv",
      "format=qsv",
      "hwdownload",
      "format=nv12",
    ])
  }
  return result
}

async function testCudaToneMapping(
  init: string[],
  base: TranscodingCapabilities,
): Promise<ToneMapping> {
  const result = noToneMapping()
  if (hasFilter(base, "tonemap_cuda")) {
    result.tonemap = await testUploaded(
      init,
      "cu",
      [`tonemap_cuda=format=yuv420p:${TONEMAP_ARGS}`],
      "yuv420p",
    )
  }
  return result
}

async function testVideoToolboxToneMapping(
  init: string[],
  base: TranscodingCapabilities,
): Promise<ToneMapping> {
  const result = noToneMapping()
  if (hasFilter(base, "tonemap_videotoolbox")) {
    result.tonemap = await testUploaded(init, "vt", [
      `tonemap_videotoolbox=format=nv12:${TONEMAP_ARGS}`,
    ])
  }
  if (hasFilter(base, "scale_vt")) {
    result.videoToolboxTonemap = await testUploaded(init, "vt", [
      "scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709",
    ])
  }
  return result
}
