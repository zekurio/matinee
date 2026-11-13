import type { AdminNetworkSettings } from "@matinee/contracts"
import type { Context } from "hono"

import { log } from "../log"
import { connectionOf } from "../network/connection"
import {
  invalidRange,
  type NetworkRules,
  networkRules,
  saveNetwork,
} from "../network/settings"
import { admin, badRequest } from "./base"

function describe(c: Context, rules: NetworkRules): AdminNetworkSettings {
  return { settings: rules.settings, connection: connectionOf(c, rules) }
}

export const adminNetwork = {
  get: admin.admin.network.get.handler(async ({ context }) =>
    describe(context.hono, await networkRules()),
  ),

  update: admin.admin.network.update.handler(async ({ context, input }) => {
    const invalid = invalidRange(input)
    if (invalid !== null) {
      throw badRequest(
        `${invalid} isn't an address or a range like 192.168.0.0/16.`,
      )
    }
    const rules = await saveNetwork(input)
    log.info(`Network settings saved by ${context.user.username}`)
    return describe(context.hono, rules)
  }),
}
