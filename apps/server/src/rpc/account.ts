import {
  grantsPermissions,
  type Permission,
  type User,
} from "@matinee/contracts"
import { oidcAccount, passkey, user, type UserRow } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, desc, eq } from "drizzle-orm"

import { userOf } from "../access/viewer"
import {
  createApiToken,
  getApiToken,
  listApiTokens,
  revokeApiToken,
  rotateApiToken,
  updateApiToken,
} from "../auth/api-tokens"
import {
  AvatarError,
  followProviderAvatar,
  removeAvatar,
  uploadAvatar,
} from "../auth/avatars"
import { unlinkOidcAccount } from "../auth/oidc-accounts"
import { activeOidc, sameIssuer } from "../auth/oidc-settings"
import { passkeysEnabled } from "../auth/passkey-settings"
import {
  beginRegister,
  finishRegistration,
  PasskeyError,
  publicPasskey,
  storePasskey,
} from "../auth/passkeys"
import {
  cleanDeviceName,
  deleteSession,
  deleteUserSessions,
  identifySession,
  listSessions,
  sessionIdOf,
  type SessionUser,
} from "../auth/session"
import { signInMethods } from "../auth/users"
import { db } from "../db"
import { authed, badRequest, notFound, requirePasskeys } from "./base"

const LAST_METHOD =
  "Add another passkey or link an account before removing your last way to sign in."
const LAST_LINK =
  "Passkeys are off, so single sign-on is your only way to sign in. Keep it linked."

const TOKEN_GONE = "That API token was already revoked."

/**
 * Refuse a token that asks for permissions it doesn't hold itself, for
 * another token it makes, changes, or rotates. A session grants any.
 */
function requireGrantable(
  caller: SessionUser,
  permissions: readonly Permission[],
): void {
  const { credential } = caller
  if (
    credential.kind === "apiToken" &&
    !grantsPermissions(credential.permissions, permissions)
  ) {
    throw badRequest("An API token can't grant permissions it doesn't have.")
  }
}

/** The updated user, with avatar failures turned into a message to act on. */
async function avatarChange(
  change: () => Promise<UserRow | null>,
): Promise<User> {
  const row = await change().catch((cause: unknown) => {
    if (cause instanceof AvatarError) throw badRequest(cause.message)
    throw cause
  })
  if (!row) throw notFound("Account not found.")
  return userOf(row)
}

export const account = {
  profile: {
    update: authed.account.profile.update.handler(
      async ({ context, input }) => {
        const [row] = await db
          .update(user)
          .set({
            // Drizzle leaves out keys that are undefined.
            displayName:
              input.displayName === undefined
                ? undefined
                : input.displayName || null,
            shareFavorites: input.sharing?.favorites,
            shareStats: input.sharing?.stats,
            updatedAt: new Date(),
          })
          .where(eq(user.id, context.user.id))
          .returning()
        if (!row) throw notFound("Account not found.")
        return userOf(row)
      },
    ),
  },

  avatar: {
    upload: authed.account.avatar.upload.handler(async ({ context, input }) => {
      const bytes = new Uint8Array(await input.file.arrayBuffer())
      return avatarChange(() => uploadAvatar(context.user.id, bytes))
    }),

    useProvider: authed.account.avatar.useProvider.handler(({ context }) =>
      avatarChange(() => followProviderAvatar(context.user.id)),
    ),

    remove: authed.account.avatar.remove.handler(({ context }) =>
      avatarChange(() => removeAvatar(context.user.id)),
    ),
  },

  playback: {
    setPreferences: authed.account.playback.setPreferences.handler(
      async ({ context, input }) => {
        const [row] = await db
          .update(user)
          .set({ playbackPreferences: input })
          .where(eq(user.id, context.user.id))
          .returning()
        if (!row) throw notFound("Account not found.")
        return userOf(row)
      },
    ),
  },

  library: {
    setPreferences: authed.account.library.setPreferences.handler(
      async ({ context, input }) => {
        const [row] = await db
          .update(user)
          // Drizzle leaves out keys that are undefined.
          .set({ showSpecials: input.showSpecials, updatedAt: new Date() })
          .where(eq(user.id, context.user.id))
          .returning()
        if (!row) throw notFound("Account not found.")
        return userOf(row)
      },
    ),
  },

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
      async ({ context }) => {
        await requirePasskeys()
        return beginRegister({
          userId: context.user.id,
          username: context.user.username,
        })
      },
    ),

    register: authed.account.passkeys.register.handler(
      async ({ context, input }) => {
        await requirePasskeys()
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
        // While passkeys are off, they aren't a way to sign in to keep.
        const methods = await signInMethods(context.user.id)
        if (methods.passkeys > 0 && methods.passkeys + methods.linked <= 1) {
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
    get: authed.account.oidc.get.handler(async ({ context }) => {
      const [row] = await db
        .select()
        .from(oidcAccount)
        .where(eq(oidcAccount.userId, context.user.id))
      if (!row) return null
      const provider = await activeOidc()
      return {
        label: row.label,
        hasPicture: row.picture !== null,
        // As `signInMethods` counts it.
        signsIn:
          provider !== null &&
          sameIssuer(row.issuer, provider.settings.issuerUrl),
        createdAt: row.createdAt,
      }
    }),

    unlink: authed.account.oidc.unlink.handler(async ({ context }) => {
      // A link single sign-on doesn't use signs nobody in.
      const methods = await signInMethods(context.user.id)
      if (methods.linked > 0 && methods.passkeys + methods.linked <= 1) {
        throw badRequest((await passkeysEnabled()) ? LAST_METHOD : LAST_LINK)
      }
      if (!(await unlinkOidcAccount(context.user.id))) {
        throw notFound("No account is linked.")
      }
    }),
  },

  apiTokens: {
    list: authed.account.apiTokens.list.handler(({ context }) =>
      listApiTokens(context.user.id),
    ),

    create: authed.account.apiTokens.create.handler(({ context, input }) => {
      requireGrantable(context.user, input.permissions)
      return createApiToken(context.user.id, input.name, input.permissions)
    }),

    me: authed.account.apiTokens.me.handler(async ({ context }) => {
      const { credential } = context.user
      if (credential.kind !== "apiToken") {
        throw new ORPCError("FORBIDDEN", {
          message: "This request didn't come with an API token.",
        })
      }
      const token = await getApiToken(context.user.id, credential.id)
      if (!token) throw notFound(TOKEN_GONE)
      return token
    }),

    update: authed.account.apiTokens.update.handler(
      async ({ context, input }) => {
        if (input.permissions) {
          requireGrantable(context.user, input.permissions)
        }
        const token = await updateApiToken(context.user.id, input.id, input)
        if (!token) throw notFound(TOKEN_GONE)
        return token
      },
    ),

    rotate: authed.account.apiTokens.rotate.handler(
      async ({ context, input }) => {
        // A new secret for a token that holds more would hand that on too.
        const existing = await getApiToken(context.user.id, input.id)
        if (!existing) throw notFound(TOKEN_GONE)
        requireGrantable(context.user, existing.permissions)
        const rotated = await rotateApiToken(context.user.id, input.id)
        if (!rotated) throw notFound(TOKEN_GONE)
        return rotated
      },
    ),

    revoke: authed.account.apiTokens.revoke.handler(
      async ({ context, input }) => {
        if (!(await revokeApiToken(context.user.id, input.id))) {
          throw notFound(TOKEN_GONE)
        }
      },
    ),
  },

  // An API token has no session of its own, so none is the current one:
  // it may end any of them, and "the others" are all of them.
  sessions: {
    list: authed.account.sessions.list.handler(({ context }) =>
      listSessions(context.user.id, sessionIdOf(context.user)),
    ),

    revoke: authed.account.sessions.revoke.handler(
      async ({ context, input }) => {
        if (input.id === sessionIdOf(context.user)) {
          throw badRequest("Sign out to end the session you're using.")
        }
        if (!(await deleteSession(context.user.id, input.id))) {
          throw notFound("That session already ended.")
        }
      },
    ),

    revokeOthers: authed.account.sessions.revokeOthers.handler(
      async ({ context }) => ({
        revoked: await deleteUserSessions(
          context.user.id,
          sessionIdOf(context.user),
        ),
      }),
    ),

    identify: authed.account.sessions.identify.handler(
      async ({ context, input }) => {
        // The contract's minimum counts characters this takes out, like a
        // zero-width space, and a name of only those is no name.
        const name = cleanDeviceName(input.name)
        if (!name) throw badRequest("Enter a name.")
        // An API token goes by the name its owner gave it.
        const sessionId = sessionIdOf(context.user)
        if (!sessionId || name === context.user.clientName) return
        await identifySession(sessionId, name)
      },
    ),
  },
}
