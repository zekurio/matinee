import { RequestLimit } from "./catalog"
import { type Permission, sortPermissions } from "./permissions"
import { t } from "./schema"
import { PLAYBACK_QUALITIES } from "./transcoding"

/*
 * What an account may do, as one list of capabilities: which libraries
 * open, how the server streams to them, downloading, asking for titles,
 * making API tokens, and the parts of running the server it handles. Groups
 * hold it. An account is in any number of them, and gets the most
 * generous of what they allow: every library any of them opens, the
 * loosest of their limits, and the highest level any of them gives. A
 * group that opens no library has no say in the streaming limits while
 * another of the account's groups opens one, so the built-in group,
 * emptied to make access opt-in, doesn't lift the limits other groups
 * set. What's set on the account itself wins over its groups. Admins have
 * no limits and every permission.
 *
 * The server turns the capabilities into permissions, see
 * `permissionsOf`, and checks those. Only API tokens pick permissions one
 * by one.
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
  .min(MIN_BITRATE_LIMIT, "Pick a limit of at least 1 Mbps.")
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

/**
 * Asking for titles: not at all, with someone's approval, or added right
 * away. In this order, so a later one is more generous.
 */
export const REQUEST_MODES = ["off", "ask", "add"] as const
export const RequestMode = t.enum(REQUEST_MODES)
export type RequestMode = t.infer<typeof RequestMode>

/**
 * How far an account goes in a part of running the server: not at all,
 * looking, or changing it too. Each level holds the one before it.
 */
export const ACCESS_LEVELS = ["none", "view", "manage"] as const
export const AccessLevel = t.enum(ACCESS_LEVELS)
export type AccessLevel = t.infer<typeof AccessLevel>

/** A part of running the server there is nothing to look at in alone. */
const SwitchLevel = t.enum(["none", "manage"])

/** The parts of running the server a group can hand on. */
export const MANAGED_AREAS = [
  "requests",
  "connections",
  "libraries",
  "metadata",
  "users",
  "server",
] as const
export type ManagedArea = (typeof MANAGED_AREAS)[number]

/**
 * What each level of an area grants on top of the level before it. An
 * area without `view` is all or nothing. Every permission a group can
 * hand on is in exactly one place here, or in `permissionsOf` below.
 */
export const AREA_PERMISSIONS = {
  /** Everyone's requests: the queue, and approving, declining, retrying. */
  requests: {
    view: ["adminRequest.read"],
    manage: ["adminRequest.update"],
  },
  /** The connections that fetch requested titles, and their rules. */
  connections: {
    view: ["fulfilment.read"],
    manage: ["fulfilment.create", "fulfilment.update", "fulfilment.delete"],
  },
  /** Adding, changing, scanning, and deleting libraries. */
  libraries: {
    manage: [
      "folder.read",
      "library.create",
      "library.update",
      "library.delete",
      "library.scan",
    ],
  },
  /** Fixing matches, refreshing metadata, and setting images. */
  metadata: {
    manage: ["title.update"],
  },
  /** Accounts, their groups, invites, and everyone's activity. */
  users: {
    view: ["adminUser.read", "group.read", "invite.read", "serverStats.read"],
    manage: [
      "adminUser.update",
      "adminUser.delete",
      "adminSession.delete",
      "adminApiToken.delete",
      "group.create",
      "group.update",
      "group.delete",
      "invite.create",
      "invite.delete",
    ],
  },
  /** Server settings, and the queues and scheduled tasks. */
  server: {
    view: [
      "authSettings.read",
      "branding.read",
      "networkSettings.read",
      "transcodingSettings.read",
      "trickplaySettings.read",
      "job.read",
    ],
    manage: [
      "branding.update",
      "networkSettings.update",
      "transcodingSettings.update",
      "trickplaySettings.update",
      "job.update",
      "serverSetup.update",
    ],
  },
} as const satisfies {
  [Area in ManagedArea]: {
    view?: readonly Permission[]
    manage: readonly Permission[]
  }
}

/** The levels a form offers for `area`, least first. */
export function areaLevels(area: ManagedArea): readonly AccessLevel[] {
  return "view" in AREA_PERMISSIONS[area] ? ACCESS_LEVELS : ["none", "manage"]
}

/** How far the account goes in each part of running the server. */
export const ManagedAccess = t.object({
  requests: AccessLevel,
  connections: AccessLevel,
  libraries: SwitchLevel,
  metadata: SwitchLevel,
  users: AccessLevel,
  server: AccessLevel,
})
export type ManagedAccess = t.infer<typeof ManagedAccess>

/** No part of running the server. */
export const MANAGES_NOTHING: ManagedAccess = {
  requests: "none",
  connections: "none",
  libraries: "none",
  metadata: "none",
  users: "none",
  server: "none",
}

/** Every part of running the server, all the way. */
export const MANAGES_EVERYTHING: ManagedAccess = {
  requests: "manage",
  connections: "manage",
  libraries: "manage",
  metadata: "manage",
  users: "manage",
  server: "manage",
}

export const AccessPolicy = t.object({
  libraries: LibraryAccess,
  maxBitrate: BitrateLimit,
  /**
   * The server may encode video for the account. Off, a file plays only
   * as it is or with its video copied, and one that would need an encode
   * doesn't play. Audio is still converted.
   */
  transcode: t.boolean(),
  maxStreams: StreamLimit,
  /** Files as they are, and versions made for a device. */
  downloads: t.boolean(),
  requests: RequestMode,
  /** How much the account may request, where `requests` lets it. */
  requestLimit: RequestLimit,
  /** Making API tokens for its own scripts and services. */
  apiTokens: t.boolean(),
  manages: ManagedAccess,
})
export type AccessPolicy = t.infer<typeof AccessPolicy>

/** The fields of a policy that become permissions. */
export type Capabilities = Pick<
  AccessPolicy,
  "downloads" | "requests" | "apiTokens" | "manages"
>

/**
 * The permissions `capabilities` grant beyond `BASE_PERMISSIONS`, each
 * once and in the order of `PERMISSIONS`. An admin holds `all` instead.
 */
export function permissionsOf(capabilities: Capabilities): Permission[] {
  const granted: Permission[] = []
  if (capabilities.downloads) granted.push("media.download")
  if (capabilities.requests !== "off") granted.push("request.create")
  if (capabilities.requests === "add") granted.push("request.autoApprove")
  if (capabilities.apiTokens) granted.push("apiToken.create")
  for (const area of MANAGED_AREAS) {
    const level = capabilities.manages[area]
    const grants: {
      view?: readonly Permission[]
      manage: readonly Permission[]
    } = AREA_PERMISSIONS[area]
    if (level !== "none") granted.push(...(grants.view ?? []))
    if (level === "manage") granted.push(...grants.manage)
  }
  return sortPermissions(granted)
}

/**
 * What's set on one account over its groups. A field left out follows the
 * groups, and so does an area `manages` leaves out.
 */
export const AccessOverride = AccessPolicy.omit({ manages: true })
  .partial()
  .extend({ manages: ManagedAccess.partial().optional() })
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
