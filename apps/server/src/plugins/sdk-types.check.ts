import {
  PluginEventSchemas,
  type PluginEvents,
  type PluginEventMeta,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import type { ExternalIds } from "@matinee/db"
import type * as SDK from "@matinee/plugin"

import type * as Metadata from "../metadata/types"

/** Every event schema must produce the SDK payload, and the reverse check forbids extra required fields. */
export const sdkEventSchemas = PluginEventSchemas satisfies {
  [K in SDK.PluginEventName]: t.Type<SDK.PluginEvents[K]>
}
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export const sdkTypesAgree = {
  events: true,
  eventMeta: true,
  candidate: true,
  title: true,
  season: true,
  episode: true,
  credit: true,
  scope: true,
  image: true,
  query: true,
  lookup: true,
  externalIds: true,
} satisfies {
  events: Equal<PluginEvents, SDK.PluginEvents>
  // The signal is made inside the sandbox and never crosses the boundary.
  eventMeta: Equal<PluginEventMeta, Omit<SDK.PluginEventMeta, "signal">>
  candidate: Equal<Metadata.Candidate, SDK.Candidate>
  title: Equal<Metadata.TitleDetails, SDK.TitleDetails>
  season: Equal<Metadata.SeasonDetails, SDK.SeasonDetails>
  episode: Equal<Metadata.EpisodeDetails, SDK.EpisodeDetails>
  credit: Equal<Metadata.CreditDetails, SDK.CreditDetails>
  scope: Equal<Metadata.ImageScope, SDK.ImageScope>
  image: Equal<Metadata.ImageCandidate, SDK.ImageCandidate>
  query: Equal<Metadata.SearchQuery, SDK.SearchQuery>
  lookup: Equal<Metadata.Lookup, SDK.Lookup>
  externalIds: Equal<ExternalIds, SDK.ExternalIds>
}
