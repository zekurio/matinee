import { markSetupComplete } from "../auth/setup"
import { log } from "../log"
import { authed } from "./base"

export const adminSetup = {
  complete: authed.admin.setup.complete.handler(async ({ context }) => {
    await markSetupComplete()
    log.info(`Setup finished by ${context.user.username}`)
  }),
}
