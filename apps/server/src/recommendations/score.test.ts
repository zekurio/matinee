import assert from "node:assert/strict"
import { test } from "node:test"

import type { TitleFeaturesRow } from "@matinee/db"

import { keyOf } from "./keys"
import { diversify, rankCandidates, type Candidate, type Signal } from "./score"

/*
 * The scorer against a made-up catalog, small enough to read: a viewer
 * who watched crime thrillers, and candidates that share more or less
 * with them. Each test names a way a ranking went wrong before, so a
 * change to the weights that brings one back fails here. It says nothing
 * of how a list reads to a real viewer; that takes real impressions.
 */

const CRIME = 80
const THRILLER = 53
const SCIENCE_FICTION = 878
/** TMDB's show genres for science fiction and for reality shows. */
const SHOW_SCI_FI = 10765
const SHOW_REALITY = 10764
/** Film genres the viewer never watched. */
const OTHER_GENRES = [12, 16, 35, 99, 10751, 36, 27, 10402, 10749, 37]

type Kind = Candidate["kind"]

/** A catalog of titles and a counter for ids, with a seeded generator so every run is the same. */
function catalog() {
  let seed = 7
  let nextId = 1
  let nextPerson = 100000
  const features = new Map<string, TitleFeaturesRow>()
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const pick = <T>(from: readonly T[], count: number) => {
    const left = [...from]
    const picked: T[] = []
    while (picked.length < count && left.length)
      picked.push(...left.splice(Math.floor(random() * left.length), 1))
    return picked
  }
  const range = (start: number, count: number) =>
    Array.from({ length: count }, (_, index) => start + index)
  /** A director and eight of the cast, nobody anyone else has. */
  const credits = () => [
    { id: String(nextPerson++), name: "Director", role: "director" as const },
    ...range(0, 8).map(() => ({
      id: String(nextPerson++),
      name: "Actor",
      role: "actor" as const,
    })),
  ]
  const add = (kind: Kind, row: Partial<TitleFeaturesRow>) => {
    const tmdbId = String(nextId++)
    features.set(keyOf({ kind, tmdbId }), {
      kind,
      tmdbId,
      genreIds: [],
      keywordIds: [],
      people: [],
      companyIds: [],
      originalLanguage: "en",
      year: 2010,
      runtimeMinutes: 110,
      ratings: [],
      rating: 6.8,
      votes: 2000,
      popularity: 20,
      fetchedAt: new Date(0),
      ...row,
    })
    return { kind, tmdbId }
  }
  return { features, pick, range, credits, add }
}

/** What the viewer's crime thrillers are about, and everything else. */
const CRIME_KEYWORDS = Array.from({ length: 60 }, (_, index) => 1000 + index)
const SERIES_KEYWORDS = Array.from({ length: 14 }, (_, index) => 900 + index)
const OTHER_KEYWORDS = Array.from({ length: 4000 }, (_, index) => 5000 + index)

function candidate(ref: { kind: Kind; tmdbId: string }): Candidate {
  return {
    ...ref,
    titleId: `title-${ref.tmdbId}`,
    name: ref.tmdbId,
    year: null,
    poster: null,
    releaseDate: null,
    seeds: [],
  }
}

/** The viewer and the candidates every test ranks. */
function fixture() {
  const { features, pick, range, credits, add } = catalog()
  const watched = range(0, 25).map(() =>
    add("movie", {
      genreIds: [CRIME, THRILLER, SCIENCE_FICTION],
      keywordIds: [
        ...pick(CRIME_KEYWORDS, 12),
        ...pick(SERIES_KEYWORDS, 4),
        ...pick(OTHER_KEYWORDS, 4),
      ],
      people: credits(),
    }),
  )
  const groups = {
    // Ten films of one series: all its keywords, so they score alike and highest.
    series: range(0, 10).map(() =>
      add("movie", {
        genreIds: [CRIME, THRILLER],
        keywordIds: [...SERIES_KEYWORDS, ...pick(CRIME_KEYWORDS, 4)],
        people: credits(),
      }),
    ),
    // Well described, sharing three of eighteen keywords with what was watched.
    described: range(0, 100).map(() =>
      add("movie", {
        genreIds: [CRIME, THRILLER],
        keywordIds: [...pick(CRIME_KEYWORDS, 3), ...pick(OTHER_KEYWORDS, 15)],
        people: credits(),
      }),
    ),
    // The same genres and nothing else known, as TMDB has an obscure title.
    bare: range(0, 60).map(() => add("movie", { genreIds: [CRIME, THRILLER] })),
    sciFiShows: range(0, 30).map(() =>
      add("show", {
        genreIds: [SHOW_SCI_FI],
        keywordIds: pick(OTHER_KEYWORDS, 10),
        people: credits(),
      }),
    ),
    realityShows: range(0, 30).map(() =>
      add("show", {
        genreIds: [SHOW_REALITY],
        keywordIds: pick(OTHER_KEYWORDS, 10),
        people: credits(),
      }),
    ),
    unrelated: range(0, 600).map(() =>
      add("movie", {
        genreIds: pick(OTHER_GENRES, 2),
        keywordIds: pick(OTHER_KEYWORDS, 15),
        people: credits(),
      }),
    ),
  }
  const signals: Signal[] = watched.map((ref) => ({ ...ref, score: 0.7 }))
  const candidates = Object.values(groups).flat().map(candidate)
  const ranked = rankCandidates(
    candidates,
    signals,
    features,
    new Set(signals.map(keyOf)),
    new Map(),
  )
  const keys = (refs: { kind: Kind; tmdbId: string }[]) =>
    new Set(refs.map(keyOf))
  return {
    features,
    signals,
    candidates,
    ranked,
    series: keys(groups.series),
    described: keys(groups.described),
    bare: keys(groups.bare),
    sciFiShows: keys(groups.sciFiShows),
    realityShows: keys(groups.realityShows),
    unrelated: keys(groups.unrelated),
  }
}

/** The places in `rows`, from 0, of the titles in `group`. */
function places(
  rows: { kind: Kind; tmdbId: string }[],
  group: ReadonlySet<string>,
) {
  return rows.flatMap((row, index) => (group.has(keyOf(row)) ? [index] : []))
}
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

void test("a well described title that shares keywords outranks one known only by its genres", () => {
  const { ranked, described, bare } = fixture()
  // A cosine with the profile ranked the bare titles first: every keyword
  // a title has that the viewer hasn't met counted against it.
  assert.ok(
    Math.max(...places(ranked, described)) < Math.min(...places(ranked, bare)),
  )
})

void test("matching genres alone still outranks matching nothing", () => {
  const { ranked, bare, unrelated } = fixture()
  assert.ok(mean(places(ranked, bare)) < mean(places(ranked, unrelated)))
})

void test("a film watcher's genres count for the shows TMDB numbers apart", () => {
  const { ranked, sciFiShows, realityShows } = fixture()
  // Science fiction is 878 for a film and 10765 for a show.
  assert.ok(
    Math.max(...places(ranked, sciFiShows)) <
      Math.min(...places(ranked, realityShows)),
  )
})

void test("the titles the viewer watched or dismissed are left out", () => {
  const { ranked, signals } = fixture()
  const watched = new Set(signals.map(keyOf))
  assert.equal(ranked.filter((row) => watched.has(keyOf(row))).length, 0)
})

void test("one series doesn't fill the top of a list", () => {
  const { ranked, series } = fixture()
  // By score alone the series takes the first ten places.
  assert.deepEqual(
    places(ranked, series),
    Array.from({ length: 10 }, (_, index) => index),
  )
  const list = diversify(ranked, 100)
  assert.equal(list[0], ranked[0])
  assert.ok(places(list.slice(0, 20), series).length <= 2)
  // The rest wait, and still make the list.
  assert.equal(places(list, series).length, 10)
})

void test("a list keeps to the best titles, in nearly their order", () => {
  const { ranked, described, series } = fixture()
  const list = diversify(ranked, 100)
  assert.equal(list.length, 100)
  // Likeness moves a title a few places. It never brings one in from the
  // far end of the pool ahead of the titles that suit the viewer.
  const place = new Map(ranked.map((row, index) => [keyOf(row), index]))
  const top = list.slice(0, 20).map((row) => place.get(keyOf(row)) ?? Infinity)
  assert.ok(Math.max(...top) < 40)
  assert.equal(
    list.filter((row) => described.has(keyOf(row)) || series.has(keyOf(row)))
      .length,
    100,
  )
})

void test("a viewer with a very long history is still ranked", () => {
  const { features, candidates } = fixture()
  // 2,500 titles of 80 keywords nobody shares: 200,000 tokens in the
  // profile, more than a call can take as arguments.
  const signals: Signal[] = []
  for (let index = 0; index < 2500; index++) {
    const tmdbId = `long-${index}`
    features.set(keyOf({ kind: "movie", tmdbId }), {
      kind: "movie",
      tmdbId,
      genreIds: [CRIME],
      keywordIds: Array.from(
        { length: 80 },
        (_, keyword) => 1_000_000 + index * 80 + keyword,
      ),
      people: [],
      companyIds: [],
      originalLanguage: "en",
      year: 2010,
      runtimeMinutes: 110,
      ratings: [],
      rating: 6.8,
      votes: 2000,
      popularity: 20,
      fetchedAt: new Date(0),
    })
    signals.push({ kind: "movie", tmdbId, score: 0.5 })
  }
  const ranked = rankCandidates(
    candidates,
    signals,
    features,
    new Set(),
    new Map(),
  )
  assert.equal(ranked.length, candidates.length)
})
