import {
  contract,
  MAX_AVATAR_BYTES,
  MAX_IMAGE_BYTES,
  OPENAPI_PATH,
  RPC_PATH,
} from "@matinee/contracts"
import type { AnyContractProcedure } from "@orpc/contract"
import { traverseContractProcedures } from "@orpc/server"
import type { Context, MiddlewareHandler, Next } from "hono"
import { bodyLimit } from "hono/body-limit"

/*
 * How large a request body may be, checked before anything parses it: a
 * declared length up front, a chunked body as it arrives. Most requests
 * carry a little JSON or a form. The upload procedures take a file, as
 * multipart over RPC and over REST, and get its limit with room for the rest
 * of the form.
 */

/** A request that isn't an upload. */
const DEFAULT_MAX_BYTES = 1024 * 1024
/** The multipart framing and the fields beside the file. */
const FORM_OVERHEAD_BYTES = 64 * 1024

/** The procedures that take a file, each with the file's largest size. */
const UPLOADS = new Map<AnyContractProcedure, number>([
  [contract.account.avatar.upload, MAX_AVATAR_BYTES],
  [contract.titles.uploadImage, MAX_IMAGE_BYTES],
])

type Upload = { method: string; path: RegExp; maxBytes: number }

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^$()|[\]\\]/g, "\\$&")
}

/** Where each upload procedure is served, over RPC and over REST. */
function uploadRoutes(): Upload[] {
  const routes: Upload[] = []
  traverseContractProcedures(
    { router: contract, path: [] },
    ({ contract: procedure, path }) => {
      const maxBytes = UPLOADS.get(procedure)
      if (maxBytes === undefined) return
      const limit = maxBytes + FORM_OVERHEAD_BYTES
      const rpc = `${RPC_PATH}/${path.join("/")}`
      routes.push({
        method: "POST",
        path: new RegExp(`^${escapeRegExp(rpc)}$`),
        maxBytes: limit,
      })
      const { method, path: rest } = procedure["~orpc"].route
      if (!method || !rest) return
      // `{id}` stands for one segment of the path. Braces aren't escaped.
      const pattern = escapeRegExp(`${OPENAPI_PATH}${rest}`).replace(
        /\{[^}]+\}/g,
        "[^/]+",
      )
      routes.push({ method, path: new RegExp(`^${pattern}$`), maxBytes: limit })
    },
  )
  if (routes.length < UPLOADS.size * 2) {
    throw new Error("An upload procedure isn't in the contract.")
  }
  return routes
}

function tooLarge(c: Context) {
  return c.json({ error: "The request is too large." }, 413)
}

/** Refuse a request body over the limit of its route. */
export function limitBodies(): MiddlewareHandler {
  const routes = uploadRoutes().map((route) => ({
    ...route,
    check: bodyLimit({ maxSize: route.maxBytes, onError: tooLarge }),
  }))
  const fallback = bodyLimit({ maxSize: DEFAULT_MAX_BYTES, onError: tooLarge })
  return (c: Context, next: Next) => {
    const upload = routes.find(
      (route) => route.method === c.req.method && route.path.test(c.req.path),
    )
    return (upload?.check ?? fallback)(c, next)
  }
}
