import { Permission } from "./permissions"
import { LibraryPreferences, PlaybackPreferences } from "./preferences"
import { t } from "./schema"

export const USER_ROLES = ["admin", "user"] as const
export const UserRole = t.enum(USER_ROLES)
export type UserRole = t.infer<typeof UserRole>

/**
 * Where a user's picture comes from: `provider` follows the `picture` claim
 * of their linked OIDC account at each sign-in, `upload` is one they chose,
 * and `none` keeps the initial even when the provider sends a picture.
 */
export const AVATAR_SOURCES = ["provider", "upload", "none"] as const
export const AvatarSource = t.enum(AVATAR_SOURCES)
export type AvatarSource = t.infer<typeof AvatarSource>

/**
 * Where to load a user's picture; null shows the initial instead. A path,
 * as `avatarPath()` gives, is an upload this server keeps, and takes the
 * session like the other routes in paths.ts. A full URL is the sign-in
 * provider's own picture: load it as it is, without the session.
 */
export const AvatarUrl = t.string().nullable()

/**
 * What a user's profile shows to everyone else on the server. The owner
 * always sees all of it. Both start off.
 */
export const ProfileSharing = t.object({
  /** The titles they marked as favorites. */
  favorites: t.boolean(),
  /** Watch time, what they watched most, and what they watched last. */
  stats: t.boolean(),
})
export type ProfileSharing = t.infer<typeof ProfileSharing>

export const User = t.object({
  id: t.uuid(),
  username: t.string(),
  displayName: t.string().nullable(),
  role: UserRole,
  /**
   * Everything the account holds, from `heldPermissions`: `all` alone for
   * an admin, else `BASE_PERMISSIONS` with what its groups and its
   * override leave. Ask `grantsPermissions`, since `all` covers the rest.
   */
  permissions: t.array(Permission),
  avatarUrl: AvatarUrl,
  avatarSource: AvatarSource,
  /**
   * The audio and subtitle choices this account syncs to its devices; null
   * before the first change, which plays as `DEFAULT_PLAYBACK_PREFERENCES`.
   */
  playback: PlaybackPreferences.nullable(),
  /** How shows list for this account, on every device. */
  library: LibraryPreferences,
  sharing: ProfileSharing,
})
export type User = t.infer<typeof User>

/** A user as other people on the server see them. */
export const ProfileUser = t.object({
  id: t.uuid(),
  username: t.string(),
  displayName: t.string().nullable(),
  role: UserRole,
  avatarUrl: AvatarUrl,
  /** When the account was created. */
  createdAt: t.date(),
})
export type ProfileUser = t.infer<typeof ProfileUser>

export const Username = t
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(32, "Use at most 32 characters.")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "Use letters, numbers, dots, dashes, and underscores.",
  )

/** An empty name clears it, so the username shows instead. */
export const DisplayName = t
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** The server crops it to a square and re-encodes it, dropping metadata. */
export const AvatarUpload = t
  .file()
  .min(1, "That file is empty.")
  .max(MAX_AVATAR_BYTES, "Pick an image under 10 MB.")
  .mime([...AVATAR_TYPES], "Pick a JPEG, PNG, or WebP image.")
