import { contract } from "@matinee/contracts"
import { implement, ORPCError } from "@orpc/server"
import type { Context } from "hono"

import { readSession } from "../auth/session"

export type RpcContext = {
  /** The Hono request, for cookies and headers. */
  hono: Context
}

export const pub = implement(contract).$context<RpcContext>()

export const authed = pub.use(async ({ context, next }) => {
  const user = await readSession(context.hono)
  if (!user) throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." })
  return next({ context: { user } })
})

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
