import {
  type CheckStatus,
  type EncoderCheck,
  type HardwareCapability,
  type HardwareDevice,
  TRANSCODE_VIDEO_CODECS,
  type TranscodingCapabilities,
} from "@matinee/contracts"

import { hardwareEncoderName, hasLowPowerMode } from "../video/encoders"
import {
  type CapabilityDevices,
  HWACCELS,
  initArgs,
  openDevice,
  vendorOf,
} from "./device"
import { missing } from "./ffmpeg"
import { testEncoder } from "./test-encode"
import { testToneMapping } from "./test-tonemap"

export function missingHardware(
  acceleration: HardwareDevice,
): HardwareCapability {
  return {
    acceleration,
    device: missing(),
    devicePath: null,
    driver: null,
    vendor: null,
    encoders: TRANSCODE_VIDEO_CODECS.map((codec) => ({
      codec,
      encoder: hardwareEncoderName(codec, acceleration) ?? codec,
      status: "missing",
      error: null,
      tenBit: "missing",
      lowPower: missing(),
    })),
    tonemap: missing(),
    vppTonemap: missing(),
    videoToolboxTonemap: missing(),
  }
}

export async function detectHardware(
  acceleration: HardwareDevice,
  devices: CapabilityDevices,
  base: TranscodingCapabilities,
): Promise<HardwareCapability> {
  const entry = missingHardware(acceleration)
  if (!base.hwaccels.includes(HWACCELS.get(acceleration) ?? acceleration))
    return entry
  const path =
    acceleration === "vaapi"
      ? devices.vaapiDevice
      : acceleration === "qsv"
        ? devices.qsvDevice
        : ""
  const opened = await openDevice(acceleration, path)
  entry.device = opened.device
  entry.devicePath =
    acceleration === "nvenc"
      ? "0"
      : acceleration === "videotoolbox"
        ? null
        : opened.node
  entry.driver = opened.driver
  if (opened.device.status !== "ok") {
    entry.encoders = entry.encoders.map((encoder) => ({
      ...encoder,
      status: base.encoders.includes(encoder.encoder) ? "failed" : "missing",
      error: base.encoders.includes(encoder.encoder)
        ? "The device didn't open."
        : null,
    }))
    return entry
  }
  entry.vendor =
    acceleration === "nvenc"
      ? "nvidia"
      : acceleration === "videotoolbox"
        ? "apple"
        : vendorOf(opened.driver)

  const encoders: EncoderCheck[] = []
  for (const codec of TRANSCODE_VIDEO_CODECS) {
    const name = hardwareEncoderName(codec, acceleration) ?? codec
    if (!base.encoders.includes(name)) {
      encoders.push({
        codec,
        encoder: name,
        status: "missing",
        error: null,
        tenBit: "missing",
        lowPower: missing(),
      })
      continue
    }
    const test = (tenBit: boolean, lowPower: boolean) =>
      testEncoder(acceleration, codec, tenBit, lowPower, devices, base, entry)
    const sdr = await test(false, false)
    let tenBit: CheckStatus = "missing"
    if (codec !== "h264" && sdr.status === "ok") {
      tenBit = (await test(true, false)).status
    }
    // Low power needs VDENC for the codec, and the HuC firmware for bitrate
    // control. Jellyfin offers it untested.
    const lowPower =
      sdr.status === "ok" && hasLowPowerMode(name, entry.vendor)
        ? await test(false, true)
        : missing()
    encoders.push({ codec, encoder: name, ...sdr, tenBit, lowPower })
  }
  entry.encoders = encoders
  const toneMapping = await testToneMapping(
    acceleration,
    initArgs(acceleration, path, entry.vendor),
    entry.vendor,
    base,
  )
  return { ...entry, ...toneMapping }
}
