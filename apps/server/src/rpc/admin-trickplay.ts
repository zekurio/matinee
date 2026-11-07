import type {
  AdminTrickplaySettings,
  TrickplaySettings,
} from "@matinee/contracts"

import { log } from "../log"
import {
  makeMissingTrickplay,
  trickplayCoverage,
  trickplays,
} from "../media/trickplay"
import { saveTrickplay, trickplaySettings } from "../media/trickplay-settings"
import { currentTranscoding } from "../transcode/capabilities"
import { usableHardware } from "../transcode/video/encoders"
import { admin } from "./base"

async function describe(
  settings: TrickplaySettings,
): Promise<AdminTrickplaySettings> {
  const [coverage, transcoding] = await Promise.all([
    trickplayCoverage(settings),
    currentTranscoding(),
  ])
  const hardware = usableHardware(
    transcoding.settings,
    transcoding.capabilities,
  )
  return {
    settings,
    hardwareAcceleration: hardware?.acceleration ?? null,
    ...coverage,
  }
}

export const adminTrickplay = {
  get: admin.admin.trickplay.get.handler(async () =>
    describe(await trickplaySettings()),
  ),

  update: admin.admin.trickplay.update.handler(async ({ context, input }) => {
    const settings = await saveTrickplay(input)
    log.info(`Trickplay settings saved by ${context.user.username}`)
    if (settings.enabled) {
      // Files whose images no longer fit, or that never had any, get them
      // now rather than at the next task run. Waiting jobs read the new
      // settings when they start.
      makeMissingTrickplay().catch((cause: unknown) =>
        log.error("Couldn't queue trickplay images", cause),
      )
    } else {
      trickplays.clear()
    }
    return describe(settings)
  }),
}
