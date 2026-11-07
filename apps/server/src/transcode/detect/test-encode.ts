import type {
  CapabilityCheck,
  HardwareCapability,
  HardwareDevice,
  TranscodeVideoCodec,
  TranscodingCapabilities,
  TranscodingSettings,
} from "@matinee/contracts"

import { buildVideoPipeline } from "../pipeline"
import { transcodingDefaults } from "../settings"
import { hardwareEncoderName } from "../video/encoders"
import type { CapabilityDevices } from "./device"
import { check, failed, missing, ok } from "./ffmpeg"
import {
  HDR_LAVFI,
  HDR_TEST_SOURCE,
  SDR_LAVFI,
  SDR_TEST_SOURCE,
  TEST_FRAMES,
} from "./test-media"

/**
 * One encode through the real pipeline from system memory, the path every
 * source takes that the GPU doesn't decode. The capabilities claim only
 * this encoder works, in low-power mode with `lowPower`, so the pipeline
 * picks it and nothing else.
 */
export async function testEncoder(
  acceleration: HardwareDevice,
  codec: TranscodeVideoCodec,
  tenBit: boolean,
  lowPower: boolean,
  devices: CapabilityDevices,
  base: TranscodingCapabilities,
  hardware: HardwareCapability,
): Promise<CapabilityCheck> {
  const settings: TranscodingSettings = {
    ...transcodingDefaults(),
    ...devices,
    hardwareAcceleration: acceleration,
    enableHardwareEncoding: true,
    enableIntelLowPowerH264HwEncoder: lowPower,
    enableIntelLowPowerHevcHwEncoder: lowPower,
    hardwareDecodingCodecs: [],
  }
  const trial: TranscodingCapabilities = {
    ...base,
    hardware: [
      {
        ...hardware,
        encoders: [
          {
            codec,
            encoder: hardwareEncoderName(codec, acceleration) ?? codec,
            status: "ok",
            error: null,
            tenBit: tenBit ? "ok" : "missing",
            lowPower: lowPower ? ok() : missing(),
          },
        ],
      },
    ],
  }
  const pipeline = buildVideoPipeline(
    tenBit ? HDR_TEST_SOURCE : SDR_TEST_SOURCE,
    {
      codec,
      bitrate: 2_000_000,
      segmentSeconds: 1,
      startSeconds: 0,
      keepHdr: tenBit,
    },
    settings,
    trial,
  )
  if (pipeline.encoder !== hardwareEncoderName(codec, acceleration)) {
    return failed(`The pipeline chose ${pipeline.encoder}.`)
  }
  return check([
    ...pipeline.inputArgs,
    "-f",
    "lavfi",
    "-i",
    tenBit ? HDR_LAVFI : SDR_LAVFI,
    ...(pipeline.filters.length > 0 ? ["-vf", pipeline.filters.join(",")] : []),
    ...pipeline.outputArgs,
    "-frames:v",
    String(TEST_FRAMES),
    "-f",
    "null",
    "-",
  ])
}
