import type {
  AdminTranscodingSettings,
  TranscodingSettings,
} from "@matinee/contracts"

import { log } from "../log"
import { transcodingCapabilities } from "../transcode/capabilities"
import {
  saveTranscoding,
  transcodingDefaults,
  transcodingFromEnvironment,
  transcodingSettings,
} from "../transcode/settings"
import { HARDWARE_DECODE_SUPPORT } from "../transcode/video/decoder"
import { authed } from "./base"

async function describe(
  settings: TranscodingSettings,
  refresh = false,
): Promise<AdminTranscodingSettings> {
  return {
    settings,
    defaults: transcodingDefaults(),
    environment: transcodingFromEnvironment(),
    capabilities: await transcodingCapabilities(settings, refresh),
    hardwareDecodeSupport: [...HARDWARE_DECODE_SUPPORT],
  }
}

export const adminTranscoding = {
  get: authed.admin.transcoding.get.handler(async () =>
    describe(await transcodingSettings()),
  ),

  update: authed.admin.transcoding.update.handler(
    async ({ context, input }) => {
      const settings = await saveTranscoding(input)
      log.info(`Transcoding settings saved by ${context.user.username}`)
      return describe(settings)
    },
  ),

  detect: authed.admin.transcoding.detect.handler(async () =>
    describe(await transcodingSettings(), true),
  ),
}
