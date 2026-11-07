import type {
  GpuVendor,
  HardwareAcceleration,
  HardwareCapability,
  TranscodeVideoCodec,
  TranscodingCapabilities,
  TranscodingSettings,
} from "@matinee/contracts"

const SOFTWARE_ENCODERS = new Map<TranscodeVideoCodec, string>([
  ["h264", "libx264"],
  ["hevc", "libx265"],
  ["av1", "libsvtav1"],
])

const HARDWARE_SUFFIXES = new Map<HardwareAcceleration, string>([
  ["vaapi", "vaapi"],
  ["qsv", "qsv"],
  ["nvenc", "nvenc"],
  ["videotoolbox", "videotoolbox"],
])

/** The encoder name for a codec on an acceleration, like `hevc_vaapi`. */
export function hardwareEncoderName(
  codec: TranscodeVideoCodec,
  acceleration: HardwareAcceleration,
): string | null {
  const suffix = HARDWARE_SUFFIXES.get(acceleration)
  return suffix ? `${codec}_${suffix}` : null
}

/** The software encoder for a codec. */
export function softwareEncoderName(codec: TranscodeVideoCodec): string {
  return SOFTWARE_ENCODERS.get(codec) ?? "libx264"
}

/** The configured acceleration, if its device opened. */
export function usableHardware(
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
): HardwareCapability | null {
  if (settings.hardwareAcceleration === "none") return null
  const hardware = capabilities.hardware.find(
    (entry) => entry.acceleration === settings.hardwareAcceleration,
  )
  return hardware?.device.status === "ok" ? hardware : null
}

export function encoderWorks(
  hardware: HardwareCapability,
  codec: TranscodeVideoCodec,
  tenBit: boolean,
): boolean {
  const check = hardware.encoders.find((entry) => entry.codec === codec)
  if (check?.status !== "ok") return false
  return !tenBit || check.tenBit === "ok"
}

/**
 * The encoders with an Intel low-power mode, as Jellyfin offers it: H.264
 * and HEVC on QSV, and on VAAPI with an Intel driver.
 */
export function hasLowPowerMode(
  encoder: string,
  vendor: GpuVendor | null,
): boolean {
  if (encoder === "h264_qsv" || encoder === "hevc_qsv") return true
  return (
    (encoder === "h264_vaapi" || encoder === "hevc_vaapi") &&
    (vendor === "intel-ihd" || vendor === "intel-i965")
  )
}

/**
 * GetH26xOrAv1Encoder: the GPU's encoder when hardware encoding is on and
 * it passed its test encode, else the software one. An HDR encode needs
 * one that passed at 10 bits.
 */
export function chooseEncoder(
  codec: TranscodeVideoCodec,
  tenBit: boolean,
  settings: TranscodingSettings,
  capabilities: TranscodingCapabilities,
  hardware: HardwareCapability | null,
): string {
  const name = hardwareEncoderName(codec, settings.hardwareAcceleration)
  if (
    name &&
    hardware &&
    settings.enableHardwareEncoding &&
    encoderWorks(hardware, codec, tenBit)
  ) {
    return name
  }
  const software = softwareEncoderName(codec)
  if (capabilities.encoders.includes(software)) return software
  throw new Error(`This ffmpeg has no working encoder for ${codec}.`)
}
