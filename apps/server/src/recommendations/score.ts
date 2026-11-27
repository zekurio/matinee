import type { TitleFeaturesRow, StoredReason } from "@matinee/db"

import { keyOf } from "./keys"

/*
 * Ranks a viewer's candidates, without touching the database, so other
 * versions can be tried against the same inputs. The viewer's profile is
 * the sum of what their titles are about (genres, keywords, people,
 * companies, language, decade), each weighted by how much they liked the
 * title and how rare the token is among the candidates. A candidate
 * scores how much of the profile it shares, for its length, plus a bonus
 * for each of the viewer's titles TMDB relates it to, a damped TMDB
 * rating, a little popularity, and what other people on the server
 * liked. `diversify` then picks a list from the best of them.
 */

/** Every weight scoring uses, in one place to tune. */
export const WEIGHTS = {
  keyword: 1.5,
  person: 2,
  genre: 1,
  actor: 0.7,
  company: 0.5,
  language: 0.5,
  decade: 0.3,
  negative: 0.5,
  seed: 0.08,
  quality: 0.08,
  popularity: 0.01,
  collaborative: 0.02,
  /**
   * How much a candidate's own length counts against it, from 0 to 1. At
   * 1 its score is its cosine with the profile, which every keyword and
   * credit the viewer hasn't met lowers, so a title TMDB knows only the
   * genres of outranks a well described one that shares more. At 0 the
   * longest description wins. Between, a title is measured against the
   * average length as much as its own.
   */
  length: 0.3,
  /** The share of a pick that is its score; the rest is how unlike the picks before it it is. */
  mmr: 0.75,
}
export const ALGORITHM = "profile-v2"

/** How many times the list's length `diversify` picks from. */
const POOL = 3

/**
 * TMDB numbers a show's genres apart from a film's. These are the film
 * genres each of a show's stands for, so one profile reads both kinds.
 * The others are shared, or a show's alone.
 */
const SHOW_GENRES = new Map<number, number[]>([
  // Action & Adventure
  [10759, [28, 12]],
  // Kids, as Family
  [10762, [10751]],
  // Sci-Fi & Fantasy
  [10765, [878, 14]],
  // War & Politics, as War
  [10768, [10752]],
])

/** A title the viewer played, and how much they liked it. */
export type Signal = {
  kind: TitleFeaturesRow["kind"]
  tmdbId: string
  score: number
}
/** A liked title that leads to others, named for "Because you watched". */
export type Seed = Signal & { name: string }
export type Candidate = {
  kind: TitleFeaturesRow["kind"]
  tmdbId: string
  titleId: string | null
  name: string
  year: number | null
  poster: string | null
  releaseDate: string | null
  seeds: { seed: Seed; rank: number }[]
}
export type Ranked = Candidate & {
  score: number
  reason: StoredReason
  /** Its genres and keywords at unit length, for telling how alike two picks are. */
  diversity: Map<string, number>
}

function tokens(f: TitleFeaturesRow) {
  const result = new Map<string, number>()
  for (const id of f.genreIds) {
    const genres = (f.kind === "show" && SHOW_GENRES.get(id)) || [id]
    // A genre that stands for two weighs as much as one, between them.
    const weight = WEIGHTS.genre / Math.sqrt(genres.length)
    for (const genre of genres)
      result.set(
        `genre:${genre}`,
        Math.max(result.get(`genre:${genre}`) ?? 0, weight),
      )
  }
  for (const id of f.keywordIds) result.set(`keyword:${id}`, WEIGHTS.keyword)
  for (const p of f.people)
    result.set(
      `person:${p.id}`,
      Math.max(
        result.get(`person:${p.id}`) ?? 0,
        p.role === "actor" ? WEIGHTS.actor : WEIGHTS.person,
      ),
    )
  for (const id of f.companyIds) result.set(`company:${id}`, WEIGHTS.company)
  if (f.originalLanguage)
    result.set(`language:${f.originalLanguage}`, WEIGHTS.language)
  if (f.year) result.set(`decade:${Math.floor(f.year / 10)}`, WEIGHTS.decade)
  return result
}
/** A vector's length. A loop, since a long profile overflows a spread into `Math.hypot`. */
function lengthOf(v: Map<string, number>) {
  let sum = 0
  for (const value of v.values()) sum += value * value
  return Math.sqrt(sum)
}
function normalise(v: Map<string, number>) {
  const length = lengthOf(v)
  return new Map(
    [...v].map(([key, value]) => [key, length ? value / length : 0]),
  )
}
function dot(a: Map<string, number>, b: Map<string, number>) {
  let sum = 0
  for (const [key, value] of a) sum += value * (b.get(key) ?? 0)
  return sum
}

/**
 * Every candidate with features that isn't `excluded`, scored against
 * the profile `signals` make, best first.
 */
export function rankCandidates(
  candidates: Candidate[],
  signals: Signal[],
  features: ReadonlyMap<string, TitleFeaturesRow>,
  excluded: Set<string>,
  others: ReadonlyMap<string, number>,
): Ranked[] {
  const frequencies = new Map<string, number>()
  for (const c of candidates) {
    const f = features.get(keyOf(c))
    if (f)
      for (const token of tokens(f).keys())
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  }
  function vector(f: TitleFeaturesRow) {
    return new Map(
      [...tokens(f)].map(([token, value]) => [
        token,
        value *
          (1 +
            Math.log(
              (1 + candidates.length) / (1 + (frequencies.get(token) ?? 0)),
            )),
      ]),
    )
  }
  const profile = new Map<string, number>()
  for (const signal of signals) {
    const f = features.get(keyOf(signal))
    if (!f) continue
    for (const [token, value] of vector(f))
      profile.set(
        token,
        (profile.get(token) ?? 0) +
          value * signal.score * (signal.score < 0 ? WEIGHTS.negative : 1),
      )
  }
  const norm = normalise(profile)
  const described = candidates.flatMap((candidate) => {
    const f = features.get(keyOf(candidate))
    if (!f) return []
    const v = vector(f)
    return [{ candidate, f, v, length: lengthOf(v) }]
  })
  const average =
    described.reduce((sum, row) => sum + row.length, 0) /
    Math.max(1, described.length)
  return described
    .flatMap(({ candidate, f, v, length }) => {
      if (excluded.has(keyOf(candidate))) return []
      const size = (1 - WEIGHTS.length) * average + WEIGHTS.length * length || 1
      const taste = dot(norm, v) / size
      let reason: StoredReason = { kind: "taste" }
      const seeds = [...candidate.seeds].sort(
        (a, b) => b.seed.score / (1 + b.rank) - a.seed.score / (1 + a.rank),
      )
      const seed = seeds[0]?.seed
      if (seed)
        reason = {
          kind: "watched",
          seed: { kind: seed.kind, tmdbId: seed.tmdbId, name: seed.name },
        }
      else {
        const person = f.people
          .map((p) => ({
            p,
            contribution:
              ((norm.get(`person:${p.id}`) ?? 0) *
                (v.get(`person:${p.id}`) ?? 0)) /
              size,
          }))
          .sort((a, b) => b.contribution - a.contribution)[0]
        if (person && person.contribution > Math.max(0.05, taste * 0.25))
          reason = {
            kind: "person",
            personId: person.p.id,
            name: person.p.name,
          }
      }
      const score =
        taste +
        seeds.reduce(
          (sum, s) => sum + (WEIGHTS.seed * s.seed.score) / (1 + s.rank),
          0,
        ) +
        (WEIGHTS.quality * ((f.rating ?? 5) * f.votes + 500)) /
          (f.votes + 100) /
          10 +
        WEIGHTS.popularity * Math.log1p(f.popularity) +
        WEIGHTS.collaborative * Math.log1p(others.get(keyOf(candidate)) ?? 0)
      const diversity = normalise(
        new Map(
          [...tokens(f)].filter(
            ([key]) => key.startsWith("genre:") || key.startsWith("keyword:"),
          ),
        ),
      )
      return [{ ...candidate, score, reason, diversity }]
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * A list of up to `keep` from the best of `rows`, which come best first,
 * by maximal marginal relevance: each pick weighs its score against how
 * much it shares with the closest pick before it, so one franchise or
 * genre doesn't fill the row. A title's score counts by its place among
 * the titles picked from, from 1 for the best to 0 for the last, so the
 * likeness, also 0 to 1, weighs the same against it whatever the scores
 * are: with `WEIGHTS.mmr` at 0.75, a title just like a pick waits a
 * third of the pool, and one a tenth alike a thirtieth. The lists a
 * viewer sees apart are picked apart, so a title to ask for isn't moved
 * for one on the server that it's never shown beside.
 */
export function diversify<T extends Pick<Ranked, "diversity">>(
  rows: T[],
  keep: number,
): T[] {
  const pool = rows.slice(0, keep * POOL)
  const relevance = pool.map((_, index) =>
    pool.length > 1 ? 1 - index / (pool.length - 1) : 1,
  )
  // Each title's likeness to its closest pick so far, updated against
  // the newest pick only.
  const closest = pool.map(() => 0)
  const taken = pool.map(() => false)
  const result: T[] = []
  while (result.length < Math.min(keep, pool.length)) {
    let best = -1
    let value = -Infinity
    for (let i = 0; i < pool.length; i++) {
      if (taken[i]) continue
      const score =
        WEIGHTS.mmr * (relevance[i] ?? 0) -
        (1 - WEIGHTS.mmr) * (closest[i] ?? 0)
      if (score > value) {
        value = score
        best = i
      }
    }
    const chosen = pool[best]
    if (!chosen) break
    taken[best] = true
    result.push(chosen)
    for (let i = 0; i < pool.length; i++) {
      const row = pool[i]
      if (row && !taken[i])
        closest[i] = Math.max(
          closest[i] ?? 0,
          dot(row.diversity, chosen.diversity),
        )
    }
  }
  return result
}
