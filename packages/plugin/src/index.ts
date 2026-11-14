import type { PluginCall } from "./call"
export * from "./call"
import type { PluginEvents, PluginEventMeta } from "./events"
import type { PluginFetchInit, PluginFetch } from "./http"
import type { Json, MetadataProvider } from "./metadata"
// These names are installed by the prelude. Module-local declarations keep
// importing SDK types on a Node host from changing the host's globals.
declare const fetch: PluginFetch
declare function btoa(text: string): string
declare function setTimeout(callback: () => void, delay: number): number
export * from "./metadata"
export * from "./events"
export type { PluginFetchInit, PluginResponse } from "./http"

/** A stable provider identity. The host, not the plugin, chooses the local account and role. */
export type Identity = {
  /** Stable provider subject, 1 to 256 characters. */
  subject: string
  /** Username hint and label for the link. Never used to take over an existing account. */
  username?: string | null
  /** Suggested display name for a new account. */
  name?: string | null
}
/** The host binds state and session to the browser and checks state before finish. */
export type RedirectAuth = {
  start(
    input: {
      redirectUri: string
      state: string
    },
    call: PluginCall,
  ): Promise<{ url: string; session?: Json }>
  finish(
    input: {
      query: Record<string, string>
      session: Json | null
      redirectUri: string
    },
    call: PluginCall,
  ): Promise<Identity>
}
/** Validate the manifest's credentials fields. Return null when credentials do not match. */
export type CredentialsAuth = {
  authenticate(
    input: {
      fields: Record<string, string>
    },
    call: PluginCall,
  ): Promise<Identity | null>
}
/** Log details are serialized inside the guest, not trusted by the host. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export type PluginLogger = (message: string, detail?: unknown) => void

/** Capabilities supplied by the host. No database, filesystem, environment, or session is exposed. */
export type PluginContext = {
  plugin: { id: string; version: string }
  server: { version: string; api: number; publicUrl: string }
  /** Manifest config values, including secrets. Do not log secrets. */
  config: Readonly<Record<string, string | number | boolean | null>>
  log: Record<"debug" | "info" | "warn" | "error", PluginLogger>
  /** Requires permissions.storage. Keys and values are private to this plugin. */
  storage: {
    get(key: string): Promise<Json | null>
    set(key: string, value: Json): Promise<void>
    delete(key: string): Promise<void>
    /**
     * Read a value, change it, and write it back as one step. Handlers
     * run interleaved, so a `get` followed by a `set` can lose another
     * handler's write to the same key. `change` gets null for a missing
     * key, and what it returns is stored and returned.
     */
    update(
      key: string,
      change: (current: Json | null) => Json | Promise<Json>,
    ): Promise<Json>
    keys(prefix?: string): Promise<string[]>
  }
  crypto: {
    randomUUID(): string
    randomBytes(length: number): Uint8Array
    sha256(data: string | Uint8Array): Promise<Uint8Array>
    hmacSha256(
      key: string | Uint8Array,
      data: string | Uint8Array,
    ): Promise<Uint8Array>
  }
}
/** Handler keys must also be declared in the manifest. */
export type PluginHandlers = {
  metadata?: Record<string, MetadataProvider>
  auth?: Record<string, RedirectAuth | CredentialsAuth>
  events?: {
    [K in keyof PluginEvents]?: (
      event: PluginEvents[K],
      meta: PluginEventMeta,
    ) => Promise<void> | void
  }
  /** Called before shutdown, with at most two seconds to finish. */
  dispose?(call: PluginCall): Promise<void> | void
}
export type PluginSetup = (
  ctx: PluginContext,
) => PluginHandlers | Promise<PluginHandlers>
/** The only default export the host accepts. Setup runs after approval inside the sandbox. */
export function definePlugin(
  setup: PluginSetup,
): Readonly<{ matineePlugin: 1; setup: PluginSetup }> {
  return Object.freeze({ matineePlugin: 1, setup })
}
/** Auth handlers may throw this to show a useful message to the person signing in. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}
/** Lowercase hexadecimal, useful for digest bytes. */
export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}
/** URL-safe base64 without padding. */
export function base64Url(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoa(chunks.join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
/** Fetch JSON through the host's network grant. JSON bodies are encoded with application/json.
 * Retries 429 and 5xx responses at most three times. Retry delays are capped at 60 seconds.
 * Parse the returned JSON before using it as provider data.
 */
export async function fetchJson(
  url: string | { toString(): string },
  init?: Omit<PluginFetchInit, "body"> & { body?: Json },
): Promise<Json> {
  const headers = Array.isArray(init?.headers)
    ? Object.fromEntries(init.headers)
    : { ...init?.headers }
  if (
    init?.body !== undefined &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  )
    headers["content-type"] = "application/json"
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
    if (response.ok) return response.json()
    if (
      attempt >= 3 ||
      (response.status !== 429 &&
        (response.status < 500 || response.status >= 600))
    )
      throw new ProviderError(
        `Request failed with HTTP ${response.status}.`,
        response.status,
      )
    const retryAfter = response.headers.get("retry-after")
    const seconds = retryAfter === null ? NaN : Number(retryAfter)
    const date = retryAfter === null ? NaN : Date.parse(retryAfter)
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Number.isFinite(date)
        ? date - Date.now()
        : 1000 * 2 ** attempt
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), Math.min(60000, Math.max(0, delay)))
    })
  }
}
