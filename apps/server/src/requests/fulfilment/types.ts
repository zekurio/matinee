import type {
  FulfilmentSourceId,
  ExternalIdSite,
  CatalogRef,
  DescribedField,
  FulfilmentValues,
  RemoteRef,
  ShowScope,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"

/**
 * What a source throws when its server can't be reached. Dispatch tries
 * again on exactly this message, so sources use the constant.
 */
export const UNREACHABLE =
  "Cannot reach the connection. Check its URL and network access."

export type FulfilmentConnection = {
  id: string
  slug: string
  settings: FulfilmentValues
  /** Resolved saved secret or environment fallback. Never sent to clients. */
  apiKey: string | null
}

export type FulfilmentOrder = {
  requestId: string
  ref: CatalogRef
  externalIds: Map<ExternalIdSite, string>
  name: string
  year: number | null
  scope: t.infer<typeof ShowScope> | null
  options: FulfilmentValues
}

/** A sent request to ask about, with the reference `submit` returned for it. */
export type FulfilmentSent = {
  requestId: string
  ref: RemoteRef
}

export type FulfilmentProgress = {
  requestId: string
  /** Null for a film, or for a show as a whole. */
  season: number | null
  /** 0 to 1. Null while nothing is being fetched. */
  fraction: number | null
  /** Whole seconds to the latest active transfer completion, or null without an estimate. */
  etaSeconds: number | null
  /** Not released for home viewing yet. */
  waitingForRelease: boolean
  /** ISO date it comes out, when the source knows. */
  releaseDate: string | null
  /** The title is present remotely, but has neither a transfer nor a release wait. */
  stillLooking: boolean
  /**
   * Something an admin has to fix, like a title the source no longer has.
   * It puts the request in "Needs attention". Null when all is well.
   */
  problem: string | null
  /** Admin-only troubleshooting values. No adapter may report arrival. */
  diagnostics: { label: string; value: string }[]
}

export interface FulfilmentSource {
  id: FulfilmentSourceId
  name: string
  kinds: CatalogRef["kind"][]
  needs: ExternalIdSite[]
  scope: "title" | "season"
  /** Reads a connection key, saved or from the environment. */
  apiKey: boolean
  settings: { parse: (value: FulfilmentValues) => FulfilmentValues }
  parseOptions(value: FulfilmentValues): FulfilmentValues
  /**
   * The folder a set of parsed options saves titles to, as the source's
   * server names it, for finding the Matinee library they land in. A
   * source with no folders of its own leaves it out.
   */
  folder?(options: FulfilmentValues): string | null
  fields(): DescribedField[]
  test(connection: FulfilmentConnection): Promise<void>
  /**
   * The per-library choices, what a new mapping starts from (`values`),
   * and what its options for anime start from (`anime`).
   */
  options(connection: FulfilmentConnection): Promise<{
    fields: DescribedField[]
    values: FulfilmentValues
    anime: FulfilmentValues
  }>
  /** Idempotent: ensure the whole order is in place, including newly added seasons. */
  submit(
    connection: FulfilmentConnection,
    order: FulfilmentOrder,
  ): Promise<RemoteRef>
  progress?(
    connection: FulfilmentConnection,
    sent: FulfilmentSent[],
  ): Promise<FulfilmentProgress[]>
  cancel?(connection: FulfilmentConnection, ref: RemoteRef): Promise<void>
}
