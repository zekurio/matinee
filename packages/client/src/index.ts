import type { Contract } from "@matinee/contracts"
// From its own module, not the package's index, which would bring every
// schema of the contract into a client that only needs the path.
import { RPC_PATH } from "@matinee/contracts/paths"
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
  /** Sends the requests. The global `fetch` unless given. */
  fetch?: (request: Request) => Promise<Response>
}

function originOf(options: MatineeClientOptions): string | undefined {
  return options.baseUrl?.replace(/\/$/, "") ?? globalThis.location?.origin
}

function authHeaders(options: MatineeClientOptions): Record<string, string> {
  const token = options.token?.()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export function createMatineeClient(
  options: MatineeClientOptions = {},
): MatineeClient {
  const link = new RPCLink({
    url: `${originOf(options)}${RPC_PATH}`,
    headers: () => authHeaders(options),
    fetch: (request, init) => {
      const sent = new Request(request, { ...init, credentials: "same-origin" })
      return options.fetch ? options.fetch(sent) : globalThis.fetch(sent)
    },
  })
  return createORPCClient(link)
}

/** What the procedure at `group.procedure` takes. */
type InputOf<
  G extends keyof MatineeClient,
  P extends keyof MatineeClient[G],
> = Parameters<Extract<MatineeClient[G][P], (...args: never) => object>>[0]

/**
 * Calls a procedure as the page goes away, without an answer. The client
 * above awaits before it fetches, and a closing page never gets back to
 * it, so its call is lost. This fetches at once, in the same task, with
 * `keepalive`, which outlives the page. Only for small inputs of plain
 * JSON: a keepalive request carries at most 64 KB, and the serializer's
 * dates and the like are left out.
 */
export type MatineeLastCall = <
  G extends keyof MatineeClient,
  P extends keyof MatineeClient[G] & string,
>(
  group: G,
  procedure: P,
  input: InputOf<G, P>,
) => void

export function createMatineeLastCall(
  options: Pick<MatineeClientOptions, "baseUrl" | "token"> = {},
): MatineeLastCall {
  return (group, procedure, input) => {
    void fetch(`${originOf(options)}${RPC_PATH}/${group}/${procedure}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(options) },
      credentials: "same-origin",
      body: JSON.stringify({ json: input }),
      keepalive: true,
    }).catch(() => {})
  }
}

export { ORPCError } from "@orpc/client"
