import { branding, saveBranding } from "../auth/branding"
import { log } from "../log"
import { loginBackdropTiles } from "../media/login-backdrop"
import { admin } from "./base"

export const adminBranding = {
  get: admin.admin.branding.get.handler(() => branding()),

  update: admin.admin.branding.update.handler(async ({ context, input }) => {
    const saved = await saveBranding(input)
    log.info(`Branding saved by ${context.user.username}`)
    return saved
  }),

  preview: admin.admin.branding.preview.handler(async ({ input }) => ({
    tiles: await loginBackdropTiles(input.artwork),
  })),
}
