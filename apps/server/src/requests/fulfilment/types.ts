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

/** What a title is, as override rules and anime fields look at it. */
export type TitleFacts = {
  kind: CatalogRef["kind"]
  /** TheTVDB's Anime genre, or TMDB's "anime" keyword. */
  anime: boolean
  /** TMDB genre ids. Empty when TMDB's details aren't known. */
  genres: number[]
  /** BCP 47 tag of the language it was made in, when known. */
  language: string | null
  /** TMDB keyword ids. Empty when TMDB's details aren't known. */
  keywords: number[]
}

export type FulfilmentOrder = {
  requestId: string
  ref: CatalogRef
  externalIds: Map<ExternalIdSite, string>
  name: string
  year: number | null
  scope: t.infer<typeof ShowScope> | null
  /** What `sending` and the override rules made of the connection's options. */
  options: FulfilmentValues
  /** Who asked for it first, for tagging the request with them. */
  requester: { id: string; username: string } | null
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
  /** Takes override rules. */
  rules: boolean
  /** How to reach it and how it behaves, described by `fields`. */
  settings: { parse: (value: FulfilmentValues) => FulfilmentValues }
  fields(): DescribedField[]
  /** The connection's options, as `options` describes them. Throws when one is missing. */
  parseOptions(value: FulfilmentValues): FulfilmentValues
  /**
   * The fields of its options with the choices its server offers, what a
   * new connection starts from, and the fields a rule can change.
   */
  options(connection: FulfilmentConnection): Promise<{
    fields: DescribedField[]
    values: FulfilmentValues
    rule: DescribedField[]
  }>
  /**
   * What a title is sent with, from parsed options, before any rule:
   * the anime fields for anime when they're filled, the rest otherwise.
   */
  sending(
    options: FulfilmentValues,
    title: Pick<TitleFacts, "kind" | "anime">,
  ): FulfilmentValues
  /**
   * `sending` with a rule's settings over it: those of `winner`, and the
   * tags of every rule that matched. Sources without rules leave it out.
   */
  override?(
    sending: FulfilmentValues,
    winner: FulfilmentValues,
    matched: FulfilmentValues[],
  ): FulfilmentValues
  /**
   * The folder a title sent with these is saved to, as the source's server
   * names it, for finding the Matinee library it lands in.
   */
  folder(sending: FulfilmentValues): string | null
  /** The folder a rule's settings send to, if it sets one. */
  ruleFolder?(settings: FulfilmentValues): string | null
  /** Checks a rule's settings, throwing when one isn't a choice it takes. */
  parseRule?(settings: FulfilmentValues): FulfilmentValues
  test(connection: FulfilmentConnection): Promise<void>
  /** Idempotent: ensure the whole order is in place, including newly added seasons. */
  submit(
    connection: FulfilmentConnection,
    order: FulfilmentOrder,
  ): Promise<RemoteRef>
  progress?(
    connection: FulfilmentConnection,
    sent: FulfilmentSent[],
  ): Promise<FulfilmentProgress[]>
  /** Where a person opens what `submit` made, from the connection's external URL. */
  link?(connection: FulfilmentConnection, ref: RemoteRef): string | null
  cancel?(connection: FulfilmentConnection, ref: RemoteRef): Promise<void>
}
