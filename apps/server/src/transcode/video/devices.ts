import {
  hasHwaccel,
  isCudaFullSupported,
  isHardwareEncoder,
  versionAtLeast,
} from "./support"
import type { Chain, Plan } from "./types"

/* Devices, from GetInputVideoHwaccelArgs. */

const VAAPI = "va"
const QSV = "qs"
const OPENCL = "ocl"
const CUDA = "cu"
const VIDEOTOOLBOX = "vt"

/**
 * A VAAPI device on the configured node, or Intel's when there is none:
 * by vendor id from 7.0.1, by kernel driver before.
 */
function vaapiDevice(plan: Plan, path: string, driver: string | null): string {
  const intel = versionAtLeast(plan, [7, 0, 1])
    ? ",vendor_id=0x8086"
    : ",kernel_driver=i915"
  const node = path || intel
  return `vaapi=${VAAPI}:${node}${driver ? `,driver=${driver}` : ""}`
}

/** OpenCL for the VAAPI vendor: Intel's maps VAAPI frames, AMD's is ROCm. */
export function openclDevice(vendor: string | null | undefined): string {
  if (vendor === "amd")
    return `opencl=${OPENCL}:.0,device_vendor=Advanced Micro Devices`
  if (vendor === "intel-ihd" || vendor === "intel-i965")
    return `opencl=${OPENCL}@${VAAPI}`
  return `opencl=${OPENCL}:0.0`
}

export function deviceArgs(plan: Plan, chain: Chain): string[] {
  const decoder = chain.decoder
  const s = plan.settings
  switch (plan.accel) {
    case "vaapi": {
      if (!hasHwaccel(plan, "vaapi")) return []
      if (!decoder && !isHardwareEncoder(plan, "vaapi")) return []
      const vendor = plan.hardware?.vendor
      const driver =
        vendor === "intel-ihd" ? "iHD" : vendor === "intel-i965" ? "i965" : null
      const args = ["-init_hw_device", vaapiDevice(plan, s.vaapiDevice, driver)]
      if (chain.opencl === "filter-device") {
        args.push(
          "-init_hw_device",
          openclDevice(vendor),
          "-filter_hw_device",
          OPENCL,
        )
      } else if (vendor === "amd") {
        args.push("-filter_hw_device", VAAPI)
      }
      return args
    }
    case "qsv": {
      if (!hasHwaccel(plan, "qsv")) return []
      if (!decoder && !isHardwareEncoder(plan, "qsv")) return []
      // QSV on Linux is derived from Intel's VAAPI device.
      const args = [
        "-init_hw_device",
        vaapiDevice(plan, s.qsvDevice, "iHD"),
        "-init_hw_device",
        `qsv=${QSV}@${VAAPI}`,
      ]
      let filterDevice = QSV
      if (chain.opencl !== "none") {
        args.push("-init_hw_device", `opencl=${OPENCL}@${VAAPI}`)
        if (chain.opencl === "filter-device") filterDevice = OPENCL
      }
      return [...args, "-filter_hw_device", filterDevice]
    }
    case "nvenc":
      if (!isCudaFullSupported(plan)) return []
      if (!decoder && !isHardwareEncoder(plan, "nvenc")) return []
      return ["-init_hw_device", `cuda=${CUDA}:0`, "-filter_hw_device", CUDA]
    case "videotoolbox":
      if (!hasHwaccel(plan, "videotoolbox")) return []
      if (!decoder && !isHardwareEncoder(plan, "videotoolbox")) return []
      return ["-init_hw_device", `videotoolbox=${VIDEOTOOLBOX}`]
    default:
      return []
  }
}
