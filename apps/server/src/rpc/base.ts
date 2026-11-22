import {
  contract,
  holdsPermission,
  type Permission,
  ProcedureMeta,
  sortPermissions,
} from "@matinee/contracts"
import { oo } from "@orpc/openapi"
import { implement, ORPCError, os } from "@orpc/server"
import type { Context } from "hono"

import { can, readCallerViewer, type Viewer } from "../access/viewer"
import { passkeysEnabled } from "../auth/passkey-settings"
import { type RateLimit, takeTry, TOO_MANY_TRIES } from "../rate-limit"

export type RpcContext = {
  /** The Hono request, for cookies and headers. */
  hono: Context
}

export const pub = implement(contract).$context<RpcContext>()

const requireSession = os
  .$context<RpcContext>()
  .middleware(async ({ context, next, procedure }) => {
    // The user with what they may open; see `access/visible.ts`.
    const user = await readCallerViewer(context.hono)
    if (!user) {
      throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." })
    }
    // The contract says which permission covers a procedure. The account
    // needs it, from its groups or as an admin, and so does the API token
    // the request came with, which only ever narrows its account. One
    // that names none takes `all`, so a new procedure is an admin's alone
    // until someone names its permission.
    const permission =
      ProcedureMeta.safeParse(procedure["~orpc"].meta).data?.permission ?? "all"
    if (permission !== false && !can(user, permission)) {
      throw holdsPermission(user.access.permissions, permission)
        ? new ORPCError("FORBIDDEN", {
            message: `This API token doesn't have the ${permission} permission.`,
          })
        : forbidden(permission)
    }
    return next({ context: { user } })
  })

// The OpenAPI document marks every procedure behind this as needing a
// session or an API token, sent either way. The schemes are defined in
// `openapi.ts`, and each operation says which permission it takes. What
// only admins did before permissions is behind this too: its permission
// is one only an admin or a group that grants it holds.
export const authed = pub.use(
  oo.spec(requireSession, { security: [{ bearer: [] }, { cookie: [] }] }),
)

/**
 * Hold each client to `limit` for a procedure, with TOO_MANY_REQUESTS past
 * it. Use one of `LIMITS` from `rate-limit.ts`.
 */
export function limited(limit: RateLimit) {
  return os.$context<RpcContext>().middleware(async ({ context, next }) => {
    const wait = await takeTry(context.hono, limit)
    if (wait > 0) throw tooManyRequests(TOO_MANY_TRIES, wait)
    return next()
  })
}

export function tooManyRequests(
  message: string,
  retryAfter: number,
): ORPCError<"TOO_MANY_REQUESTS", { retryAfter: number }> {
  return new ORPCError("TOO_MANY_REQUESTS", {
    message,
    data: { retryAfter },
  })
}

/** What an account gets for something it lacks the permission for. */
export function forbidden(
  permission: Permission,
): ORPCError<"FORBIDDEN", unknown> {
  return new ORPCError("FORBIDDEN", {
    message:
      permission === "all"
        ? "Only admins can do this."
        : `Your account doesn't have the ${permission} permission.`,
  })
}

/**
 * Refuse a change to who holds `permissions` unless the caller holds
 * every one of them: nobody grants, or takes away, what they don't have
 * themselves. It covers a group's permissions, putting an account in a
 * group that grants them, and an account's own allow and deny.
 */
export function requireOwn(
  viewer: Viewer,
  permissions: readonly Permission[],
): void {
  const missing = sortPermissions(
    permissions.filter((permission) => !can(viewer, permission)),
  )
  if (missing.length === 0) return
  throw new ORPCError("FORBIDDEN", {
    message: `You can only grant or take away permissions you have yourself. You don't have ${missing.join(", ")}.`,
  })
}

/**
 * Refuse an API token that would add a way to sign in as its account,
 * unless it holds `all`. A session, a passkey, or a linked sign-in does
 * everything the account may, so only a token that already does hands
 * one on, as a token grants another only what it holds. A session passes.
 */
export function requireWholeAccount(viewer: Viewer): void {
  const { credential } = viewer
  if (credential.kind === "session" || credential.permissions.includes("all")) {
    return
  }
  throw new ORPCError("FORBIDDEN", {
    message:
      "Adding a way to sign in takes a session, or an API token with all permissions.",
  })
}

export function badRequest(message: string): ORPCError<"BAD_REQUEST", unknown> {
  return new ORPCError("BAD_REQUEST", { message })
}

export function notFound(message: string): ORPCError<"NOT_FOUND", unknown> {
  return new ORPCError("NOT_FOUND", { message })
}

const PASSKEYS_OFF = "Passkeys are turned off on this server."

/** Refuse a passkey procedure while an admin has passkeys off. */
export async function requirePasskeys(): Promise<void> {
  if (!(await passkeysEnabled())) throw badRequest(PASSKEYS_OFF)
}
