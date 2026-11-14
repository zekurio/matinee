import type {
  CatalogRef,
  PersonCatalogCredit,
  PersonDepartment,
  PersonProfile,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"

import type { Viewer } from "../access/viewer"
import { env } from "../env"
import { saveArtwork } from "../media/artwork"
import type { PersonDetail } from "../metadata/tmdb/people"
import { uniqueNames } from "../metadata/types"
import { destinations, lookupLanguage } from "../requests/destinations"
import { personProvider, personSearchProvider } from "./cache"
import { catalogCards } from "./cards"

/*
 * A person's page from TMDB: who they are, and the titles they're in that
 * no library the viewer sees has, to request. Library credits are kept by
 * name, so a person is found at TMDB by an id a TMDB credit carries, or by
 * a name that shares a title with their credits here.
 */

/** A title one of their library credits is on, by the ids it's known by. */
export type CreditedTitle = {
  kind: CatalogRef["kind"]
  provider: string | null
  providerId: string | null
  externalIds: Record<string, string>
  /** The person's id at the title's provider. */
  personId: string | null
}

type Detail = t.infer<typeof PersonDetail>

const DEPARTMENTS = new Map<string, PersonDepartment>([
  ["Acting", "acting"],
  ["Directing", "directing"],
  ["Writing", "writing"],
  ["Creator", "creator"],
  ["Production", "production"],
  ["Editing", "editing"],
  ["Camera", "camera"],
  ["Sound", "sound"],
  ["Art", "art"],
  ["Costume & Make-Up", "costume"],
  ["Visual Effects", "visualEffects"],
  ["Lighting", "lighting"],
  ["Crew", "crew"],
])

// Candidates whose credits are read to tell namesakes apart.
const MAX_CANDIDATES = 3

/** A title's TMDB id with its kind, as `kind:id`. */
function tmdbKey(kind: CatalogRef["kind"], id: string) {
  return `${kind}:${id}`
}

/**
 * The TMDB id a TMDB title's credit gives them, the most common if
 * namesakes share the name.
 */
function creditedId(titles: CreditedTitle[]): string | null {
  const tally = new Map<string, number>()
  for (const row of titles) {
    if (row.provider === "tmdb" && row.personId)
      tally.set(row.personId, (tally.get(row.personId) ?? 0) + 1)
  }
  return [...tally.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * The person TMDB finds by the name who shares a title with the credits
 * here: by the few titles the search names, else by the credits of the
 * best matches. Null rather than a namesake.
 */
async function searchedId(
  language: string,
  name: string,
  titles: CreditedTitle[],
): Promise<string | null> {
  const owned = new Set(
    titles.flatMap((row) => {
      const id = row.provider === "tmdb" ? row.providerId : row.externalIds.tmdb
      return id ? [tmdbKey(row.kind, id)] : []
    }),
  )
  if (owned.size === 0) return null
  const found = (await personSearchProvider(language, name)).value
  const known = found.find((entry) =>
    entry.knownFor.some((key) => owned.has(key)),
  )
  if (known) return known.id
  for (const entry of found.slice(0, MAX_CANDIDATES)) {
    const detail = (await personProvider(language, entry.id)).value
    if (detail.credits.some((row) => owned.has(tmdbKey(row.kind, row.id))))
      return entry.id
  }
  return null
}

/** Each title once, with every part and then every job in it. */
function merged(detail: Detail) {
  const titles = new Map<
    string,
    { row: Detail["credits"][number]; parts: string[]; jobs: string[] }
  >()
  for (const row of detail.credits) {
    const key = tmdbKey(row.kind, row.id)
    const entry = titles.get(key) ?? { row, parts: [], jobs: [] }
    if (row.role) (row.crew ? entry.jobs : entry.parts).push(row.role)
    titles.set(key, entry)
  }
  return [...titles.values()].map((entry) => {
    const parts = uniqueNames(entry.parts).join(" / ")
    const jobs = uniqueNames(entry.jobs).join(", ")
    return {
      ...entry.row,
      role: [parts, jobs].filter(Boolean).join(", ") || null,
    }
  })
}

/**
 * Newest first, the undated last, and any without a poster after all of
 * those: mostly announced projects, which would open the grid with blank
 * cards.
 */
function newestFirst(
  a: { releaseDate: string | null; name: string; poster: string | null },
  b: { releaseDate: string | null; name: string; poster: string | null },
) {
  return (
    Number(!a.poster) - Number(!b.poster) ||
    Number(!a.releaseDate) - Number(!b.releaseDate) ||
    (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") ||
    a.name.localeCompare(b.name)
  )
}

export type TmdbPerson = {
  profile: PersonProfile
  /** The portrait's artwork id. */
  photoId: string | null
  catalog: PersonCatalogCredit[]
  stale: boolean
}

/**
 * The person at TMDB, by `tmdbId` or as matched from their library
 * credits, and their titles the viewer could request. Null without a
 * key, for a viewer with nowhere to request into, and without a match.
 */
export async function tmdbPerson(
  viewer: Viewer,
  input: { name: string; tmdbId?: string; titles: CreditedTitle[] },
): Promise<TmdbPerson | null> {
  if (!env.MATINEE_TMDB_API_KEY) return null
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  if (!movies.length && !shows.length) return null
  const language = lookupLanguage([...movies, ...shows])
  const id =
    input.tmdbId ??
    creditedId(input.titles) ??
    (await searchedId(language, input.name, input.titles))
  if (!id) return null
  const read = await personProvider(language, id)
  const detail = read.value
  const kinds = new Set<CatalogRef["kind"]>()
  if (movies.length) kinds.add("movie")
  if (shows.length) kinds.add("show")
  const rows = merged(detail).filter((row) => kinds.has(row.kind))
  const cards = (
    await Promise.all(
      [...kinds].map((kind) =>
        catalogCards(
          viewer,
          kind,
          rows.filter((row) => row.kind === kind),
        ),
      ),
    )
  ).flat()
  const catalog = cards
    // A title here is in the library grid, or the person isn't on it
    // there; a declined one nobody can request.
    .filter(
      ({ card }) =>
        card.availability.state !== "here" &&
        card.availability.state !== "unavailable",
    )
    .toSorted((a, b) => newestFirst(a.row, b.row))
    .map(({ row, card }) => ({
      ref: card.ref,
      name: card.name,
      year: card.year,
      poster: card.poster,
      availability: card.availability,
      role: row.role,
    }))
  const photo = detail.photo
    ? ((await saveArtwork([detail.photo])).get(detail.photo) ?? null)
    : null
  return {
    profile: {
      tmdbId: detail.id,
      knownFor: DEPARTMENTS.get(detail.department ?? "") ?? null,
      birthday: detail.birthday,
      deathday: detail.deathday,
      biography: detail.biography,
    },
    photoId: photo,
    catalog,
    stale: read.stale,
  }
}
