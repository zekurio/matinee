import { markSetupComplete } from "../auth/setup"
import { log } from "../log"
import { admin } from "./base"

export const adminSetup = {
  complete: admin.admin.setup.complete.handler(async ({ context }) => {
    await markSetupComplete()
    log.info(`Setup finished by ${context.user.username}`)
  }),
}
