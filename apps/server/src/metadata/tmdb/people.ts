import type { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { text, yearOf } from "../types"
import { image, request } from "./client"

const maybe = t.string().nullable()

/** One of someone's credits, as TMDB's combined credits list it. */
const CreditPayload = t.object({
  id: t.number(),
  media_type: t.string().optional(),
  adult: t.boolean().optional(),
  title: t.string().optional(),
  name: t.string().optional(),
  release_date: t.string().optional(),
  first_air_date: t.string().optional(),
  poster_path: t.string().nullable().optional(),
  character: t.string().nullable().optional(),
  job: t.string().nullable().optional(),
})

const PersonPayload = t.object({
  id: t.number(),
  name: t.string(),
  biography: t.string().nullable().optional(),
  birthday: t.string().nullable().optional(),
  deathday: t.string().nullable().optional(),
  known_for_department: t.string().nullable().optional(),
  profile_path: t.string().nullable().optional(),
  combined_credits: t
    .object({
      cast: t.array(CreditPayload).optional(),
      crew: t.array(CreditPayload).optional(),
    })
    .optional(),
})

const PersonCredit = t.object({
  kind: t.enum(["movie", "show"]),
  id: t.string(),
  name: t.string(),
  year: t.number().nullable(),
  poster: maybe,
  releaseDate: maybe,
  /** The character for a part, else the job. */
  role: maybe,
  crew: t.boolean(),
})

/** Someone at TMDB with every title they're credited on. */
export const PersonDetail = t.object({
  id: t.string(),
  name: t.string(),
  biography: maybe,
  birthday: maybe,
  deathday: maybe,
  /** TMDB's own name for it, like `Acting`. */
  department: maybe,
  photo: maybe,
  credits: t.array(PersonCredit),
})

function credits(
  rows: t.infer<typeof CreditPayload>[] | undefined,
  crew: boolean,
): t.infer<typeof PersonCredit>[] {
  return (rows ?? []).flatMap((row) => {
    const kind: CatalogRef["kind"] | null =
      row.media_type === "movie"
        ? "movie"
        : row.media_type === "tv"
          ? "show"
          : null
    if (!kind || row.adult) return []
    const date = text(row.release_date ?? row.first_air_date)
    return [
      {
        kind,
        id: String(row.id),
        name: row.title ?? row.name ?? "",
        year: yearOf(date),
        poster: image(row.poster_path, "w342"),
        releaseDate: date,
        // TMDB marks voice parts, which a card needn't say.
        role: text(
          crew ? row.job : row.character?.replace(/\s*\(voice\)$/i, ""),
        ),
        crew,
      },
    ]
  })
}

/**
 * Someone at TMDB and everything they're credited on. A biography TMDB
 * has only in English comes in English.
 */
export async function person(
  language: string,
  id: string,
): Promise<t.infer<typeof PersonDetail>> {
  const path = `/person/${encodeURIComponent(id)}`
  const data = PersonPayload.parse(
    await request(path, { language, append_to_response: "combined_credits" }),
  )
  let biography = text(data.biography)
  if (!biography && !language.startsWith("en")) {
    const english = PersonPayload.parse(
      await request(path, { language: "en-US" }),
    )
    biography = text(english.biography)
  }
  return {
    id: String(data.id),
    name: data.name,
    biography,
    birthday: text(data.birthday),
    deathday: text(data.deathday),
    department: text(data.known_for_department),
    photo: image(data.profile_path, "h632"),
    credits: [
      ...credits(data.combined_credits?.cast, false),
      ...credits(data.combined_credits?.crew, true),
    ],
  }
}

const SearchPayload = t.object({
  results: t.array(
    t.object({
      id: t.number(),
      adult: t.boolean().optional(),
      known_for: t
        .array(t.object({ id: t.number(), media_type: t.string().optional() }))
        .optional(),
    }),
  ),
})

export const PersonMatches = t.object({
  people: t.array(
    t.object({
      id: t.string(),
      /** A few of their titles, by `kind:id`. */
      knownFor: t.array(t.string()),
    }),
  ),
})

/** The people TMDB finds by a name, best match first, without adult ones. */
export async function searchPeople(
  language: string,
  query: string,
): Promise<t.infer<typeof PersonMatches>> {
  const data = SearchPayload.parse(
    await request("/search/person", {
      language,
      query,
      include_adult: "false",
    }),
  )
  return {
    people: data.results
      .filter((row) => !row.adult)
      .map((row) => ({
        id: String(row.id),
        knownFor: (row.known_for ?? []).flatMap((entry) =>
          entry.media_type === "movie"
            ? [`movie:${entry.id}`]
            : entry.media_type === "tv"
              ? [`show:${entry.id}`]
              : [],
        ),
      })),
  }
}
