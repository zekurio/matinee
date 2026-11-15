import type { TitleFeaturesRow, StoredReason } from "@matinee/db"

import { keyOf } from "./keys"

/*
 * Ranks a viewer's candidates, without touching the database, so other
 * versions can be tried against the same inputs. The viewer's profile is
 * the sum of what their titles are about (genres, keywords, people,
 * companies, language, decade), each weighted by how much they liked the
 * title and how rare the token is among the candidates. A candidate
 * scores its cosine with the profile, plus a bonus for each of the
 * viewer's titles TMDB relates it to, a damped TMDB rating, a little
 * popularity, and what other people on the server liked.
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
  mmr: 0.75,
}
export const ALGORITHM = "profile-v1"
export type Seed = {
  kind: TitleFeaturesRow["kind"]
  tmdbId: string
  name: string
  score: number
}
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
function tokens(f: TitleFeaturesRow) {
  const result = new Map<string, number>()
  for (const id of f.genreIds) result.set(`genre:${id}`, WEIGHTS.genre)
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
function normalise(v: Map<string, number>) {
  const norm = Math.hypot(...v.values())
  return new Map([...v].map(([key, value]) => [key, norm ? value / norm : 0]))
}
function dot(a: Map<string, number>, b: Map<string, number>) {
  let sum = 0
  for (const [key, value] of a) sum += value * (b.get(key) ?? 0)
  return sum
}
export function scoreCandidates(
  candidates: Candidate[],
  signals: Seed[],
  features: ReadonlyMap<string, TitleFeaturesRow>,
  excluded: Set<string>,
  others: ReadonlyMap<string, number>,
) {
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
  const ranked = candidates
    .flatMap((candidate) => {
      const f = features.get(keyOf(candidate))
      if (!f || excluded.has(keyOf(candidate))) return []
      const v = normalise(vector(f))
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
              (norm.get(`person:${p.id}`) ?? 0) *
              (v.get(`person:${p.id}`) ?? 0),
          }))
          .sort((a, b) => b.contribution - a.contribution)[0]
        if (person && person.contribution > Math.max(0.05, dot(norm, v) * 0.25))
          reason = {
            kind: "person",
            personId: person.p.id,
            name: person.p.name,
          }
      }
      const score =
        dot(norm, v) +
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
    .slice(0, 300)
  // Maximal marginal relevance: each pick weighs its score against how
  // much it shares with the closest pick before it, so one franchise or
  // genre doesn't fill the row. Each candidate keeps its closest
  // similarity so far, updated against the newest pick only.
  const result: typeof ranked = []
  const closest = ranked.map(() => 0)
  while (ranked.length) {
    let best = 0
    let value = -Infinity
    for (let i = 0; i < ranked.length; i++) {
      const c = ranked[i]
      if (!c) continue
      const score =
        WEIGHTS.mmr * c.score - (1 - WEIGHTS.mmr) * (closest[i] ?? 0)
      if (score > value) {
        value = score
        best = i
      }
    }
    const [chosen] = ranked.splice(best, 1)
    closest.splice(best, 1)
    if (!chosen) break
    result.push(chosen)
    for (let i = 0; i < ranked.length; i++) {
      const c = ranked[i]
      if (c)
        closest[i] = Math.max(
          closest[i] ?? 0,
          dot(c.diversity, chosen.diversity),
        )
    }
  }
  return result.map((row, index) => ({
    ...row,
    score: result.length - index + row.score / 1000,
  }))
}
