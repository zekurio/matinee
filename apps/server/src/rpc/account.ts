import { oidcAccount, passkey } from "@matinee/db"
import { and, count, desc, eq } from "drizzle-orm"

import { activeOidc } from "../auth/oidc-settings"
import {
  beginRegister,
  finishRegistration,
  PasskeyError,
  publicPasskey,
  storePasskey,
} from "../auth/passkeys"
import { db } from "../db"
import { authed, badRequest, notFound } from "./base"

async function signInMethodCount(userId: string): Promise<number> {
  const [passkeys] = await db
    .select({ n: count() })
    .from(passkey)
    .where(eq(passkey.userId, userId))
  // A linked account only signs you in while single sign-on is on.
  if (!(await activeOidc())) return passkeys?.n ?? 0
  const [accounts] = await db
    .select({ n: count() })
    .from(oidcAccount)
    .where(eq(oidcAccount.userId, userId))
  return (passkeys?.n ?? 0) + (accounts?.n ?? 0)
}

const LAST_METHOD =
  "Add another passkey or link an account before removing your last way to sign in."

export const account = {
  passkeys: {
    list: authed.account.passkeys.list.handler(async ({ context }) => {
      const rows = await db
        .select()
        .from(passkey)
        .where(eq(passkey.userId, context.user.id))
        .orderBy(desc(passkey.createdAt))
      return rows.map(publicPasskey)
    }),

    registerOptions: authed.account.passkeys.registerOptions.handler(
      ({ context }) =>
        beginRegister({
          userId: context.user.id,
          username: context.user.username,
        }),
    ),

    register: authed.account.passkeys.register.handler(
      async ({ context, input }) => {
        const verified = await finishRegistration(
          "passkey-register",
          input.challengeId,
          input.response,
        ).catch((cause: unknown) => {
          if (cause instanceof PasskeyError) throw badRequest(cause.message)
          throw cause
        })
        if (verified.payload.userId !== context.user.id) {
          throw badRequest("This passkey request belongs to another account.")
        }
        const row = await storePasskey(db, {
          userId: context.user.id,
          verified,
          name: input.name || null,
        })
        return publicPasskey(row)
      },
    ),

    rename: authed.account.passkeys.rename.handler(
      async ({ context, input }) => {
        const [row] = await db
          .update(passkey)
          .set({ name: input.name || null })
          .where(
            and(eq(passkey.id, input.id), eq(passkey.userId, context.user.id)),
          )
          .returning()
        if (!row) throw notFound("Passkey not found.")
        return publicPasskey(row)
      },
    ),

    remove: authed.account.passkeys.remove.handler(
      async ({ context, input }) => {
        if ((await signInMethodCount(context.user.id)) <= 1) {
          throw badRequest(LAST_METHOD)
        }
        const deleted = await db
          .delete(passkey)
          .where(
            and(eq(passkey.id, input.id), eq(passkey.userId, context.user.id)),
          )
          .returning({ id: passkey.id })
        if (deleted.length === 0) throw notFound("Passkey not found.")
      },
    ),
  },

  oidc: {
    list: authed.account.oidc.list.handler(async ({ context }) => {
      const rows = await db
        .select()
        .from(oidcAccount)
        .where(eq(oidcAccount.userId, context.user.id))
        .orderBy(desc(oidcAccount.createdAt))
      return rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.createdAt,
      }))
    }),

    unlink: authed.account.oidc.unlink.handler(async ({ context, input }) => {
      if ((await signInMethodCount(context.user.id)) <= 1) {
        throw badRequest(LAST_METHOD)
      }
      const deleted = await db
        .delete(oidcAccount)
        .where(
          and(
            eq(oidcAccount.id, input.id),
            eq(oidcAccount.userId, context.user.id),
          ),
        )
        .returning({ id: oidcAccount.id })
      if (deleted.length === 0) throw notFound("Linked account not found.")
    }),
  },
}
