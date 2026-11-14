import type { PluginAuthProvider } from "@matinee/contracts"
import { t, type SchemaBoundaryInput } from "@matinee/contracts/schema"
import type { JsonValue } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import type { Context } from "hono"

import { log } from "../log"
import { runningAuth } from "../plugins"
import { SandboxError } from "../plugins/sandbox"
import {
  type AuthProvider,
  createPluginUser,
  type Identity,
  linkPluginIdentity,
  PluginAuthError,
  pluginIdentityUser,
  PLUGIN_SETUP_FIRST,
} from "./plugin-identities"
import { readSession, signIn } from "./session"
import { setupRequired } from "./setup"

const FAILURE = "That didn't work. Check what you entered."
const GENERIC_FAILURE = "Sign-in failed. Try again later."
const WAIT = "Too many sign-in attempts. Wait a few minutes, then try again."
const Controls = /[\p{Cc}\p{Cf}]/u
const CleanText = t
  .string()
  .max(256)
  .transform((value) => value.replace(/[\p{Cc}\p{Cf}]/gu, ""))
export const PluginIdentityResult = t.object({
  subject: t
    .string()
    .trim()
    .min(1)
    .max(256)
    .refine((value) => !Controls.test(value)),
  username: CleanText.nullable().optional(),
  name: CleanText.nullable().optional(),
})

const JsonScalar = t.union([t.string(), t.number(), t.boolean()]).nullable()
const JsonArray = t.array(t.unknown())
const JsonObject = t.record(t.string(), t.unknown())
function isJson(value: SchemaBoundaryInput, depth = 0): boolean {
  if (depth > 32) return false
  if (JsonScalar.safeParse(value).success) return true
  const array = JsonArray.safeParse(value)
  if (array.success) return array.data.every((item) => isJson(item, depth + 1))
  const object = JsonObject.safeParse(value)
  return (
    object.success &&
    Object.values(object.data).every((item) => isJson(item, depth + 1))
  )
}
export const PluginSession = t.custom<JsonValue>((value) => {
  if (!isJson(value)) return false
  const serialized = JSON.stringify(value)
  return serialized !== undefined && Buffer.byteLength(serialized) <= 4096
})
export const PluginStartResult = t.object({
  url: t.string().min(1).max(4096),
  session: PluginSession.optional(),
})

export function authProviderKey(provider: AuthProvider): string {
  return `${provider.pluginId}.${provider.contribution.id}`
}

/** Resolve on each request. Disabled, stopped, and unknown providers look alike. */
export function resolveAuthProvider(
  key: string,
  kind?: "credentials" | "redirect",
): AuthProvider {
  const provider = runningAuth().find((entry) => authProviderKey(entry) === key)
  if (!provider || (kind && provider.contribution.kind !== kind)) {
    throw new PluginAuthError("Sign-in provider not found.", "NOT_FOUND")
  }
  return provider
}

export function publicAuthProvider(provider: AuthProvider): PluginAuthProvider {
  const contribution = provider.contribution
  return {
    key: authProviderKey(provider),
    name: contribution.name,
    kind: contribution.kind,
    fields: contribution.kind === "credentials" ? contribution.fields : [],
    allowSignUp: provider.options.allowSignUp === true,
  }
}

export async function requirePluginSetup(): Promise<void> {
  if (await setupRequired()) throw new PluginAuthError(PLUGIN_SETUP_FIRST)
}

/** The plugin supplies an identity only. The host owns accounts and sessions. */
export async function acceptPluginIdentity(
  c: Context,
  provider: AuthProvider,
  identity: Identity,
  mode: "sign-in" | "link",
  userId: string | null = null,
) {
  await requirePluginSetup()
  if (mode === "link") {
    const current = await readSession(c)
    if (!current || current.id !== userId) {
      throw new PluginAuthError(
        "Sign in again before linking an account.",
        "UNAUTHORIZED",
      )
    }
    await linkPluginIdentity(current.id, provider, identity)
    return current
  }
  const linked = await pluginIdentityUser(provider, identity)
  if (linked) {
    await signIn(c, linked.id)
    return linked
  }
  if (provider.options.allowSignUp !== true) {
    throw new PluginAuthError(
      "No account is linked to this sign-in. Sign in to your account, then link this provider under Settings → Account.",
      "UNAUTHORIZED",
    )
  }
  const created = await createPluginUser(provider, identity)
  await signIn(c, created.id)
  return created
}

/** Never log guest error text: even an ordinary Error can contain a password. */
export function pluginAuthFailure(cause: unknown): PluginAuthError {
  if (cause instanceof PluginAuthError) return cause
  if (
    cause instanceof SandboxError &&
    cause.kind === "guest" &&
    cause.name === "ProviderError"
  ) {
    return new PluginAuthError(
      cause.message.slice(0, 300) || GENERIC_FAILURE,
      "UNAUTHORIZED",
    )
  }
  log.error("Plugin sign-in failed", {
    kind:
      cause instanceof SandboxError
        ? cause.kind
        : "invalid-result-or-host-error",
  })
  return new PluginAuthError(GENERIC_FAILURE, "UNAUTHORIZED")
}

export function pluginRpcFailure(cause: unknown): never {
  const error = pluginAuthFailure(cause)
  throw new ORPCError(error.code, { message: error.message })
}

type Counter = { count: number; expiresAt: number }
const failures = new Map<string, Counter>()
const attempts = new Map<string, Counter>()
const FAILURE_WINDOW = 5 * 60 * 1000
const ATTEMPT_WINDOW = 60 * 1000
const MAX_COUNTERS = 10000

function prune(counters: Map<string, Counter>, now: number): void {
  for (const [key, entry] of counters) {
    if (entry.expiresAt <= now) counters.delete(key)
  }
}

function increment(
  counters: Map<string, Counter>,
  key: string,
  ttl: number,
): void {
  const now = Date.now()
  prune(counters, now)
  const current = counters.get(key)
  if (current) {
    current.count++
    return
  }
  // Refuse new buckets at capacity rather than letting an attacker evict a victim's limit.
  if (counters.size >= MAX_COUNTERS)
    throw new PluginAuthError(WAIT, "TOO_MANY_REQUESTS")
  counters.set(key, { count: 1, expiresAt: now + ttl })
}

const CredentialFields = t.record(t.string(), t.string().max(1024))

/** Both credentials procedures share validation, throttling, and failure handling. */
export async function authenticatePluginCredentials(
  provider: AuthProvider,
  fields: Record<string, string>,
): Promise<Identity> {
  await requirePluginSetup()
  const contribution = provider.contribution
  const checked = CredentialFields.safeParse(fields)
  if (
    contribution.kind !== "credentials" ||
    !checked.success ||
    Object.keys(fields).length !== contribution.fields.length ||
    contribution.fields.some((field) => !Object.hasOwn(fields, field.key))
  ) {
    throw new PluginAuthError("The sign-in fields don't match this provider.")
  }
  const key = authProviderKey(provider)
  const text = contribution.fields.find((field) => field.type === "text")
  const username = text ? (fields[text.key] ?? "").toLowerCase().trim() : ""
  const failureKey = JSON.stringify([key, username])
  const now = Date.now()
  prune(failures, now)
  prune(attempts, now)
  if (
    (failures.get(failureKey)?.count ?? 0) >= 5 ||
    (attempts.get(key)?.count ?? 0) >= 30
  ) {
    throw new PluginAuthError(WAIT, "TOO_MANY_REQUESTS")
  }
  // Reserve capacity before handing any credential values to the plugin.
  if (!failures.has(failureKey) && failures.size >= MAX_COUNTERS) {
    throw new PluginAuthError(WAIT, "TOO_MANY_REQUESTS")
  }
  increment(attempts, key, ATTEMPT_WINDOW)
  try {
    const result = await provider.call(
      "authenticate",
      [{ fields: checked.data }],
      { timeoutMs: 15000 },
    )
    if (result === null) throw new PluginAuthError(FAILURE, "UNAUTHORIZED")
    const identity = PluginIdentityResult.parse(result)
    failures.delete(failureKey)
    return identity
  } catch (cause) {
    increment(failures, failureKey, FAILURE_WINDOW)
    // Check the original guest message before truncation. Host-authored errors
    // must not change just because a short username occurs in their wording.
    if (
      cause instanceof SandboxError &&
      cause.kind === "guest" &&
      cause.name === "ProviderError" &&
      Object.values(checked.data).some(
        (value) => value && cause.message.includes(value),
      )
    ) {
      throw new PluginAuthError(GENERIC_FAILURE, "UNAUTHORIZED")
    }
    throw pluginAuthFailure(cause)
  }
}
