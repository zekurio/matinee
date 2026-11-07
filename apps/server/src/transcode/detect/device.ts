import { access } from "node:fs/promises"

import type {
  GpuVendor,
  HardwareDevice,
  TranscodingSettings,
} from "@matinee/contracts"

import { failed, ffmpeg, ok } from "./ffmpeg"

/** The devices detection opens. Other settings don't change the result. */
export type CapabilityDevices = Pick<
  TranscodingSettings,
  "vaapiDevice" | "qsvDevice"
>

/** The hwaccel each acceleration needs in `-hwaccels`. */
export const HWACCELS = new Map<HardwareDevice, string>([
  ["vaapi", "vaapi"],
  ["qsv", "qsv"],
  ["nvenc", "cuda"],
  ["videotoolbox", "videotoolbox"],
])

/** The device arguments of each test: what the pipeline will open. */
export function initArgs(
  acceleration: HardwareDevice,
  path: string,
  vendor: GpuVendor | null,
): string[] {
  const node = path || ",vendor_id=0x8086"
  switch (acceleration) {
    case "vaapi": {
      const driver =
        vendor === "intel-ihd"
          ? ",driver=iHD"
          : vendor === "intel-i965"
            ? ",driver=i965"
            : ""
      return ["-init_hw_device", `vaapi=va:${path}${driver}`]
    }
    case "qsv":
      return [
        "-init_hw_device",
        `vaapi=va:${node},driver=iHD`,
        "-init_hw_device",
        "qsv=qs@va",
      ]
    case "nvenc":
      return ["-init_hw_device", "cuda=cu:0"]
    default:
      return ["-init_hw_device", "videotoolbox=vt"]
  }
}

export function vendorOf(driver: string | null): GpuVendor | null {
  if (!driver) return null
  if (driver.includes("Intel iHD driver")) return "intel-ihd"
  if (driver.includes("Intel i965 driver")) return "intel-i965"
  if (driver.includes("Mesa Gallium driver")) return "amd"
  return "other"
}

const NULL_INPUT = [
  "-f",
  "lavfi",
  "-i",
  "nullsrc=s=64x64:r=1:d=1",
  "-frames:v",
  "1",
  "-f",
  "null",
  "-",
]

/** A device opens; VAAPI also says whose driver it is (CheckVaapiDeviceByDriverName). */
export async function openDevice(acceleration: HardwareDevice, path: string) {
  if (path) {
    try {
      await access(path)
    } catch {
      return {
        device: failed(`${path} doesn't exist or isn't readable.`),
        driver: null,
        node: null,
      }
    }
  }
  const run = await ffmpeg([
    "-hide_banner",
    "-nostdin",
    "-v",
    "verbose",
    ...initArgs(acceleration, path, null),
    ...NULL_INPUT,
  ])
  const driver =
    run.stderr
      .map((line) => /VAAPI driver: (.+?)\.?\s*$/.exec(line)?.[1])
      .find(Boolean) ?? null
  // Without a path, VAAPI walks renderD128 up and logs each node it tries;
  // the last one tried is the one it opened.
  const tried = run.stderr
    .map((line) => /DRM render node for device (\d+)/.exec(line)?.[1])
    .findLast((index) => index !== undefined)
  const node =
    path || (run.ok && tried ? `/dev/dri/renderD${128 + Number(tried)}` : null)
  return { device: run.ok ? ok() : failed(run.error), driver, node }
}
