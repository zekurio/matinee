import { user } from "@matinee/db"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { activeOidc } from "../auth/oidc-settings"
import {
  beginSignIn,
  beginSignUp,
  finishRegistration,
  finishSignIn,
  PasskeyError,
  storePasskey,
} from "../auth/passkeys"
import { publicUser, readSession, signIn, signOut } from "../auth/session"
import {
  endSetupAccess,
  hasSetupAccess,
  markSetupDone,
  setupRequired,
  setupTokenRequired,
  unlockSetup,
} from "../auth/setup"
import { insertUser, lockUsers, usernameTaken } from "../auth/users"
import { db } from "../db"
import { env } from "../env"
import { badRequest, pub } from "./base"

/** What `beginSignUp` stored with the challenge. */
const SignUpPayload = z.object({
  userId: z.string(),
  username: z.string(),
  setup: z.boolean(),
})

function passkeyFailure(cause: unknown): never {
  if (cause instanceof PasskeyError) throw badRequest(cause.message)
  throw cause
}

export const auth = {
  config: pub.auth.config.handler(async () => {
    const setup = await setupRequired()
    const provider = await activeOidc()
    return {
      setupRequired: setup,
      setupTokenRequired: setup && setupTokenRequired(),
      passkeySignUp: env.MATINEE_OPEN_REGISTRATION,
      oidc: provider ? { displayName: provider.settings.displayName } : null,
    }
  }),

  session: pub.auth.session.handler(async ({ context }) => {
    const current = await readSession(context.hono)
    return { user: current ? publicUser(current) : null }
  }),

  signOut: pub.auth.signOut.handler(async ({ context }) => {
    await signOut(context.hono)
  }),

  unlockSetup: pub.auth.unlockSetup.handler(async ({ context, input }) => {
    if (!(await setupRequired())) throw badRequest("Setup is already done.")
    if (!unlockSetup(context.hono, input.token)) {
      throw badRequest("That setup token doesn't match the one in the log.")
    }
  }),

  passkey: {
    signInOptions: pub.auth.passkey.signInOptions.handler(() => beginSignIn()),

    signIn: pub.auth.passkey.signIn.handler(async ({ context, input }) => {
      const userId = await finishSignIn(
        input.challengeId,
        input.response,
      ).catch(passkeyFailure)
      await signIn(context.hono, userId)
      const [row] = await db.select().from(user).where(eq(user.id, userId))
      if (!row) throw badRequest("This account no longer exists.")
      return publicUser(row)
    }),

    signUpOptions: pub.auth.passkey.signUpOptions.handler(
      async ({ context, input }) => {
        const setup = await setupRequired()
        if (setup && !hasSetupAccess(context.hono)) {
          throw badRequest("Enter the setup token first.")
        }
        if (!setup && !env.MATINEE_OPEN_REGISTRATION) {
          throw badRequest("Ask an admin for an account.")
        }
        if (await usernameTaken(input.username)) {
          throw badRequest("That username is taken.")
        }
        return beginSignUp({ username: input.username, setup })
      },
    ),

    signUp: pub.auth.passkey.signUp.handler(async ({ context, input }) => {
      const verified = await finishRegistration(
        "passkey-sign-up",
        input.challengeId,
        input.response,
      ).catch(passkeyFailure)
      const payload = SignUpPayload.safeParse(verified.payload)
      if (!payload.success) {
        throw badRequest("The sign-up request is invalid.")
      }
      const { userId, username, setup } = payload.data
      if (setup && !hasSetupAccess(context.hono)) {
        throw badRequest("Enter the setup token first.")
      }

      const created = await db.transaction(async (tx) => {
        const { empty } = await lockUsers(tx)
        if (setup && !empty) {
          throw badRequest("Setup is already done. Sign in instead.")
        }
        if (!setup && (empty || !env.MATINEE_OPEN_REGISTRATION)) {
          throw badRequest("Ask an admin for an account.")
        }
        if (await usernameTaken(username, tx)) {
          throw badRequest("That username is taken.")
        }
        const row = await insertUser(tx, {
          id: userId,
          username,
          role: empty ? "admin" : "user",
        })
        await storePasskey(tx, { userId: row.id, verified, usedNow: true })
        return row
      })

      if (created.role === "admin") {
        markSetupDone()
        endSetupAccess(context.hono)
      }
      await signIn(context.hono, created.id)
      return publicUser(created)
    }),
  },
}
