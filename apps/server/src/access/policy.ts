import {
  ACCESS_LEVELS,
  type AccessOverride,
  type AccessPolicy,
  type ManagedAccess,
  type ManagedArea,
  MANAGES_EVERYTHING,
  MANAGES_NOTHING,
  MIN_BITRATE_LIMIT,
  type Permission,
  permissionsOf,
  REQUEST_MODES,
  type RequestMode,
} from "@matinee/contracts"

/*
 * How policies combine. An account gets the most generous of what its
 * groups allow, then what's set on the account itself. Nothing here reads
 * the database.
 */

/** What an admin has. Its permissions are `all`, see `toAccess`. */
export const EVERYTHING: AccessPolicy = {
  libraries: { all: true, ids: [] },
  maxBitrate: null,
  transcode: true,
  maxStreams: null,
  downloads: true,
  requests: "add",
  requestLimit: null,
  apiTokens: true,
  manages: MANAGES_EVERYTHING,
}

/**
 * What no group at all leaves: no library, so the limits never come up.
 * They hold the tightest values a policy can.
 */
const NOTHING: AccessPolicy = {
  libraries: { all: false, ids: [] },
  maxBitrate: MIN_BITRATE_LIMIT,
  transcode: false,
  maxStreams: 1,
  downloads: false,
  requests: "off",
  requestLimit: null,
  apiTokens: false,
  manages: MANAGES_NOTHING,
}

/** The larger of two limits, where null is no limit. */
function looser(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.max(a, b)
}

/** The later of two values in `order`, which lists them least first. */
function higher<Value extends string>(
  order: readonly string[],
  a: Value,
  b: Value,
): Value {
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

type Limits = Pick<AccessPolicy, "maxBitrate" | "transcode" | "maxStreams">

function looserLimits(a: Limits, b: Limits): Limits {
  return {
    maxBitrate: looser(a.maxBitrate, b.maxBitrate),
    transcode: a.transcode || b.transcode,
    maxStreams: looser(a.maxStreams, b.maxStreams),
  }
}

function opensSomething(policy: AccessPolicy): boolean {
  return policy.libraries.all || policy.libraries.ids.length > 0
}

/** The highest level of each area any of `policies` gives. */
function mostManaged(policies: readonly AccessPolicy[]): ManagedAccess {
  const highest = <Area extends ManagedArea>(area: Area) =>
    policies.reduce<ManagedAccess[Area]>(
      (best, policy) => higher(ACCESS_LEVELS, best, policy.manages[area]),
      "none",
    )
  return {
    requests: highest("requests"),
    connections: highest("connections"),
    libraries: highest("libraries"),
    metadata: highest("metadata"),
    users: highest("users"),
    server: highest("server"),
  }
}

/** Every area at `none` or `manage`, as `level` says. */
function eachArea(
  level: (area: ManagedArea) => "none" | "manage",
): ManagedAccess {
  return {
    requests: level("requests"),
    connections: level("connections"),
    libraries: level("libraries"),
    metadata: level("metadata"),
    users: level("users"),
    server: level("server"),
  }
}

/**
 * The most generous of `policies`: every library any of them opens, the
 * highest of their limits, and the highest level of every capability any
 * of them gives.
 *
 * A group that opens no library has no say in the streaming limits while
 * another one opens something. Otherwise the built-in group, once its
 * libraries are taken away to make access opt-in, would still lift every
 * limit the other groups set, since it starts with none. The other
 * capabilities add up across every group, whether it opens a library or
 * not, so a group can grant asking for titles, or a part of running the
 * server, and nothing else.
 */
export function mostGenerous(policies: readonly AccessPolicy[]): AccessPolicy {
  if (policies.length === 0) return NOTHING
  const all = policies.some((policy) => policy.libraries.all)
  const opening = policies.filter(opensSomething)
  const limits = (opening.length > 0 ? opening : policies)
    .map((policy): Limits => ({
      maxBitrate: policy.maxBitrate,
      transcode: policy.transcode,
      maxStreams: policy.maxStreams,
    }))
    .reduce(looserLimits)
  return {
    libraries: {
      all,
      ids: all
        ? []
        : [...new Set(policies.flatMap((policy) => policy.libraries.ids))],
    },
    ...limits,
    downloads: policies.some((policy) => policy.downloads),
    requests: policies.reduce<RequestMode>(
      (best, policy) => higher(REQUEST_MODES, best, policy.requests),
      "off",
    ),
    requestLimit: requestQuota(policies),
    apiTokens: policies.some((policy) => policy.apiTokens),
    manages: mostManaged(policies),
  }
}

/**
 * The loosest quota of the policies that let the account ask at all.
 * Compares title rates; equal rates prefer the shorter rolling window.
 */
function requestQuota(
  policies: readonly AccessPolicy[],
): AccessPolicy["requestLimit"] {
  const granting = policies.filter((p) => p.requests !== "off")
  if (granting.some((p) => p.requestLimit === null)) return null
  return granting.reduce<AccessPolicy["requestLimit"]>((best, p) => {
    const next = p.requestLimit
    if (!next) return best
    if (
      !best ||
      next.titles / next.days > best.titles / best.days ||
      (next.titles / next.days === best.titles / best.days &&
        next.days < best.days)
    )
      return next
    return best
  }, null)
}

/** `policy` with the fields `override` sets. */
export function withOverride(
  policy: AccessPolicy,
  override: AccessOverride,
): AccessPolicy {
  return {
    libraries: override.libraries ?? policy.libraries,
    maxBitrate:
      override.maxBitrate === undefined
        ? policy.maxBitrate
        : override.maxBitrate,
    transcode: override.transcode ?? policy.transcode,
    maxStreams:
      override.maxStreams === undefined
        ? policy.maxStreams
        : override.maxStreams,
    downloads: override.downloads ?? policy.downloads,
    requests: override.requests ?? policy.requests,
    requestLimit:
      override.requestLimit === undefined
        ? policy.requestLimit
        : override.requestLimit,
    apiTokens: override.apiTokens ?? policy.apiTokens,
    manages: { ...policy.manages, ...override.manages },
  }
}

/**
 * The permissions an override decides, whatever the groups say: those
 * its set capabilities grant, and those they hold back. Whoever changes
 * an override needs every permission that moves between the two, see
 * `requireOwn`.
 */
export function overridePermissions(override: AccessOverride) {
  // What the capabilities the override sets grant, the others granting nothing.
  const allow = permissionsOf({
    downloads: override.downloads ?? false,
    requests: override.requests ?? "off",
    apiTokens: override.apiTokens ?? false,
    manages: { ...MANAGES_NOTHING, ...override.manages },
  })
  // Each capability the override sets, at its most.
  const reach = permissionsOf({
    downloads: override.downloads !== undefined,
    requests: override.requests === undefined ? "off" : "add",
    apiTokens: override.apiTokens !== undefined,
    manages: eachArea((area) =>
      override.manages?.[area] === undefined ? "none" : "manage",
    ),
  })
  return {
    allow,
    deny: reach.filter((permission) => !allow.includes(permission)),
  }
}

/**
 * A policy as request code asks it. `libraries` is null for every
 * library, so a check for one is a set lookup or nothing at all.
 */
export type Access = {
  libraries: ReadonlySet<string> | null
  maxBitrate: number | null
  transcode: boolean
  requestLimit: AccessPolicy["requestLimit"]
  maxStreams: number | null
  /**
   * What the account was granted beyond what every account may; `all`
   * for an admin. Ask `can` in viewer.ts, which also holds an API token
   * to its own permissions.
   */
  permissions: readonly Permission[]
}

/** `policy` for request code. An admin's permissions are `all`. */
export function toAccess(policy: AccessPolicy, admin = false): Access {
  return {
    permissions: admin ? ["all"] : permissionsOf(policy),
    requestLimit: policy.requestLimit,
    libraries: policy.libraries.all ? null : new Set(policy.libraries.ids),
    maxBitrate: policy.maxBitrate,
    transcode: policy.transcode,
    maxStreams: policy.maxStreams,
  }
}
