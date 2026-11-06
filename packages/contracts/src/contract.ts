import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  AdminAuthSettings,
  AdminUser,
  CreateUserInput,
  IssuedLink,
  OidcSettingsInput,
} from "./admin"
import {
  AuthConfig,
  AuthenticationResponse,
  DirectoryListing,
  IdInput,
  Invite,
  InviteToken,
  Library,
  LibraryInput,
  MediaItem,
  MetadataMatch,
  MetadataProvider,
  OidcAccount,
  ShelfEntry,
  Subtitles,
  Passkey,
  PasskeyCreation,
  PasskeyName,
  PasskeyRequest,
  RegistrationResponse,
  Title,
  TitleSummary,
  User,
  Username,
  UserRole,
} from "./schemas"

/**
 * The RPC contract between the server and every client. The server
 * implements it with `implement(contract)`; clients get typed callers from
 * it. Byte streams (video) and browser redirects (OIDC) are plain HTTP
 * routes, see `paths.ts`.
 */
export const contract = {
  auth: {
    config: oc.output(AuthConfig),
    session: oc.output(z.object({ user: User.nullable() })),
    signOut: oc.output(z.void()),
    /** Prove the setup token once; the server remembers it in a cookie. */
    unlockSetup: oc
      .input(z.object({ token: z.string().min(1) }))
      .output(z.void()),
    passkey: {
      signInOptions: oc.output(PasskeyRequest),
      signIn: oc
        .input(
          z.object({ challengeId: z.uuid(), response: AuthenticationResponse }),
        )
        .output(User),
      signUpOptions: oc
        .input(z.object({ username: Username }))
        .output(PasskeyCreation),
      signUp: oc
        .input(
          z.object({ challengeId: z.uuid(), response: RegistrationResponse }),
        )
        .output(User),
    },
    /**
     * Invite and recovery links an admin made. The token from the link
     * stands in for a session: it adds a passkey to its account and signs
     * in, once. The OIDC route takes it too, see `OIDC_INVITE_PATH`.
     */
    invite: {
      get: oc.input(z.object({ token: InviteToken })).output(Invite),
      registerOptions: oc
        .input(z.object({ token: InviteToken }))
        .output(PasskeyCreation),
      register: oc
        .input(
          z.object({
            token: InviteToken,
            challengeId: z.uuid(),
            response: RegistrationResponse,
          }),
        )
        .output(User),
    },
  },
  account: {
    passkeys: {
      list: oc.output(z.array(Passkey)),
      registerOptions: oc.output(PasskeyCreation),
      register: oc
        .input(
          z.object({
            challengeId: z.uuid(),
            response: RegistrationResponse,
            name: PasskeyName.optional(),
          }),
        )
        .output(Passkey),
      rename: oc
        .input(z.object({ id: z.uuid(), name: PasskeyName }))
        .output(Passkey),
      remove: oc.input(IdInput).output(z.void()),
    },
    oidc: {
      list: oc.output(z.array(OidcAccount)),
      unlink: oc.input(IdInput).output(z.void()),
    },
  },
  libraries: {
    list: oc.output(z.array(Library)),
    get: oc.input(IdInput).output(Library),
    create: oc.input(LibraryInput).output(Library),
    update: oc.input(LibraryInput.extend({ id: z.uuid() })).output(Library),
    remove: oc.input(IdInput).output(z.void()),
    scan: oc.input(IdInput).output(z.void()),
    /** Fetch metadata again for every title, matched or not. */
    refreshMetadata: oc.input(IdInput).output(z.void()),
  },
  metadata: {
    /** Every provider the server knows, configured or not. */
    providers: oc.output(z.array(MetadataProvider)),
  },
  titles: {
    /** The movies, shows, or folders in a library. */
    list: oc
      .input(
        z.object({
          libraryId: z.uuid(),
          query: z.string().trim().max(200).optional(),
          sort: z.enum(["name", "recent", "year"]).default("name"),
          limit: z.number().int().min(1).max(200).default(60),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(
        z.object({ items: z.array(TitleSummary), total: z.number().int() }),
      ),
    get: oc.input(IdInput).output(Title),
    /**
     * A title's files in episode order. `season` narrows to one season;
     * null picks the files without a season number.
     */
    items: oc
      .input(
        z.object({
          id: z.uuid(),
          season: z.number().int().min(0).nullable().optional(),
        }),
      )
      .output(z.array(MediaItem)),
    /** Search the library's provider, to fix a wrong or missing match. */
    findMatches: oc
      .input(
        z.object({
          id: z.uuid(),
          query: z
            .string()
            .trim()
            .min(1, "Enter a name to search for.")
            .max(200),
          year: z.number().int().min(1870).max(2200).optional(),
        }),
      )
      .output(z.array(MetadataMatch)),
    /** Match the title to a provider result and fetch its metadata. */
    identify: oc
      .input(z.object({ id: z.uuid(), providerId: z.string().min(1).max(64) }))
      .output(Title),
    /** Fetch the title's metadata again now. */
    refresh: oc.input(IdInput).output(Title),
  },
  media: {
    list: oc
      .input(
        z.object({
          libraryId: z.uuid(),
          query: z.string().trim().max(200).optional(),
          /** Only files under this folder of the library, such as a show. */
          folder: z.string().trim().min(1).max(500).optional(),
          /**
           * `recent` puts the folders with the newest files first, and keeps
           * each folder's files in file-name order.
           */
          sort: z.enum(["title", "recent"]).default("title"),
          limit: z.number().int().min(1).max(500).default(100),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(z.object({ items: z.array(MediaItem), total: z.number().int() })),
    get: oc.input(IdInput).output(MediaItem),
    /**
     * A file's subtitle tracks: files beside it and text streams inside it.
     * A file the background probe hasn't reached yet is probed first, so
     * that call can take a moment.
     */
    subtitles: oc.input(IdInput).output(Subtitles),
    /**
     * The newest titles in a library, with how many files each has and
     * when it last grew.
     */
    shelf: oc
      .input(
        z.object({
          libraryId: z.uuid(),
          limit: z.number().int().min(1).max(24).default(8),
        }),
      )
      .output(z.array(ShelfEntry)),
  },
  playback: {
    /**
     * Players call this every few seconds and when playback pauses or ends.
     * Positions near the end mark the file watched.
     */
    report: oc
      .input(
        z.object({
          itemId: z.uuid(),
          positionSeconds: z.number().min(0),
          durationSeconds: z.number().positive().optional(),
        }),
      )
      .output(z.void()),
    /** Mark a file watched or unwatched by hand. */
    setWatched: oc
      .input(z.object({ itemId: z.uuid(), watched: z.boolean() }))
      .output(z.void()),
    /**
     * Mark every file of a title watched or unwatched. `season` narrows to
     * one season as in `titles.items`; null picks the files without one.
     */
    setTitleWatched: oc
      .input(
        z.object({
          titleId: z.uuid(),
          season: z.number().int().min(0).nullable().optional(),
          watched: z.boolean(),
        }),
      )
      .output(z.void()),
  },
  home: {
    /** Files the user started and didn't finish, most recent first. */
    continueWatching: oc
      .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
      .output(z.array(MediaItem)),
    /** For each show the user is watching, the episode after the last one finished. */
    nextUp: oc
      .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
      .output(z.array(MediaItem)),
  },
  admin: {
    /** List directories on the server, for picking library folders. */
    browse: oc
      .input(z.object({ path: z.string().optional() }))
      .output(DirectoryListing),
    auth: {
      get: oc.output(AdminAuthSettings),
      /** Save the OIDC provider. Applies to the next sign-in, no restart. */
      updateOidc: oc.input(OidcSettingsInput).output(AdminAuthSettings),
    },
    /**
     * Accounts. The server keeps at least one admin who can sign in, so
     * demoting or deleting the last one fails.
     */
    users: {
      /** Everyone, oldest account first. */
      list: oc.output(z.array(AdminUser)),
      /** Create an account and the invite link its owner signs in with. */
      create: oc
        .input(CreateUserInput)
        .output(IssuedLink.extend({ user: AdminUser })),
      /** Takes effect on the user's next request. */
      setRole: oc
        .input(z.object({ id: z.uuid(), role: UserRole }))
        .output(AdminUser),
      /** Delete the account with its sessions, passkeys, and progress. */
      remove: oc.input(IdInput).output(z.void()),
      /** End the user's sessions. Yours keeps the one making the call. */
      signOut: oc.input(IdInput).output(z.object({ ended: z.number().int() })),
      links: {
        /**
         * A new sign-in link: an invite while the account has no way to
         * sign in, recovery after. Replaces the user's earlier links.
         */
        create: oc.input(z.object({ userId: z.uuid() })).output(IssuedLink),
        revoke: oc.input(IdInput).output(z.void()),
      },
    },
  },
}

export type Contract = typeof contract
