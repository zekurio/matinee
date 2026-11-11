import {
  type AccessOverride,
  type AccessPolicy,
  MIN_BITRATE_LIMIT,
} from "@matinee/contracts"

/*
 * How policies combine. An account gets the most generous of what its
 * groups allow, then what's set on the account itself. Nothing here reads
 * the database.
 */

/** What an admin has. */
export const EVERYTHING: AccessPolicy = {
  libraries: { all: true, ids: [] },
  maxBitrate: null,
  transcode: true,
  downloads: true,
  maxStreams: null,
}

/**
 * What no group at all leaves: no library, so the limits never come up.
 * They hold the tightest values a policy can.
 */
const NOTHING: AccessPolicy = {
  libraries: { all: false, ids: [] },
  maxBitrate: MIN_BITRATE_LIMIT,
  transcode: false,
  downloads: false,
  maxStreams: 1,
}

/** The larger of two limits, where null is no limit. */
function looser(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.max(a, b)
}

function moreGenerous(a: AccessPolicy, b: AccessPolicy): AccessPolicy {
  const all = a.libraries.all || b.libraries.all
  return {
    libraries: {
      all,
      ids: all ? [] : [...new Set([...a.libraries.ids, ...b.libraries.ids])],
    },
    maxBitrate: looser(a.maxBitrate, b.maxBitrate),
    transcode: a.transcode || b.transcode,
    downloads: a.downloads || b.downloads,
    maxStreams: looser(a.maxStreams, b.maxStreams),
  }
}

/**
 * The most generous of `policies`: every library any of them opens, the
 * highest of their limits, and what any of them allows.
 */
export function mostGenerous(policies: readonly AccessPolicy[]): AccessPolicy {
  const [first, ...rest] = policies
  return first ? rest.reduce(moreGenerous, first) : NOTHING
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
    downloads: override.downloads ?? policy.downloads,
    maxStreams:
      override.maxStreams === undefined
        ? policy.maxStreams
        : override.maxStreams,
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
  downloads: boolean
  maxStreams: number | null
}

export function toAccess(policy: AccessPolicy): Access {
  return {
    libraries: policy.libraries.all ? null : new Set(policy.libraries.ids),
    maxBitrate: policy.maxBitrate,
    transcode: policy.transcode,
    downloads: policy.downloads,
    maxStreams: policy.maxStreams,
  }
}
