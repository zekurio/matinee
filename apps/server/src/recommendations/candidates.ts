import { title } from "@matinee/db"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import { browseProvider, relatedProvider } from "../catalog/cache"
import { db } from "../db"
import type { DiscoverQuery } from "../metadata/tmdb/browse"
import { destinations, lookupLanguage } from "../requests/destinations"
import { featuresFor, keyOf } from "./features"
import type { Candidate, Seed, Signal } from "./score"
import { tmdbId } from "./signals"

/*
 * What the scoring job ranks for one viewer: every title they can see in
 * a library, and for the kinds they can ask for, the titles TMDB relates
 * to their best-liked ones and the titles its discover endpoint finds for
 * their genres and keywords, and for films their directors. Each
 * candidate remembers which of the viewer's titles led TMDB to it, for
 * "Because you watched".
 */

/**
 * How many of the viewer's best-liked titles of each kind lead to related
 * titles. Each kind has its own, since a show's score grows with its
 * episodes and a film's doesn't: of one list, shows would take every place.
 */
const SEEDS = 8

/** What every discover query for candidates asks: known titles, the most popular first. */
const POPULAR = {
  genres: [],
  from: null,
  to: null,
  scoreMin: null,
  scoreMax: null,
  votesMin: 100,
  ratings: null,
  language: null,
  runtimeMin: null,
  runtimeMax: null,
  sort: { by: "popularity", direction: "desc" },
} satisfies DiscoverQuery

export async function candidatesFor(
  viewer: Viewer,
  signals: (Signal & { name: string | null })[],
) {
  const candidates = new Map<string, Candidate>()
  const library = await db.select().from(title).where(visibleTitles(viewer))
  for (const row of library) {
    const id = await tmdbId(row)
    if (id)
      candidates.set(keyOf({ kind: row.kind, tmdbId: id }), {
        kind: row.kind,
        tmdbId: id,
        titleId: row.id,
        name: row.name,
        year: row.year,
        poster: null,
        releaseDate: null,
        seeds: [],
      })
  }
  // A title that left the library before signals kept names has none to
  // say "Because you watched" with, and leads nowhere.
  const liked: Seed[] = signals
    .flatMap((s) => (s.score > 0 && s.name ? [{ ...s, name: s.name }] : []))
    .sort((a, b) => b.score - a.score)
  for (const kind of ["movie", "show"] satisfies Candidate["kind"][]) {
    const seeds = liked.filter((s) => s.kind === kind).slice(0, SEEDS)
    const features = await featuresFor(seeds, true)
    const targets = await destinations(viewer, kind)
    // Titles to ask for only where the viewer can ask. Related titles
    // still mark the library's own, so they get their reason without.
    const requestable = targets.length > 0
    const language = lookupLanguage(targets)
    function add(
      row: {
        id: string
        name: string
        year: number | null
        poster: string | null
        releaseDate: string | null
      },
      seed?: Seed,
      rank = 0,
    ) {
      const ref = { kind, tmdbId: row.id }
      const key = keyOf(ref)
      let value = candidates.get(key)
      if (!value) {
        if (!requestable) return
        value = {
          ...ref,
          titleId: null,
          name: row.name,
          year: row.year,
          poster: row.poster,
          releaseDate: row.releaseDate,
          seeds: [],
        }
        candidates.set(key, value)
      }
      if (seed && !value.seeds.some((s) => keyOf(s.seed) === keyOf(seed)))
        value.seeds.push({ seed, rank })
    }
    for (const seed of seeds) {
      const related = (await relatedProvider(kind, language, seed.tmdbId)).value
      ;[...related.recommendations, ...related.similar].forEach((row, rank) =>
        add(row, seed, rank),
      )
    }
    if (!requestable) continue
    const genres = new Map<number, number>(),
      keywords = new Map<number, number>(),
      people = new Map<string, number>()
    for (const seed of seeds) {
      const f = features.get(keyOf(seed))
      if (!f) continue
      for (const id of f.genreIds)
        genres.set(id, (genres.get(id) ?? 0) + seed.score)
      for (const id of f.keywordIds)
        keywords.set(id, (keywords.get(id) ?? 0) + seed.score)
      for (const p of f.people.filter((p) => p.role === "director"))
        people.set(p.id, (people.get(p.id) ?? 0) + seed.score)
    }
    const top = <T>(map: Map<T, number>, n: number) =>
      [...map]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id]) => id)
    // TMDB takes a title only if it passes every filter of a query, so
    // each query asks for one thing: the viewer's genres and keywords
    // together are what they watch, and a director's films are theirs
    // whatever they're about. All three at once match next to nothing.
    const queries: { query: DiscoverQuery; pages: number }[] = []
    if (genres.size || keywords.size)
      queries.push({
        query: {
          ...POPULAR,
          genres: top(genres, 3),
          genreOr: true,
          keywords: top(keywords, 5),
        },
        pages: 2,
      })
    if (kind === "movie" && people.size)
      queries.push({
        query: { ...POPULAR, people: top(people, 2) },
        pages: 1,
      })
    for (const { query, pages } of queries)
      for (let page = 1; page <= pages; page++) {
        const result = await browseProvider(kind, language, query, page)
        for (const row of result.value.items) add(row)
        if (!result.value.nextPage) break
      }
  }
  return [...candidates.values()]
}
