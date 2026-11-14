import { t, type SchemaBoundaryInput } from "./schema"

export const PLUGIN_API_VERSION = 1
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
export const RESERVED_PLUGIN_IDS = [
  "tmdb",
  "tvdb",
  "imdb",
  "oidc",
  "passkey",
  "matinee",
] as const
export const PluginId = t.string().regex(PLUGIN_ID_PATTERN)
const InstalledId = PluginId.refine(
  (id) => !RESERVED_PLUGIN_IDS.some((reserved) => reserved === id),
  "This id is reserved for the host.",
)
const Name = t.string().min(1).max(64)
const Label = t.string().min(1).max(300)
const Description = t.string().max(300)
const FieldKey = t.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/)
const HttpsUrl = t
  .string()
  .max(2048)
  .url()
  .refine((url) => url.startsWith("https://"), "Use an https URL.")
export const PluginMain = t
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("..") &&
      !/[\\\\:]/.test(path) &&
      path.split("").every((char) => char.charCodeAt(0) >= 32) &&
      path.split("/").every((part) => part.length > 0 && part !== "."),
    "Use a relative file path without .. or backslashes.",
  )
export const PluginNetworkHost = t
  .string()
  .max(253)
  .refine((host) => {
    const domain = host.toLowerCase().replace(/^\*\./, "")
    return (
      domain.includes(".") &&
      domain !== "localhost" &&
      !domain.endsWith(".localhost") &&
      !/^[\d.]+$/.test(domain) &&
      !/(^|\.)(0x[\da-f]+|\d+)$/i.test(domain) &&
      domain
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    )
  }, "Use a public host name, without an IP address, scheme, or port.")
  .transform((host) => host.toLowerCase())

export const PLUGIN_EVENT_NAMES = [
  "library.scanned",
  "title.added",
  "title.matched",
  "playback.started",
  "playback.stopped",
  "playback.watched",
  "user.created",
] as const
export const PluginEventName = t.enum(PLUGIN_EVENT_NAMES)
export type PluginEventName = t.infer<typeof PluginEventName>
export const PluginEventMeta = t.object({
  id: t.string().min(1),
  at: t.string().datetime(),
  attempt: t.number().int().min(1),
})
export type PluginEventMeta = t.infer<typeof PluginEventMeta>
export const PluginLibraryRef = t.object({
  id: t.string().max(128),
  name: t.string().max(300),
})
export const PluginTitleRef = t.object({
  id: t.string().max(128),
  name: t.string().max(1000),
  year: t.number().int().nullable(),
  kind: t.enum(["movie", "show"]),
  library: PluginLibraryRef,
  externalIds: t.record(t.string().max(64), t.string().max(256)),
})
export const PluginUserRef = t.object({
  id: t.string().max(128),
  username: t.string().max(300),
})
export const PluginItemRef = t.object({
  id: t.string().max(128),
  label: t.string().max(1000),
  season: t.number().int().nullable(),
  episode: t.number().int().nullable(),
})
const PlaybackRefs = {
  user: PluginUserRef,
  title: PluginTitleRef,
  item: PluginItemRef,
}
export const PluginLibraryScannedEvent = t.object({
  library: PluginLibraryRef,
  added: t.number().int().min(0),
  removed: t.number().int().min(0),
})
export const PluginTitleAddedEvent = t.object({ title: PluginTitleRef })
export const PluginTitleMatchedEvent = t.object({
  title: PluginTitleRef,
  provider: PluginId,
  providerId: t.string().max(256),
})
export const PluginPlaybackStartedEvent = t.object({
  ...PlaybackRefs,
  positionSeconds: t.number().min(0),
})
export const PluginPlaybackStoppedEvent = t.object({
  ...PlaybackRefs,
  positionSeconds: t.number().min(0),
  durationSeconds: t.number().min(0).nullable(),
})
export const PluginPlaybackWatchedEvent = t.object({
  ...PlaybackRefs,
  watched: t.boolean(),
})
export const PluginCreatedUserRef = PluginUserRef.extend({
  role: t.enum(["admin", "user"]),
})
export const PluginUserCreatedEvent = t.object({ user: PluginCreatedUserRef })
export const PluginEventSchemas = {
  "library.scanned": PluginLibraryScannedEvent,
  "title.added": PluginTitleAddedEvent,
  "title.matched": PluginTitleMatchedEvent,
  "playback.started": PluginPlaybackStartedEvent,
  "playback.stopped": PluginPlaybackStoppedEvent,
  "playback.watched": PluginPlaybackWatchedEvent,
  "user.created": PluginUserCreatedEvent,
}
export type PluginEvents = {
  [K in PluginEventName]: t.infer<(typeof PluginEventSchemas)[K]>
}
export type PluginEventPayload<K extends PluginEventName> = PluginEvents[K]

const FieldBase = {
  key: FieldKey,
  label: Label,
  description: Description.optional(),
  required: t.boolean().$default(false),
  /**
   * Whether the setting decides which person a sign-in subject means, like
   * the name of the field the subject is read from. An address with
   * `network: true` always does. When one changes, the admin is asked
   * what happens to the accounts already linked.
   */
  identity: t.boolean().optional(),
}
export const PluginConfigField = t.union([
  t.strictObject({
    ...FieldBase,
    type: t.literal("string"),
    default: t.string().max(10000).optional(),
  }),
  t.strictObject({
    ...FieldBase,
    type: t.literal("secret"),
    default: t.string().max(10000).optional(),
  }),
  t.strictObject({
    ...FieldBase,
    type: t.literal("url"),
    network: t.boolean().$default(false),
    default: t.string().url().optional(),
  }),
  t.strictObject({
    ...FieldBase,
    type: t.literal("boolean"),
    default: t.boolean().optional(),
  }),
  t
    .strictObject({
      ...FieldBase,
      type: t.literal("number"),
      min: t.number().optional(),
      max: t.number().optional(),
      default: t.number().optional(),
    })
    .refine(
      (field) =>
        (field.min === undefined ||
          field.max === undefined ||
          field.min <= field.max) &&
        (field.default === undefined ||
          ((field.min === undefined || field.default >= field.min) &&
            (field.max === undefined || field.default <= field.max))),
      "Check the number's bounds and default.",
    ),
  t
    .strictObject({
      ...FieldBase,
      type: t.literal("select"),
      default: t.string().optional(),
      options: t
        .array(
          t.strictObject({ value: t.string().min(1).max(300), label: Label }),
        )
        .min(1)
        .max(100),
    })
    .refine(
      (field) =>
        new Set(field.options.map((option) => option.value)).size ===
          field.options.length &&
        (field.default === undefined ||
          field.options.some((option) => option.value === field.default)),
      "Select options must be unique and contain the default.",
    ),
])
export type PluginConfigField = t.infer<typeof PluginConfigField>
export const PluginCredentialsField = t.strictObject({
  key: FieldKey,
  label: Label,
  type: t.enum(["text", "password"]),
})
const CredentialsFields = t
  .array(PluginCredentialsField)
  .min(1)
  .max(4)
  .refine(
    (fields) =>
      new Set(fields.map((field) => field.key)).size === fields.length,
    "Credential field keys must be unique.",
  )
export const PluginMetadataContribution = t.strictObject({
  id: InstalledId,
  name: Name,
  description: Description.$default(""),
  kinds: t
    .array(t.enum(["movie", "show"]))
    .min(1)
    .max(2),
  episodes: t.boolean().$default(false),
})
export type PluginMetadataContribution = t.infer<
  typeof PluginMetadataContribution
>
export const PluginAuthContribution = t.union([
  t.strictObject({ id: InstalledId, name: Name, kind: t.literal("redirect") }),
  t.strictObject({
    id: InstalledId,
    name: Name,
    kind: t.literal("credentials"),
    fields: CredentialsFields,
  }),
])
export type PluginAuthContribution = t.infer<typeof PluginAuthContribution>
const Contributions = t.strictObject({
  metadata: t
    .array(PluginMetadataContribution)
    .max(32)
    .$default([])
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Metadata provider ids must be unique.",
    ),
  auth: t
    .array(PluginAuthContribution)
    .max(32)
    .$default([])
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Auth provider ids must be unique.",
    ),
  events: t.array(PluginEventName).max(PLUGIN_EVENT_NAMES.length).$default([]),
})
const Permissions = t.strictObject({
  network: t.array(PluginNetworkHost).max(32).$default([]),
  storage: t.boolean().$default(false),
})
const Config = t
  .array(PluginConfigField)
  .max(32)
  .refine(
    (fields) =>
      new Set(fields.map((field) => field.key)).size === fields.length,
    "Config field keys must be unique.",
  )
export const PluginPackageManifest = t.looseObject({
  name: t.string().min(1).max(214),
  version: t.string().min(1).max(100),
  description: Description.optional(),
  author: t
    .union([t.string().max(300), t.looseObject({ name: t.string().max(300) })])
    .optional(),
  homepage: HttpsUrl.optional(),
  license: t.string().max(300).optional(),
  matinee: t.strictObject({
    api: t.number().int(),
    id: InstalledId,
    name: Name,
    main: PluginMain,
    source: PluginMain.optional(),
    permissions: Permissions.$default({ network: [], storage: false }),
    contributes: Contributions.$default({ metadata: [], auth: [], events: [] }),
    config: Config.$default([]),
  }),
})
/** The host's normalized manifest. Package-only npm fields are not retained. */
export const PluginManifest = t.object({
  id: PluginId,
  name: Name,
  version: t.string(),
  description: Description,
  author: t.string().nullable(),
  homepage: HttpsUrl.nullable(),
  license: t.string(),
  api: t.number().int(),
  main: PluginMain,
  permissions: Permissions,
  contributes: Contributions,
  config: Config,
})
export type PluginManifest = t.infer<typeof PluginManifest>
/** Read static JSON only. A numeric unsupported API remains visible to the host. */
export function parsePluginManifest(
  packageJson: SchemaBoundaryInput,
): PluginManifest | string[] {
  const result = PluginPackageManifest.safeParse(packageJson)
  if (!result.success)
    return result.error.issues.map(
      (issue) => `${issue.path.join(".") || "package.json"}: ${issue.message}`,
    )
  const pkg = result.data
  const author = t.string().safeParse(pkg.author)
  const person = t.object({ name: t.string() }).safeParse(pkg.author)
  return {
    id: pkg.matinee.id,
    name: pkg.matinee.name,
    api: pkg.matinee.api,
    main: pkg.matinee.main,
    permissions: pkg.matinee.permissions,
    contributes: pkg.matinee.contributes,
    config: pkg.matinee.config,
    version: pkg.version,
    description: pkg.description ?? "",
    author: author.success
      ? author.data
      : person.success
        ? person.data.name
        : null,
    homepage: pkg.homepage ?? null,
    license: pkg.license ?? "",
  }
}

export const PluginGrant = t.object({
  network: t.array(t.string()),
  networkConfig: t.array(t.string()),
  storage: t.boolean(),
  metadata: t.array(t.string()),
  auth: t.array(
    t.object({ id: t.string(), kind: t.enum(["redirect", "credentials"]) }),
  ),
  events: t.array(PluginEventName),
})
export type PluginGrant = t.infer<typeof PluginGrant>
/**
 * The keys of the settings that decide which person a sign-in subject
 * means: the addresses a sign-in plugin talks to, and what its manifest
 * marks. Empty for a plugin that signs nobody in.
 */
export function identityFields(manifest: PluginManifest): string[] {
  if (manifest.contributes.auth.length === 0) return []
  return manifest.config
    .filter(
      (field) => field.identity || (field.type === "url" && field.network),
    )
    .map((field) => field.key)
}
const sorted = (values: string[]) => [...new Set(values)].sort()
export function pluginGrant(manifest: PluginManifest): PluginGrant {
  return {
    network: sorted(
      manifest.permissions.network.map((host) => host.toLowerCase()),
    ),
    networkConfig: sorted(
      manifest.config
        .filter((field) => field.type === "url" && field.network)
        .map((field) => field.key),
    ),
    storage: manifest.permissions.storage,
    metadata: sorted(
      manifest.contributes.metadata.map((provider) => provider.id),
    ),
    auth: manifest.contributes.auth
      .map(({ id, kind }) => ({ id, kind }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    events: [...new Set(manifest.contributes.events)].sort(),
  }
}
export const PluginPermission = t.object({
  kind: t.enum([
    "network",
    "network-config",
    "storage",
    "metadata",
    "auth",
    "auth-credentials",
    "events-library",
    "events-playback",
    "events-users",
  ]),
  detail: t.array(t.string()),
  sensitive: t.boolean(),
})
export type PluginPermission = t.infer<typeof PluginPermission>
export function addedPermissions(
  before: PluginGrant | null,
  manifest: PluginManifest,
): PluginPermission[] {
  const grant = pluginGrant(manifest)
  const items: PluginPermission[] = []
  const add = (
    kind: PluginPermission["kind"],
    detail: string[],
    sensitive = false,
  ) => {
    if (detail.length) items.push({ kind, detail, sensitive })
  }
  add(
    "network",
    grant.network.filter((host) => !before?.network.includes(host)),
  )
  add(
    "network-config",
    grant.networkConfig
      .filter((key) => !before?.networkConfig.includes(key))
      .map(
        (key) =>
          manifest.config.find((field) => field.key === key)?.label ?? key,
      ),
  )
  if (grant.storage && !before?.storage)
    items.push({ kind: "storage", detail: [], sensitive: false })
  add(
    "metadata",
    manifest.contributes.metadata
      .filter((provider) => !before?.metadata.includes(provider.id))
      .map((provider) => provider.name),
  )
  add(
    "auth",
    manifest.contributes.auth
      .filter(
        (provider) =>
          !before?.auth.some(
            (old) => old.id === provider.id && old.kind === provider.kind,
          ),
      )
      .map((provider) => provider.name),
  )
  add(
    "auth-credentials",
    manifest.contributes.auth
      .filter(
        (provider) =>
          provider.kind === "credentials" &&
          !before?.auth.some(
            (old) => old.id === provider.id && old.kind === "credentials",
          ),
      )
      .map((provider) => provider.name),
    true,
  )
  const events = grant.events.filter((event) => !before?.events.includes(event))
  add(
    "events-library",
    events.filter(
      (event) => event.startsWith("library.") || event.startsWith("title."),
    ),
  )
  add(
    "events-playback",
    events.filter((event) => event.startsWith("playback.")),
    true,
  )
  add(
    "events-users",
    events.filter((event) => event.startsWith("user.")),
  )
  return items
}
export function pluginPermissions(
  manifest: PluginManifest,
): PluginPermission[] {
  return addedPermissions(null, manifest)
}

const NpmSource = t.object({
  type: t.literal("npm"),
  spec: t.string().min(1).max(300),
})
const UrlSource = t.object({ type: t.literal("url"), url: HttpsUrl })
export const PluginInstallSource = t.union([NpmSource, UrlSource])
export const PluginSource = t.union([
  NpmSource,
  UrlSource,
  t.object({ type: t.literal("directory"), path: t.string() }),
  t.object({ type: t.literal("builtin") }),
])
export type PluginSource = t.infer<typeof PluginSource>
export const PluginState = t.enum([
  "incompatible",
  "missing",
  "disabled",
  "needs-approval",
  "needs-config",
  "starting",
  "running",
  "error",
])
export type PluginState = t.infer<typeof PluginState>
const ConfigValue = t
  .union([t.string().max(10000), t.number(), t.boolean()])
  .nullable()
// The Kotlin generator represents arbitrary JSON as JsonElement. Keep scalar
// validation here while using that shared JSON representation on the wire.
export const PluginConfigValue = t.custom<t.infer<typeof ConfigValue>>(
  (value) => ConfigValue.safeParse(value).success,
)
export type PluginConfigValue = t.infer<typeof PluginConfigValue>
export const PluginConfigValues = t.record(FieldKey, PluginConfigValue)
export type PluginConfigValues = t.infer<typeof PluginConfigValues>
export const PluginInfo = t.object({
  id: PluginId,
  name: t.string(),
  version: t.string(),
  description: t.string(),
  author: t.string().nullable(),
  homepage: t.string().nullable(),
  source: PluginSource,
  builtin: t.boolean(),
  removable: t.boolean(),
  enabled: t.boolean(),
  state: PluginState,
  error: t.string().nullable(),
  /**
   * Its sandbox is loaded now. A plugin that is on sleeps until something
   * calls it, and takes no memory while it does. Always true for a
   * built-in, which is part of the server.
   */
  awake: t.boolean(),
  /**
   * How delivery of the events it listens for stands: how many wait, and
   * for the oldest of them, while it keeps failing, when the next try is,
   * why the last one failed, how many tries there were, and when the
   * server gives up on it. Null for a plugin that listens for none.
   */
  events: t
    .object({
      pending: t.number().int().min(0),
      failing: t.number().int().min(0),
      blocked: t.boolean(),
      retryAt: t.date().nullable(),
      error: t.string().nullable(),
      attempts: t.number().int().min(0),
      expiresAt: t.date().nullable(),
    })
    .nullable(),
  permissions: t.array(PluginPermission),
  approval: t
    .object({
      needed: t.boolean(),
      integrity: t.string(),
      added: t.array(PluginPermission),
      changedOnDisk: t.boolean(),
    })
    .nullable(),
  config: t.object({
    fields: t.array(PluginConfigField),
    values: PluginConfigValues,
    secretsSet: t.array(t.string()),
    environment: t.array(t.string()),
    /**
     * Settings whose saved value the fields no longer take, as after an
     * update that narrowed one. The plugin waits until they are set again.
     */
    invalid: t.array(t.string()),
    /**
     * Settings that decide which person a sign-in subject means. Saving a
     * change to one while accounts are linked needs `links`.
     */
    identity: t.array(t.string()),
  }),
  contributes: t.object({
    metadata: t.array(t.object({ id: PluginId, name: t.string() })),
    auth: t.array(
      t.object({
        id: PluginId,
        key: t.string(),
        name: t.string(),
        kind: t.enum(["redirect", "credentials"]),
        allowSignUp: t.boolean(),
      }),
    ),
    events: t.array(PluginEventName),
  }),
  update: t.object({ version: t.string() }).nullable(),
  installedAt: t.date(),
})
export type PluginInfo = t.infer<typeof PluginInfo>
/**
 * What turning a plugin off or removing it takes away, for the warning
 * before an admin does it.
 */
export const PluginImpactLibrary = t.object({ id: t.uuid(), name: t.string() })
export const PluginImpact = t.object({
  /**
   * Libraries that get their metadata from one of its providers. They
   * keep what they have and fetch nothing while it is off.
   */
  libraries: t.array(PluginImpactLibrary),
  /** Accounts linked to one of its sign-in providers. */
  linkedAccounts: t.number().int().min(0),
  /**
   * Of those, the accounts with no other way in: no passkey while
   * passkeys are on, no single sign-on link, and no sign-in through
   * another plugin that is on. They can't sign in while it is off.
   */
  lockedOut: t.number().int().min(0),
  /** The usernames of the first few of those, by name. */
  lockedOutNames: t.array(t.string()).max(5),
})
export type PluginImpact = t.infer<typeof PluginImpact>
export const PluginPreview = t.object({
  ticket: t.string(),
  manifest: PluginManifest,
  permissions: t.array(PluginPermission),
  integrity: t.string(),
  installedVersion: t.string().nullable(),
  added: t.array(PluginPermission),
})
export type PluginPreview = t.infer<typeof PluginPreview>
export const PluginLogLine = t.object({
  at: t.date(),
  level: t.enum(["debug", "info", "warn", "error"]),
  message: t.string().max(2000),
})
export type PluginLogLine = t.infer<typeof PluginLogLine>
export const PluginSearchResult = t.object({
  name: t.string(),
  version: t.string(),
  description: t.string(),
  author: t.string().nullable(),
  homepage: t.string().nullable(),
  npmUrl: t.string(),
  installedId: t.string().nullable(),
})
export type PluginSearchResult = t.infer<typeof PluginSearchResult>
export const PluginAuthProvider = t.object({
  key: t.string().min(1).max(65),
  name: Name,
  kind: t.enum(["redirect", "credentials"]),
  fields: t.array(PluginCredentialsField).max(4),
  allowSignUp: t.boolean(),
})
export type PluginAuthProvider = t.infer<typeof PluginAuthProvider>
export const PluginIdentity = PluginAuthProvider.omit({
  allowSignUp: true,
}).extend({
  linked: t
    .object({ label: t.string().nullable(), createdAt: t.date() })
    .nullable(),
})
export type PluginIdentity = t.infer<typeof PluginIdentity>
export const PluginSignInInput = t.object({
  key: t.string().min(1).max(65),
  fields: t.record(FieldKey, t.string().max(10000)),
})
