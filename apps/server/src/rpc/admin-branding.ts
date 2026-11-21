import { branding, saveBranding } from "../auth/branding"
import { log } from "../log"
import { loginBackdropTiles } from "../media/login-backdrop"
import { authed } from "./base"

export const adminBranding = {
  get: authed.admin.branding.get.handler(() => branding()),

  update: authed.admin.branding.update.handler(async ({ context, input }) => {
    const saved = await saveBranding(input)
    log.info(`Branding saved by ${context.user.username}`)
    return saved
  }),

  preview: authed.admin.branding.preview.handler(async ({ input }) => ({
    tiles: await loginBackdropTiles(input.artwork),
  })),
}
