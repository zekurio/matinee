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
 * dates and the like are left out. And only for a call that may arrive
 * twice, as a closing report may.
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
    const origin = originOf(options)
    const url = `${origin}${RPC_PATH}/${group}/${procedure}`
    const request = {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(options) },
      credentials: "same-origin",
      body: JSON.stringify({ json: input }),
    } satisfies RequestInit
    void fetch(url, { ...request, keepalive: true }).catch(() => {})
    // A call to another origin needs a preflight, and Chromium before 81,
    // which TVs from 2019 and 2020 run, turns down a keepalive request
    // that needs one. So that call goes out once more without it, which
    // arrives when the engine lets it finish. The procedures this is for
    // take the same call twice.
    if (origin !== globalThis.location?.origin) {
      void fetch(url, request).catch(() => {})
    }
  }
}

export { ORPCError } from "@orpc/client"
