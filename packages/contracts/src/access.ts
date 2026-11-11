import { t } from "./schema"
import { PLAYBACK_QUALITIES } from "./transcoding"

/*
 * What an account may open, and how the server streams to it. Admins set
 * it on groups. An account is in any number of them, and gets the most
 * generous of what they allow: every library any of them opens, and the
 * loosest of their limits. A group that opens no library has no say in
 * the limits while another of the account's groups opens one, so the
 * built-in group, emptied to make access opt-in, doesn't lift the limits
 * other groups set. What's set on the account itself wins over its
 * groups. Admins have no limits.
 *
 * Group membership comes from an admin, from an invite link, or from the
 * OIDC provider: a group that names a provider group holds whoever the
 * provider's groups claim puts in it.
 */

/**
 * The smallest bit rate limit, the lowest quality's rate, so an encode
 * that fits under a limit always exists.
 */
export const MIN_BITRATE_LIMIT = Math.min(
  ...PLAYBACK_QUALITIES.map((preset) => preset.bitrate),
)

/** The limits a form offers, largest first: the rates of the qualities. */
export const BITRATE_LIMITS: readonly number[] = [
  ...new Set(PLAYBACK_QUALITIES.map((preset) => preset.bitrate)),
].sort((a, b) => b - a)

/**
 * The most a stream sends, in bits per second. A file over it plays as an
 * encode under it. Null for no limit. Downloads aren't limited.
 */
export const BitrateLimit = t
  .number()
  .int()
  .min(MIN_BITRATE_LIMIT, "Pick a limit of at least 1 Mb/s.")
  .max(1_000_000_000)
  .nullable()

/** How many devices play at once. Null for no limit. */
export const StreamLimit = t
  .number()
  .int()
  .min(1, "Allow at least one stream.")
  .max(100)
  .nullable()

/** `all` also covers libraries added later, and then `ids` means nothing. */
export const LibraryAccess = t.object({
  all: t.boolean(),
  ids: t.array(t.uuid()).max(500),
})
export type LibraryAccess = t.infer<typeof LibraryAccess>

export const AccessPolicy = t.object({
  libraries: LibraryAccess,
  maxBitrate: BitrateLimit,
  /**
   * The server may encode video for the account. Off, a file plays only
   * as it is or with its video copied, and one that would need an encode
   * doesn't play. Audio is still converted.
   */
  transcode: t.boolean(),
  /** The account may download, files as they are and versions made for a device. */
  downloads: t.boolean(),
  maxStreams: StreamLimit,
})
export type AccessPolicy = t.infer<typeof AccessPolicy>

/**
 * What's set on one account over its groups. A field left out follows the
 * groups.
 */
export const AccessOverride = AccessPolicy.partial()
export type AccessOverride = t.infer<typeof AccessOverride>

/** Who put an account in a group, or set its override. */
export const ACCESS_SOURCES = ["manual", "provider"] as const
/**
 * `manual`: an admin, or the invite link the account was made with.
 * `provider`: the OIDC provider's claims at the last sign-in, which the
 * next one replaces.
 */
export const AccessSource = t.enum(ACCESS_SOURCES)
export type AccessSource = t.infer<typeof AccessSource>

export const GroupName = t
  .string()
  .trim()
  .min(1, "Give the group a name.")
  .max(64, "Use at most 64 characters.")

/** A group's name at the OIDC provider, as its groups claim holds it. */
export const ProviderGroupName = t
  .string()
  .trim()
  .max(256, "Use at most 256 characters.")

export const AccessGroup = t.object({
  id: t.uuid(),
  name: t.string(),
  /**
   * The built-in group that every account is in. It can't be deleted,
   * renamed, or follow a provider group. A client shows its own word for
   * it instead of `name`.
   */
  everyone: t.boolean(),
  /**
   * The provider group whose members are in this group, kept in step at
   * every sign-in. Null for a group only admins and invites fill.
   */
  providerGroup: t.string().nullable(),
  policy: AccessPolicy,
  /** How many accounts are in it. Every account, for `everyone`. */
  members: t.number().int(),
  createdAt: t.date(),
})
export type AccessGroup = t.infer<typeof AccessGroup>

export const AccessGroupInput = t.object({
  name: GroupName,
  /** Empty or null for none. */
  providerGroup: ProviderGroupName.nullable(),
  policy: AccessPolicy,
})
export type AccessGroupInput = t.infer<typeof AccessGroupInput>

/** A group an account is in, besides the built-in one. */
export const UserGroup = t.object({
  id: t.uuid(),
  name: t.string(),
  source: AccessSource,
})
export type UserGroup = t.infer<typeof UserGroup>

/** An account's access, as an admin sees and sets it. */
export const UserAccess = t.object({
  groups: t.array(UserGroup),
  override: AccessOverride,
  /**
   * `provider` when the OIDC policy claim set the override, which it does
   * again at the account's next sign-in.
   */
  overrideSource: AccessSource,
  /**
   * The most generous of what the account's groups allow, which a field
   * the override leaves out follows. An admin's is everything.
   */
  fromGroups: AccessPolicy,
  /** What applies: `fromGroups`, then the override. */
  effective: AccessPolicy,
})
export type UserAccess = t.infer<typeof UserAccess>

export const UserAccessInput = t.object({
  id: t.uuid(),
  /**
   * The groups an admin puts the account in. Groups it's in through the
   * provider stay as they are.
   */
  groupIds: t.array(t.uuid()).max(100),
  override: AccessOverride,
})
export type UserAccessInput = t.infer<typeof UserAccessInput>

/**
 * A group name the provider sent for an account at its last sign-in, to
 * offer when a group picks its provider group.
 */
export const ProviderGroup = t.object({
  name: t.string(),
  /** Linked accounts the provider has in it. */
  accounts: t.number().int(),
})
export type ProviderGroup = t.infer<typeof ProviderGroup>
