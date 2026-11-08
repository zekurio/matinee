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
import { admin } from "./base"

async function describe(
  settings: TranscodingSettings,
  refresh = false,
): Promise<AdminTranscodingSettings> {
  return {
    settings,
    defaults: transcodingDefaults(),
    environment: transcodingFromEnvironment(),
    capabilities: await transcodingCapabilities(settings, refresh),
  }
}

export const adminTranscoding = {
  get: admin.admin.transcoding.get.handler(async () =>
    describe(await transcodingSettings()),
  ),

  update: admin.admin.transcoding.update.handler(async ({ context, input }) => {
    const settings = await saveTranscoding(input)
    log.info(`Transcoding settings saved by ${context.user.username}`)
    return describe(settings)
  }),

  detect: admin.admin.transcoding.detect.handler(async () =>
    describe(await transcodingSettings(), true),
  ),
}
