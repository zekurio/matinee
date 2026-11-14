import { SecretSource } from "./admin"
import { get, post, put, del } from "./contract-routes"
import { t } from "./schema"
import { TitleKind } from "./schemas"
export const FulfilmentSourceId = t.string().min(1).max(64)
export type FulfilmentSourceId = t.infer<typeof FulfilmentSourceId>

export const ExternalIdSite = t.enum(["tmdb", "tvdb", "imdb"])
export type ExternalIdSite = t.infer<typeof ExternalIdSite>

/** JSON settings are parsed by the selected source's own schema before use. */
export const FulfilmentValues = t.record(t.string(), t.unknown())
export type FulfilmentValues = t.infer<typeof FulfilmentValues>

export const RemoteRef = t.record(t.string(), t.unknown())
export type RemoteRef = t.infer<typeof RemoteRef>

/** Where a field sits in a connection's form. */
export const FieldSection = t.enum([
  "connection",
  "defaults",
  "anime",
  "behaviour",
])
export type FieldSection = t.infer<typeof FieldSection>

export const DescribedField = t.object({
  key: t.string(),
  label: t.string(),
  /**
   * `select` holds one choice's value, `multiselect` a list of them, and
   * `switch` true or false. The others hold text.
   */
  kind: t.enum(["text", "secret", "select", "multiselect", "switch"]),
  required: t.boolean(),
  choices: t.array(
    t.object({
      value: t.string(),
      label: t.string(),
      description: t.string().nullable(),
    }),
  ),
  section: FieldSection,
  /**
   * The kind of title it holds the folder of, for showing which library
   * that folder lands in. Null for anything that isn't a folder.
   */
  folder: TitleKind.nullable(),
})
export type DescribedField = t.infer<typeof DescribedField>

export const FulfilmentSourceDescription = t.object({
  id: FulfilmentSourceId,
  name: t.string(),
  kinds: t.array(TitleKind),
  needs: t.array(ExternalIdSite),
  scope: t.enum(["title", "season"]),
  /**
   * The source reads a connection key, saved on the connection or from
   * MATINEE_CONNECTION_<SLUG>_API_KEY. A source with no backend has none.
   */
  apiKey: t.boolean(),
  /** It takes override rules. */
  rules: t.boolean(),
  /** How to reach it and how it behaves, the same for every request. */
  fields: t.array(DescribedField),
  /** What a new connection's `fields` start from. */
  values: FulfilmentValues,
})
export type FulfilmentSourceDescription = t.infer<
  typeof FulfilmentSourceDescription
>

/** A library, by name, as the settings speak of one. */
export const FulfilmentLibrary = t.object({ id: t.uuid(), name: t.string() })
export type FulfilmentLibrary = t.infer<typeof FulfilmentLibrary>

/**
 * A folder a connection sends titles to, and the library they land in:
 * the one whose folder holds it, or the one an admin picked because none
 * does. `from` says which of its settings sends there.
 */
export const FulfilmentLanding = t.object({
  kind: TitleKind,
  from: t.enum(["default", "anime", "rule"]),
  folder: t.string(),
  /** Null when no library holds the folder and none was picked. */
  library: FulfilmentLibrary.nullable(),
})
export type FulfilmentLanding = t.infer<typeof FulfilmentLanding>

export const FulfilmentConnection = t.object({
  id: t.uuid(),
  name: t.string(),
  slug: t.string(),
  source: FulfilmentSourceId,
  settings: FulfilmentValues,
  options: FulfilmentValues,
  /** The kinds of title requests go through it for. */
  defaultFor: t.array(TitleKind),
  /** The library each folder no library holds lands in, by folder. */
  folderLibraries: t.record(t.string(), t.uuid()),
  apiKey: t.object({ source: SecretSource, environment: t.boolean() }),
  /** Every folder its settings and rules send to, and where that lands. */
  landings: t.array(FulfilmentLanding),
})
export type FulfilmentConnection = t.infer<typeof FulfilmentConnection>

export const FulfilmentConnectionInput = t.object({
  name: t.string().trim().min(1).max(128),
  slug: t.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  source: FulfilmentSourceId,
  settings: FulfilmentValues,
  options: FulfilmentValues.$default({}),
  /**
   * Makes it the default for these kinds, which stops another connection
   * being the default for them.
   */
  defaultFor: t.array(TitleKind).$default([]),
  folderLibraries: t.record(t.string(), t.uuid()).$default({}),
  apiKey: t.string().min(1).max(4096).nullable().optional(),
})
export type FulfilmentConnectionInput = t.infer<
  typeof FulfilmentConnectionInput
>

/**
 * What a connection can send requests with: the fields of its options,
 * with the choices its server offers, what a new connection starts from,
 * and the fields an override rule can change.
 */
export const FulfilmentOptions = t.object({
  fields: t.array(DescribedField),
  values: FulfilmentValues,
  rule: t.array(DescribedField),
})
export type FulfilmentOptions = t.infer<typeof FulfilmentOptions>

/**
 * Asks a connection for its choices before it is saved: its source and
 * settings as the form holds them. With `id`, a key left out is the one
 * the saved connection uses.
 */
export const FulfilmentOptionsInput = t.object({
  id: t.uuid().optional(),
  source: FulfilmentSourceId,
  slug: t.string().max(64),
  settings: FulfilmentValues,
  apiKey: t.string().min(1).max(4096).optional(),
})

export const FulfilmentKeyword = t.object({
  id: t.number().int(),
  name: t.string(),
})
export type FulfilmentKeyword = t.infer<typeof FulfilmentKeyword>

/**
 * An override rule: when a title meets every condition that is filled,
 * within a condition any of its values, it is sent with the rule's
 * settings over the connection's.
 */
export const FulfilmentRule = t.object({
  id: t.uuid(),
  connectionId: t.uuid(),
  users: t.array(t.uuid()),
  /** TMDB genre ids. */
  genres: t.array(t.number().int()),
  /** ISO 639-1 codes of the language it was made in. */
  languages: t.array(t.string()),
  keywords: t.array(FulfilmentKeyword),
  settings: FulfilmentValues,
})
export type FulfilmentRule = t.infer<typeof FulfilmentRule>

export const FulfilmentRuleInput = t.object({
  connectionId: t.uuid(),
  users: t.array(t.uuid()).max(500).$default([]),
  genres: t.array(t.number().int()).max(100).$default([]),
  languages: t
    .array(t.string().regex(/^[a-z]{2,3}$/, "Choose a language from the list."))
    .max(200)
    .$default([]),
  keywords: t.array(FulfilmentKeyword).max(100).$default([]),
  settings: FulfilmentValues,
  /** The library the rule's folder lands in, when no library holds it. */
  folderLibraryId: t.uuid().nullable().optional(),
})
export type FulfilmentRuleInput = t.infer<typeof FulfilmentRuleInput>

/** A genre, language, or account a rule's conditions can name. */
export const FulfilmentRuleGenre = t.object({
  id: t.number().int(),
  name: t.string(),
})
export const FulfilmentRuleLanguage = t.object({
  id: t.string(),
  name: t.string(),
})
export const FulfilmentRuleAccount = t.object({
  id: t.uuid(),
  name: t.string(),
})

/** What a rule's conditions offer for a kind of title. */
export const FulfilmentRuleChoices = t.object({
  /** TMDB is set up, so genres and keywords can be chosen and matched. */
  tmdb: t.boolean(),
  genres: t.array(FulfilmentRuleGenre),
  languages: t.array(FulfilmentRuleLanguage),
  users: t.array(FulfilmentRuleAccount),
})
export type FulfilmentRuleChoices = t.infer<typeof FulfilmentRuleChoices>

export const adminFulfilmentContract = {
  sources: get("/admin/fulfilment/sources").output(
    t.array(FulfilmentSourceDescription),
  ),
  connections: get("/admin/fulfilment/connections").output(
    t.array(FulfilmentConnection),
  ),
  create: post("/admin/fulfilment/connections")
    .input(FulfilmentConnectionInput)
    .output(FulfilmentConnection),
  update: put("/admin/fulfilment/connections/{id}")
    .input(FulfilmentConnectionInput.extend({ id: t.uuid() }))
    .output(FulfilmentConnection),
  remove: del("/admin/fulfilment/connections/{id}")
    .input(t.object({ id: t.uuid() }))
    .output(t.void()),
  test: post("/admin/fulfilment/test")
    .input(t.object({ id: t.uuid() }))
    .output(t.void()),
  // A read, but its settings are a record, which a query string can't carry.
  options: post("/admin/fulfilment/options")
    .input(FulfilmentOptionsInput)
    .output(FulfilmentOptions),
  /** The library of a kind a folder lands in, by the folders Matinee scans. */
  landing: get("/admin/fulfilment/landing")
    .input(t.object({ kind: TitleKind, folder: t.string().min(1).max(4096) }))
    .output(t.object({ library: FulfilmentLibrary.nullable() })),
  rules: get("/admin/fulfilment/connections/{connectionId}/rules")
    .input(t.object({ connectionId: t.uuid() }))
    .output(t.array(FulfilmentRule)),
  createRule: post("/admin/fulfilment/connections/{connectionId}/rules")
    .input(FulfilmentRuleInput)
    .output(FulfilmentRule),
  updateRule: put("/admin/fulfilment/rules/{id}")
    .input(FulfilmentRuleInput.extend({ id: t.uuid() }))
    .output(FulfilmentRule),
  removeRule: del("/admin/fulfilment/rules/{id}")
    .input(t.object({ id: t.uuid() }))
    .output(t.void()),
  /** Puts a connection's rules in this order, the first winning a tie. */
  reorderRules: put("/admin/fulfilment/connections/{connectionId}/rules/order")
    .input(
      t.object({ connectionId: t.uuid(), ids: t.array(t.uuid()).max(500) }),
    )
    .output(t.array(FulfilmentRule)),
  ruleChoices: get("/admin/fulfilment/rule-choices")
    .input(t.object({ kind: TitleKind }))
    .output(FulfilmentRuleChoices),
  /** TMDB's keywords whose names match a search. */
  keywords: get("/admin/fulfilment/keywords")
    .input(t.object({ query: t.string().trim().min(1).max(100) }))
    .output(t.array(FulfilmentKeyword)),
}
