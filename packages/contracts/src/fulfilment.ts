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

export const DescribedField = t.object({
  key: t.string(),
  label: t.string(),
  kind: t.enum(["text", "secret", "select"]),
  required: t.boolean(),
  choices: t.array(
    t.object({
      value: t.string(),
      label: t.string(),
      description: t.string().nullable(),
    }),
  ),
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
  fields: t.array(DescribedField),
})
export type FulfilmentSourceDescription = t.infer<
  typeof FulfilmentSourceDescription
>

export const FulfilmentConnection = t.object({
  id: t.uuid(),
  name: t.string(),
  slug: t.string(),
  source: FulfilmentSourceId,
  settings: FulfilmentValues,
  apiKey: t.object({ source: SecretSource, environment: t.boolean() }),
})
export type FulfilmentConnection = t.infer<typeof FulfilmentConnection>

export const FulfilmentConnectionInput = t.object({
  name: t.string().trim().min(1).max(128),
  slug: t.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  source: FulfilmentSourceId,
  settings: FulfilmentValues,
  apiKey: t.string().min(1).max(4096).nullable().optional(),
})
export type FulfilmentConnectionInput = t.infer<
  typeof FulfilmentConnectionInput
>

/** A library, by name, as the settings speak of one. */
export const FulfilmentLibrary = t.object({ id: t.uuid(), name: t.string() })
export type FulfilmentLibrary = t.infer<typeof FulfilmentLibrary>

/**
 * The options anime is sent with instead of a mapping's own, and the
 * library it lands in: the one whose folder holds the folder the options
 * save to, or the one an admin picked when no library's folder does.
 */
export const AnimeFulfilment = t.object({
  options: FulfilmentValues,
  /** Null when the folder is in no library and none was picked. */
  library: FulfilmentLibrary.nullable(),
  /** False when Matinee couldn't tell where the folder is, so `library` is the pick. */
  found: t.boolean(),
})
export type AnimeFulfilment = t.infer<typeof AnimeFulfilment>

export const LibraryFulfilment = t.object({
  libraryId: t.uuid(),
  connectionId: t.uuid().nullable(),
  options: FulfilmentValues,
  /** Null when anime is sent like everything else. Always null without a connection. */
  anime: AnimeFulfilment.nullable(),
  /** The libraries whose anime lands in this one, by name. */
  animeFrom: t.array(FulfilmentLibrary),
})
export type LibraryFulfilment = t.infer<typeof LibraryFulfilment>

/**
 * A mapping to save. `anime` null sends anime like everything else, and
 * left out keeps what was saved. `anime.libraryId` is only read when the
 * anime options save to a folder that is in no library.
 */
export const LibraryFulfilmentInput = t.object({
  libraryId: t.uuid(),
  connectionId: t.uuid().nullable(),
  options: FulfilmentValues,
  anime: t
    .object({
      options: FulfilmentValues,
      libraryId: t.uuid().nullable().optional(),
    })
    .nullable()
    .optional(),
})

export const FulfilmentOptions = t.object({
  fields: t.array(DescribedField),
  values: FulfilmentValues,
  /** What options for anime start from before an admin chooses any. */
  anime: FulfilmentValues,
})

/**
 * Where a set of options would save titles, before it's saved: the folder
 * as the connection names it, and the library of the kind whose folder
 * holds it. Null `folder` when the source names none.
 */
export const FulfilmentLanding = t.object({
  folder: t.string().nullable(),
  library: FulfilmentLibrary.nullable(),
})

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
  mapping: get("/admin/fulfilment/libraries/{libraryId}")
    .input(t.object({ libraryId: t.uuid() }))
    .output(LibraryFulfilment),
  setMapping: put("/admin/fulfilment/libraries/{libraryId}")
    .input(LibraryFulfilmentInput)
    .output(LibraryFulfilment),
  options: get("/admin/fulfilment/options")
    .input(t.object({ connectionId: t.uuid(), libraryId: t.uuid() }))
    .output(FulfilmentOptions),
  // A read, but its options are a record, which a query string can't carry.
  landing: post("/admin/fulfilment/landing")
    .input(
      t.object({
        connectionId: t.uuid(),
        libraryId: t.uuid(),
        options: FulfilmentValues,
      }),
    )
    .output(FulfilmentLanding),
}
