import type { PluginMetadataContribution } from "@matinee/contracts"
import { CreditKind, ImageSlot } from "@matinee/contracts"
import { SchemaError, t } from "@matinee/contracts/schema"
import type { JsonValue } from "@matinee/db"

import { log } from "../log"
import type { Running } from "../plugins"
import { SandboxError } from "../plugins/sandbox"
import {
  type Candidate,
  type ImageCandidate,
  isoDate,
  type MetadataSource,
  ProviderError,
  type TitleDetails,
} from "./types"

const Id = t.string().trim().min(1).max(256)
const Name = t.string().trim().min(1).max(500)
const OptionalName = Name.nullable().catch(null)
const Overview = t.string().max(20_000).nullable().catch(null)
const Year = t.number().int().min(1800).max(2200).nullable().catch(null)
const Numbering = t.number().int().min(0).max(100_000)
const Runtime = t.number().min(0).max(100_000).nullable().catch(null)
const DateText = t.string().max(64).nullable().catch(null).transform(isoDate)
const ExternalIds = t
  .record(t.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), Id)
  .refine((ids) => Object.keys(ids).length <= 16, "At most 16 external ids")
const LookupResult = Id.nullable() satisfies t.Type<string | null>

/** Parse each call separately so rejected image counts belong to that call. */
function resultSchemas(running: Running<PluginMetadataContribution>) {
  let dropped = 0
  const ImageUrl = t.preprocess((value) => {
    if (value === null || value === undefined) return null
    const parsed = t.string().max(2048).url().safeParse(value)
    if (
      parsed.success &&
      new URL(parsed.data).protocol === "https:" &&
      running.allows(parsed.data)
    )
      return parsed.data
    dropped++
    return null
  }, t.string().nullable())
  const CandidateResult = t.object({
    id: Id,
    name: Name,
    aliases: t.array(Name).max(200),
    year: Year,
    overview: Overview,
    poster: ImageUrl,
  }) satisfies t.Type<Candidate>
  const Candidates = t.array(CandidateResult).max(50) satisfies t.Type<
    Candidate[]
  >
  const Details = t.object({
    id: Id,
    name: Name,
    originalName: OptionalName,
    originalLanguage: t.string().max(64).nullable().catch(null),
    year: Year,
    overview: Overview,
    tagline: OptionalName,
    genres: t.array(Name).max(200),
    rating: t.number().min(0).max(10).nullable().catch(null),
    contentRating: OptionalName,
    releaseDate: DateText,
    status: OptionalName,
    runtimeMinutes: Runtime,
    externalIds: ExternalIds,
    images: t.object({ poster: ImageUrl, backdrop: ImageUrl, logo: ImageUrl }),
    studios: t.array(Name).max(200),
    credits: t
      .array(
        t.object({
          kind: CreditKind,
          name: Name,
          role: OptionalName,
          personId: Id.nullable().catch(null),
          photo: ImageUrl,
        }),
      )
      .max(500),
    seasons: t
      .array(
        t.object({
          number: Numbering,
          overview: Overview,
          poster: ImageUrl,
        }),
      )
      .max(100),
    episodes: t
      .array(
        t.object({
          season: Numbering,
          episode: Numbering,
          name: OptionalName,
          overview: Overview,
          airDate: DateText,
          runtimeMinutes: Runtime,
          still: ImageUrl,
        }),
      )
      .max(10_000),
  }) satisfies t.Type<TitleDetails>
  // A missing usable full URL drops the candidate, not the other images.
  const Images = t
    .array(
      t.object({
        slot: ImageSlot,
        url: ImageUrl,
        preview: ImageUrl,
        width: Numbering.nullable().catch(null),
        height: Numbering.nullable().catch(null),
        language: t.string().max(64).nullable().catch(null),
        score: t.number().min(0).max(10).catch(0),
        votes: t.number().int().min(0).max(1_000_000_000).catch(0),
      }),
    )
    .max(500)
    .transform((images) =>
      images.flatMap((image) =>
        image.url === null ? [] : [{ ...image, url: image.url }],
      ),
    ) satisfies t.Type<ImageCandidate[]>
  return {
    Candidates,
    Details,
    Images,
    report() {
      if (dropped)
        log.debug(
          `${running.pluginName}: dropped ${dropped} image URLs outside its HTTPS grant`,
        )
    },
  }
}

/** A running contribution only, never retained after its plugin stops. */
export function pluginSource(
  running: Running<PluginMetadataContribution>,
): MetadataSource {
  const { contribution } = running
  async function call(method: string, args: JsonValue[], timeoutMs: number) {
    try {
      return await running.call(method, args, { timeoutMs })
    } catch (cause) {
      if (!(cause instanceof SandboxError)) throw cause
      if (
        cause.kind === "protocol" &&
        (cause.message.startsWith("Unknown sandbox handler:") ||
          cause.message ===
            `Plugin ${running.pluginId} doesn't provide metadata.${contribution.id}.${method}`) &&
        (method === "lookup" || method === "images")
      ) {
        return method === "lookup" ? null : []
      }
      const message =
        cause.kind === "guest" || cause.status !== null
          ? cause.message.slice(0, 300)
          : `${running.pluginName}: ${cause.kind === "timeout" ? "request timed out" : cause.kind === "limit" ? "sandbox limit exceeded" : cause.kind === "crashed" ? "plugin stopped" : "invalid sandbox response"}`
      throw new ProviderError(message, cause.status)
    }
  }
  function invalid(cause: unknown): never {
    const issue =
      cause instanceof SchemaError
        ? `${cause.issues[0]?.path.join(".") || "result"}: ${cause.message.slice(0, 300)}`
        : cause instanceof Error
          ? cause.message.slice(0, 300)
          : "Invalid result"
    throw new ProviderError(`${running.pluginName}: ${issue}`)
  }
  return {
    id: contribution.id,
    name: contribution.name,
    description: contribution.description ?? "",
    kinds: contribution.kinds,
    episodes: contribution.episodes,
    setup: null,
    configured: () => true,
    async search(query) {
      const result = await call("search", [query], 30_000)
      const schemas = resultSchemas(running)
      try {
        return schemas.Candidates.parse(result)
      } catch (cause) {
        return invalid(cause)
      } finally {
        schemas.report()
      }
    },
    async lookup(ids, lookup) {
      const result = await call("lookup", [ids, lookup], 30_000)
      try {
        return LookupResult.parse(result)
      } catch (cause) {
        return invalid(cause)
      }
    },
    async details(id, lookup) {
      const result = await call("details", [id, lookup], 60_000)
      const schemas = resultSchemas(running)
      try {
        const details = schemas.Details.parse(result)
        // Never accept the plugin's claimed id for its own provider.
        const otherIds = Object.entries(details.externalIds).filter(
          ([key]) => key !== contribution.id,
        )
        details.externalIds = {
          ...Object.fromEntries(otherIds.slice(0, 15)),
          [contribution.id]: details.id,
        }
        return details
      } catch (cause) {
        return invalid(cause)
      } finally {
        schemas.report()
      }
    },
    async images(id, lookup, scope) {
      const result = await call("images", [id, lookup, scope], 60_000)
      const schemas = resultSchemas(running)
      try {
        return schemas.Images.parse(result)
      } catch (cause) {
        return invalid(cause)
      } finally {
        schemas.report()
      }
    },
  }
}
