import { contract } from "@matinee/contracts"
import { oo } from "@orpc/openapi"
import { implement, ORPCError, os } from "@orpc/server"
import type { Context } from "hono"

import { passkeysEnabled } from "../auth/passkey-settings"
import { readSession } from "../auth/session"

export type RpcContext = {
  /** The Hono request, for cookies and headers. */
  hono: Context
}

export const pub = implement(contract).$context<RpcContext>()

const requireSession = os
  .$context<RpcContext>()
  .middleware(async ({ context, next }) => {
    const user = await readSession(context.hono)
    if (!user) {
      throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." })
    }
    return next({ context: { user } })
  })

// The OpenAPI document marks every procedure behind this as needing a
// session, sent either way. The schemes are defined in `openapi.ts`.
export const authed = pub.use(
  oo.spec(requireSession, { security: [{ bearer: [] }, { cookie: [] }] }),
)

export const admin = authed.use(async ({ context, next }) => {
  if (context.user.role !== "admin") throw forbidden()
  return next()
})

/** What a user who isn't an admin gets for an admin procedure. */
export function forbidden(): ORPCError<"FORBIDDEN", unknown> {
  return new ORPCError("FORBIDDEN", { message: "Only admins can do this." })
}

export function badRequest(message: string): ORPCError<"BAD_REQUEST", unknown> {
  return new ORPCError("BAD_REQUEST", { message })
}

export function notFound(message: string): ORPCError<"NOT_FOUND", unknown> {
  return new ORPCError("NOT_FOUND", { message })
}

export function conflict(message: string): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", { message })
}

export const PASSKEYS_OFF = "Passkeys are turned off on this server."

/** Refuse a passkey procedure while an admin has passkeys off. */
export async function requirePasskeys(): Promise<void> {
  if (!(await passkeysEnabled())) throw badRequest(PASSKEYS_OFF)
}
