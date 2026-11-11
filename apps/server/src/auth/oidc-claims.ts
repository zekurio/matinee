import {
  AccessOverride,
  BitrateLimit,
  StreamLimit,
  type OidcSettings,
  UserRole,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { library } from "@matinee/db"
import * as client from "openid-client"

import { db } from "../db"
import { log } from "../log"
import { PictureUrl } from "./avatars"
import type { OidcIdentity } from "./oidc-accounts"

type Claims = Readonly<Record<string, client.JsonValue | undefined>>
const ClaimString = t.string().trim().min(1)
const ClaimList = t.array(t.unknown())
const ClaimObject = t.record(t.string(), t.unknown())
const RoleName = t.string().transform((value) => value.trim().toLowerCase())

const PolicyClaim = t
  .object({
    libraries: t
      .union([t.literal("all"), t.array(t.string()).max(500)])
      .optional(),
    maxBitrate: BitrateLimit.optional(),
    transcode: t.boolean().optional(),
    downloads: t.boolean().optional(),
    maxStreams: StreamLimit.optional(),
  })
  .strict()

/** An exact claim name wins over a dotted path through nested claims. */
export function claimValue(claims: Claims, key: string) {
  if (Object.hasOwn(claims, key)) return claims[key]
  let value: unknown = claims
  for (const part of key.split(".")) {
    const object = ClaimObject.safeParse(value)
    if (!object.success || !Object.hasOwn(object.data, part)) return undefined
    value = object.data[part]
  }
  return value
}

function claimString(claims: Claims, key: string): string | undefined {
  return ClaimString.safeParse(claims[key]).data
}

/** Admin wins when the provider names more than one role. */
export function claimRole(claims: Claims, key: string): UserRole | undefined {
  const value = claims[key]
  const roles = (ClaimList.safeParse(value).data ?? [value])
    .map((entry) => UserRole.safeParse(RoleName.safeParse(entry).data).data)
    .filter((role) => role !== undefined)
  return roles.includes("admin") ? "admin" : roles[0]
}

/** Missing claims after a failed userinfo read must not revoke access. */
export function claimGroups(
  claims: Claims,
  key: string,
  userInfoFailed: boolean,
): string[] | undefined {
  if (!key) return undefined
  const value = claimValue(claims, key)
  if (value === undefined && userInfoFailed) return undefined
  return [
    ...new Set(
      (ClaimList.safeParse(value).data ?? [value]).flatMap(
        (entry) => ClaimString.safeParse(entry).data ?? [],
      ),
    ),
  ]
}

/** Resolve the provider's library names once the rest of the policy validates. */
export async function claimAccess(
  claims: Claims,
  key: string,
  userInfoFailed: boolean,
): Promise<AccessOverride | null | undefined> {
  if (!key) return undefined
  let value = claimValue(claims, key)
  if (value === undefined) return userInfoFailed ? undefined : null
  const text = t.string().safeParse(value)
  if (text.success) {
    try {
      value = JSON.parse(text.data)
    } catch (cause) {
      log.warn(`Ignoring the OIDC ${key} claim: it isn't valid JSON`, cause)
      return undefined
    }
  }
  const parsed = PolicyClaim.safeParse(value)
  if (!parsed.success) {
    log.warn(
      `Ignoring the OIDC ${key} claim: the access policy is invalid`,
      parsed.error,
    )
    return undefined
  }
  const { libraries, ...limits } = parsed.data
  if (libraries === undefined) return AccessOverride.parse(limits)
  if (libraries === "all")
    return AccessOverride.parse({
      ...limits,
      libraries: { all: true, ids: [] },
    })
  const rows = await db
    .select({ id: library.id, name: library.name })
    .from(library)
  const ids = new Set<string>()
  for (const name of libraries) {
    const found =
      rows.find((row) => row.id.toLowerCase() === name.trim().toLowerCase()) ??
      rows.find((row) => row.name.toLowerCase() === name.trim().toLowerCase())
    if (found) ids.add(found.id)
    else log.warn(`The OIDC ${key} claim names an unknown library: ${name}`)
  }
  return AccessOverride.parse({
    ...limits,
    libraries: { all: false, ids: [...ids] },
  })
}

/** Build the same identity for an interactive sign-in and a token refresh. */
export async function readOidcIdentity(
  config: client.Configuration,
  settings: OidcSettings,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
  idClaims: Claims & { iss: string; sub: string },
  requireUsername = true,
): Promise<{ identity: OidcIdentity; claims: Claims }> {
  const usernameClaim = settings.usernameClaim || "preferred_username"
  const hasUsername = claimString(idClaims, usernameClaim) !== undefined
  let userInfo: client.UserInfoResponse | null = null
  let userInfoFailed = false
  if (
    !hasUsername ||
    !claimString(idClaims, "picture") ||
    claimRole(idClaims, settings.roleClaim) === undefined ||
    (settings.groupsClaim &&
      claimValue(idClaims, settings.groupsClaim) === undefined) ||
    (settings.policyClaim &&
      claimValue(idClaims, settings.policyClaim) === undefined)
  ) {
    // A refresh may carry no ID token. Without userinfo, missing claims say nothing.
    userInfoFailed = true
    if (tokens.access_token) {
      try {
        userInfo = await client.fetchUserInfo(
          config,
          tokens.access_token,
          idClaims.sub,
        )
        userInfoFailed = false
      } catch (cause) {
        if (requireUsername && !hasUsername) throw cause
        log.warn("Couldn't read the OIDC userinfo", cause)
      }
    }
  }
  const claims = { ...userInfo, ...idClaims }
  const picture = PictureUrl.safeParse(claims.picture).data
  return {
    claims,
    identity: {
      issuer: idClaims.iss,
      subject: idClaims.sub,
      label:
        claimString(claims, usernameClaim) ??
        claimString(claims, "preferred_username") ??
        null,
      name: claimString(claims, "name") ?? null,
      picture: picture ?? (userInfoFailed ? undefined : null),
      role: claimRole(claims, settings.roleClaim),
      groups: claimGroups(claims, settings.groupsClaim, userInfoFailed),
      access: await claimAccess(claims, settings.policyClaim, userInfoFailed),
      refreshToken: tokens.refresh_token,
    },
  }
}
