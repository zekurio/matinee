import { saveThemeAccents, themeAccents } from "../auth/theme-accents"
import { log } from "../log"
import { admin } from "./base"

export const adminAppearance = {
  get: admin.admin.appearance.get.handler(() => themeAccents()),

  update: admin.admin.appearance.update.handler(async ({ context, input }) => {
    const accents = await saveThemeAccents(input)
    log.info(`Theme accents saved by ${context.user.username}`)
    return accents
  }),
}
