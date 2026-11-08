import { MAX_USER_THEMES } from "@matinee/contracts"
import { oidcAccount, passkey, user, type UserRow } from "@matinee/db"
import { and, desc, eq } from "drizzle-orm"

import {
  AvatarError,
  followProviderAvatar,
  removeAvatar,
  uploadAvatar,
} from "../auth/avatars"
import { passkeysEnabled } from "../auth/passkey-settings"
import {
  beginRegister,
  finishRegistration,
  PasskeyError,
  publicPasskey,
  storePasskey,
} from "../auth/passkeys"
import {
  deleteSession,
  deleteUserSessions,
  listSessions,
  publicUser,
} from "../auth/session"
import {
  deleteUserTheme,
  listUserThemes,
  saveUserTheme,
  updateThemePreferences,
} from "../auth/user-themes"
import { signInMethods } from "../auth/users"
import { db } from "../db"
import { authed, badRequest, conflict, notFound, requirePasskeys } from "./base"

const LAST_METHOD =
  "Add another passkey or link an account before removing your last way to sign in."
const LAST_LINK =
  "Passkeys are off, so single sign-on is your only way to sign in. Keep it linked."

/** The updated user, with avatar failures turned into a message to act on. */
async function avatarChange(
  change: () => Promise<UserRow | null>,
): Promise<ReturnType<typeof publicUser>> {
  const row = await change().catch((cause: unknown) => {
    if (cause instanceof AvatarError) throw badRequest(cause.message)
    throw cause
  })
  if (!row) throw notFound("Account not found.")
  return publicUser(row)
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
        return publicUser(row)
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
        return publicUser(row)
      },
    ),
  },

  theme: {
    setPreferences: authed.account.theme.setPreferences.handler(
      async ({ context, input }) => {
        const row = await updateThemePreferences(context.user.id, input)
        if (!row) throw notFound("Account not found.")
        return publicUser(row)
      },
    ),

    list: authed.account.theme.list.handler(({ context }) =>
      listUserThemes(context.user.id),
    ),

    save: authed.account.theme.save.handler(async ({ context, input }) => {
      const saved = await saveUserTheme(context.user.id, input)
      if (!saved) {
        throw conflict(`You can save up to ${MAX_USER_THEMES} themes.`)
      }
      return saved
    }),

    remove: authed.account.theme.remove.handler(async ({ context, input }) => {
      await deleteUserTheme(context.user.id, input.id)
    }),
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
      return {
        label: row.label,
        hasPicture: row.picture !== null,
        createdAt: row.createdAt,
      }
    }),

    unlink: authed.account.oidc.unlink.handler(async ({ context }) => {
      // A link single sign-on doesn't use signs nobody in.
      const methods = await signInMethods(context.user.id)
      if (methods.linked > 0 && methods.passkeys + methods.linked <= 1) {
        throw badRequest((await passkeysEnabled()) ? LAST_METHOD : LAST_LINK)
      }
      const deleted = await db
        .delete(oidcAccount)
        .where(eq(oidcAccount.userId, context.user.id))
        .returning({ id: oidcAccount.id })
      if (deleted.length === 0) throw notFound("No account is linked.")
    }),
  },

  sessions: {
    list: authed.account.sessions.list.handler(({ context }) =>
      listSessions(context.user.id, context.user.sessionId),
    ),

    revoke: authed.account.sessions.revoke.handler(
      async ({ context, input }) => {
        if (input.id === context.user.sessionId) {
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
          context.user.sessionId,
        ),
      }),
    ),
  },
}
