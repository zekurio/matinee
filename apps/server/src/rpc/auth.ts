import { t } from "@matinee/contracts/schema"
import { user } from "@matinee/db"
import { eq } from "drizzle-orm"

import { redeemAppCode } from "../auth/apps"
import {
  approveDeviceRequest,
  findDeviceRequest,
  pollDeviceSignIn,
  startDeviceSignIn,
} from "../auth/devices"
import {
  createOidcUser,
  linkOidcAccount,
  NO_LINKED_ACCOUNT,
  OidcError,
} from "../auth/oidc-accounts"
import { readPendingLink, takePendingLink } from "../auth/oidc-pending"
import { activeOidc } from "../auth/oidc-settings"
import {
  beginSignIn,
  beginSignUp,
  finishRegistration,
  finishSignIn,
  PasskeyError,
  storePasskey,
} from "../auth/passkeys"
import {
  createSession,
  publicUser,
  readSession,
  signIn,
  signOut,
} from "../auth/session"
import {
  endSetupAccess,
  hasSetupAccess,
  markSetupDone,
  setupRequired,
  setupTokenRequired,
  unlockSetup,
} from "../auth/setup"
import { themeAccents } from "../auth/theme-accents"
import { insertUser, lockUsers, usernameTaken } from "../auth/users"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { badRequest, authed, notFound, pub } from "./base"

/** What `beginSignUp` stored with the challenge. */
const SignUpPayload = t.object({
  userId: t.string(),
  username: t.string(),
  setup: t.boolean(),
})

const SIGN_UP_CLOSED = "Sign-up is closed on this server."

const PENDING_GONE = "This sign-in expired. Continue with single sign-on again."

function oidcFailure(cause: unknown): never {
  if (cause instanceof OidcError) throw badRequest(cause.message)
  throw cause
}

function passkeyFailure(cause: unknown): never {
  if (cause instanceof PasskeyError) throw badRequest(cause.message)
  throw cause
}

/** An account that still exists, for a sign-in someone approved earlier. */
async function approvedUser(userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId))
  if (!row) throw badRequest("This account no longer exists.")
  return row
}

const DEVICE_GONE =
  "That code doesn't work. It may have expired, or been used already."

export const auth = {
  config: pub.auth.config.handler(async () => {
    const setup = await setupRequired()
    const provider = await activeOidc()
    return {
      setupRequired: setup,
      setupTokenRequired: setup && setupTokenRequired(),
      passkeySignUp: env.MATINEE_OPEN_REGISTRATION,
      oidc: provider
        ? {
            displayName: provider.settings.displayName,
            allowSignUp: provider.settings.allowSignUp,
          }
        : null,
      themeAccents: await themeAccents(),
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
          throw badRequest(SIGN_UP_CLOSED)
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
          throw badRequest(SIGN_UP_CLOSED)
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

  oidc: {
    pending: {
      get: pub.auth.oidc.pending.get.handler(async ({ context }) => {
        const pending = await readPendingLink(context.hono)
        return pending ? { accountLabel: pending.identity.label } : null
      }),

      link: authed.auth.oidc.pending.link.handler(async ({ context }) => {
        const pending = await takePendingLink(context.hono)
        if (!pending) throw badRequest(PENDING_GONE)
        if (!(await activeOidc())) {
          throw badRequest("Single sign-on is turned off.")
        }
        await linkOidcAccount(context.user.id, pending.identity).catch(
          oidcFailure,
        )
        log.info(`Linked a pending OIDC sign-in to ${context.user.username}`)
        return { redirect: pending.redirect }
      }),

      signUp: pub.auth.oidc.pending.signUp.handler(async ({ context }) => {
        // A signed-in browser links the sign-in instead. A stale tab must not
        // swap it into a new account, so refuse before using it up.
        if (await readSession(context.hono)) {
          throw badRequest("Sign out before creating a new account.")
        }
        const pending = await takePendingLink(context.hono)
        if (!pending) throw badRequest(PENDING_GONE)
        const provider = await activeOidc()
        if (!provider?.settings.allowSignUp) {
          throw badRequest(NO_LINKED_ACCOUNT)
        }
        const created = await createOidcUser(pending.identity, false).catch(
          oidcFailure,
        )
        log.info(`OIDC sign-in created ${created.username}`)
        await signIn(context.hono, created.id)
        return { user: publicUser(created), redirect: pending.redirect }
      }),

      discard: pub.auth.oidc.pending.discard.handler(async ({ context }) => {
        await takePendingLink(context.hono)
      }),
    },
  },

  app: {
    token: pub.auth.app.token.handler(async ({ context, input }) => {
      const redeemed = await redeemAppCode(input.code, input.codeVerifier)
      if (!redeemed) {
        throw badRequest("This sign-in expired or was used already. Try again.")
      }
      const row = await approvedUser(redeemed.userId)
      const token = await createSession(context.hono, row.id, redeemed.device)
      return { token, user: publicUser(row) }
    }),
  },

  device: {
    start: pub.auth.device.start.handler(({ input }) =>
      startDeviceSignIn(input),
    ),

    poll: pub.auth.device.poll.handler(async ({ context, input }) => {
      const result = await pollDeviceSignIn(input.deviceCode)
      if (result === "pending") return { status: "pending" as const }
      if (!result) throw notFound("This code expired. Get a new one.")
      const row = await approvedUser(result.userId)
      const token = await createSession(context.hono, row.id, result.device)
      return { status: "approved" as const, token, user: publicUser(row) }
    }),

    get: authed.auth.device.get.handler(async ({ input }) => {
      const request = await findDeviceRequest(input.userCode)
      if (!request) throw notFound(DEVICE_GONE)
      return request
    }),

    approve: authed.auth.device.approve.handler(async ({ context, input }) => {
      if (!(await approveDeviceRequest(input.userCode, context.user.id))) {
        throw notFound(DEVICE_GONE)
      }
    }),
  },
}
