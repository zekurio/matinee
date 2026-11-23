import { t } from "./schema"

/**
 * What an account or an API token may do: `all`, or one permission per
 * resource and action, as Immich's API keys have it. Each procedure names
 * the one it takes as the second argument of `get`, `post`, and the rest
 * in `contract-routes.ts`, and a procedure that names none takes `all`.
 *
 * An account holds `BASE_PERMISSIONS` whatever its groups say, the ones
 * its capabilities grant, see `permissionsOf` in `access.ts`, and `all`
 * when it is an admin. Groups and accounts never list permissions; only
 * an API token does. It holds what its owner picked, and never widens the
 * account: a request made with one needs the permission from both. The
 * `admin` resources name what the same procedure does to other accounts.
 *
 * Sorted by resource. Add a permission where its resource sits, and to
 * `BASE_PERMISSIONS` when every account has it, or else to the capability
 * that grants it: `AREA_PERMISSIONS` or `permissionsOf` in `access.ts`.
 */
export const PERMISSIONS = [
  "all",

  /** The account's profile, picture, and playback and library preferences. */
  "account.update",

  /** Revoking another account's API tokens. */
  "adminApiToken.delete",

  /** Everyone's requests: the queue, and approving, declining, retrying. */
  "adminRequest.read",
  "adminRequest.approve",
  "adminRequest.decline",
  "adminRequest.retry",

  /** Signing another account out. */
  "adminSession.delete",

  /**
   * Accounts: the list, their groups and access, deleting. Making someone
   * an admin takes `all`.
   */
  "adminUser.read",
  "adminUser.update",
  "adminUser.delete",

  /**
   * The account's API tokens. The `apiTokens` capability grants `create`;
   * an account always sees, changes, and revokes the ones it has.
   */
  "apiToken.create",
  "apiToken.read",
  "apiToken.update",
  "apiToken.delete",
  "apiToken.rotate",

  /** Passkey and single sign-on settings. Changing them takes `all`. */
  "authSettings.read",

  "branding.read",
  "branding.update",

  /** The catalog and Discover, with what the account may ask for. */
  "catalog.read",

  "favorite.update",

  /** The server's folders, as the library form browses them. */
  "folder.read",

  /**
   * Connections that fetch requested titles, and their rules. The holder
   * sees every connection but no library its groups don't open: a folder
   * that lands in one shows as hidden, and a connection that sends to one
   * can be looked at and tested but not changed or deleted.
   */
  "fulfilment.create",
  "fulfilment.read",
  "fulfilment.update",
  "fulfilment.delete",

  /** Access groups. */
  "group.create",
  "group.read",
  "group.update",
  "group.delete",

  "invite.create",
  "invite.read",
  "invite.delete",

  /** Queues and scheduled tasks: the overview, and running and pausing them. */
  "job.read",
  "job.update",

  /** Libraries and their folders. `scan` also refreshes their metadata. */
  "library.create",
  "library.read",
  "library.update",
  "library.delete",
  "library.scan",

  /** Files: their details, playing them, downloading them. */
  "media.read",
  "media.play",
  "media.download",

  "networkSettings.read",
  "networkSettings.update",

  /**
   * The account's link to the single sign-on provider. Linking one adds a
   * way to sign in, so an API token needs `all` for it, as for
   * `passkey.create` and for approving a device with `session.create`.
   */
  "oidcAccount.create",
  "oidcAccount.read",
  "oidcAccount.delete",

  /** Watch parties: `update` covers joining, leaving, and steering one. */
  "party.create",
  "party.read",
  "party.update",

  "passkey.create",
  "passkey.read",
  "passkey.update",
  "passkey.delete",

  /** Other people's profiles, and their pictures. */
  "profile.read",

  "recommendation.read",
  "recommendation.update",

  /**
   * The account's own requests. With `autoApprove` what it asks for is
   * added at once, and without it an ask waits for someone to approve it.
   */
  "request.create",
  "request.read",
  "request.delete",
  "request.autoApprove",

  "serverSetup.update",

  /** Everyone's watch time, and who is watching now. */
  "serverStats.read",

  /**
   * The account's sessions. `create` reads a device's sign-in request;
   * approving it takes `all` from an API token.
   */
  "session.create",
  "session.read",
  "session.update",
  "session.delete",

  /** The account's own statistics, and the leaderboard. */
  "stats.read",

  /**
   * Titles, people, search, and artwork. `update` refreshes metadata,
   * fixes a match, and sets images, with the matches and images to pick
   * from.
   */
  "title.read",
  "title.update",

  "transcodingSettings.read",
  "transcodingSettings.update",

  "trickplaySettings.read",
  "trickplaySettings.update",

  /** Progress, watched marks, continue watching, and next up. */
  "watchState.read",
  "watchState.update",
] as const
export const Permission = t.enum(PERMISSIONS)
export type Permission = t.infer<typeof Permission>

/**
 * What every account may do, whatever groups it is in: use the app as a
 * viewer and look after its own account. Which libraries it sees is its
 * groups' to say, not a permission's.
 */
export const BASE_PERMISSIONS: readonly Permission[] = [
  "account.update",
  "apiToken.read",
  "apiToken.update",
  "apiToken.delete",
  "apiToken.rotate",
  "catalog.read",
  "favorite.update",
  "library.read",
  "media.read",
  "media.play",
  "oidcAccount.create",
  "oidcAccount.read",
  "oidcAccount.delete",
  "party.create",
  "party.read",
  "party.update",
  "passkey.create",
  "passkey.read",
  "passkey.update",
  "passkey.delete",
  "profile.read",
  "recommendation.read",
  "recommendation.update",
  "request.read",
  "request.delete",
  "session.create",
  "session.read",
  "session.update",
  "session.delete",
  "stats.read",
  "title.read",
  "watchState.read",
  "watchState.update",
]

/**
 * Whether an account that was granted `granted` holds `permission`. The
 * list needn't name what every account has.
 */
export function holdsPermission(
  granted: readonly Permission[],
  permission: Permission,
): boolean {
  return (
    granted.includes("all") ||
    BASE_PERMISSIONS.includes(permission) ||
    granted.includes(permission)
  )
}

/**
 * Whether a list that names everything it covers, as an API token's and
 * `User.permissions` do, covers all of `requested`.
 */
export function grantsPermissions(
  held: readonly Permission[],
  requested: readonly Permission[],
): boolean {
  return (
    held.includes("all") ||
    requested.every((permission) => held.includes(permission))
  )
}

type ResourceOf<Name> = Name extends `${infer Resource}.${string}`
  ? Resource
  : never
/** What a permission is about, the part before its dot, like `library`. */
export type PermissionResource = ResourceOf<Permission>

export function permissionResource(
  permission: Exclude<Permission, "all">,
): PermissionResource {
  // SAFETY: every permission but `all` is `resource.action`, so what
  // stands before the dot is one of the resources.
  return permission.slice(0, permission.indexOf(".")) as PermissionResource
}

/** `permissions` without repeats, in the order of `PERMISSIONS`. */
export function sortPermissions(
  permissions: readonly Permission[],
): Permission[] {
  return PERMISSIONS.filter((permission) => permissions.includes(permission))
}

/**
 * Everything an account that was granted `granted` holds, as
 * `User.permissions` names it: `all` alone when it has that, since `all`
 * covers the rest, and else `BASE_PERMISSIONS` with what it was granted.
 * A client can't import `BASE_PERMISSIONS` from an OpenAPI document, so
 * the list it gets names them.
 */
export function heldPermissions(granted: readonly Permission[]): Permission[] {
  if (granted.includes("all")) return ["all"]
  return sortPermissions([...BASE_PERMISSIONS, ...granted])
}

/** What a contract procedure's `meta` holds. */
export const ProcedureMeta = t.object({
  /**
   * The permission the caller needs, the account and its API token both.
   * Left out, it needs `all`. False lets anyone signed in call it.
   */
  permission: t.union([Permission, t.literal(false)]).optional(),
})
export type ProcedureMeta = t.infer<typeof ProcedureMeta>
