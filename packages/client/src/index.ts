import { type Contract, RPC_PATH } from "@matinee/contracts"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"

export type MatineeClient = ContractRouterClient<Contract>

export type MatineeClientOptions = {
  /**
   * Origin of the server, such as `https://media.example.com`. Browsers on
   * the server's own origin can leave it out.
   */
  baseUrl?: string
  /**
   * Session token for clients without cookies (TV and mobile apps). Browsers
   * use the HttpOnly session cookie instead.
   */
  token?: () => string | null | undefined
}

export function createMatineeClient(
  options: MatineeClientOptions = {},
): MatineeClient {
  const origin =
    options.baseUrl?.replace(/\/$/, "") ?? globalThis.location?.origin
  const link = new RPCLink({
    url: `${origin}${RPC_PATH}`,
    headers: () => {
      const token = options.token?.()
      return token ? { authorization: `Bearer ${token}` } : {}
    },
    fetch: (request, init) =>
      globalThis.fetch(request, { ...init, credentials: "same-origin" }),
  })
  return createORPCClient(link)
}

export { ORPCError, isDefinedError } from "@orpc/client"
