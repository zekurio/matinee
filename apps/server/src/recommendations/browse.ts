import type { CatalogBrowsePage } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import {
  recommendation,
  title,
  titleFeatures,
  type RecommendationRow,
  type TitleFeaturesRow,
} from "@matinee/db"
import { and, desc, eq, isNull, or } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import type { BrowseInput } from "../catalog/browse"
import { askable, catalogCards } from "../catalog/cards"
import { db } from "../db"
import type { DiscoverQuery } from "../metadata/tmdb/browse"
import { impressions, notDismissed } from "./read"

/*
 * Browsing the viewer's stored recommendations of one kind, with the
 * filters and sorts TMDB's catalog takes, checked against each title's
 * features. Titles on the server are among them, as the library's
 * cards, unless the browse is only of titles to ask for.
 */

const PAGE = 20

type Row = { row: RecommendationRow; features: TitleFeaturesRow | null }

/** Whether a title passes the filters TMDB would check, read from its features. */
function passes({ row, features: f }: Row, query: DiscoverQuery) {
  const needs =
    query.genres.length > 0 ||
    query.scoreMin !== null ||
    query.scoreMax !== null ||
    query.votesMin !== null ||
    query.ratings !== null ||
    query.language !== null ||
    query.runtimeMin !== null ||
    query.runtimeMax !== null
  if (!f) return !needs && dated(row, query)
  const score = f.votes > 0 ? f.rating : null
  const rating = query.ratings
    ? f.ratings?.find((r) => r.country === query.ratings?.country)?.rating
    : undefined
  return (
    dated(row, query) &&
    query.genres.every((id) => f.genreIds.includes(id)) &&
    (query.scoreMin === null || (score !== null && score >= query.scoreMin)) &&
    (query.scoreMax === null || (score !== null && score <= query.scoreMax)) &&
    (query.votesMin === null || f.votes >= query.votesMin) &&
    (query.ratings === null ||
      (rating !== undefined && query.ratings.ratings.includes(rating))) &&
    (query.language === null || f.originalLanguage === query.language) &&
    (query.runtimeMin === null ||
      (f.runtimeMinutes !== null && f.runtimeMinutes >= query.runtimeMin)) &&
    (query.runtimeMax === null ||
      (f.runtimeMinutes !== null && f.runtimeMinutes <= query.runtimeMax))
  )
}

/** Whether a title came out in the query's days: by its date, or else its year. */
function dated(row: RecommendationRow, query: DiscoverQuery) {
  const { from, to } = query
  if (from === null && to === null) return true
  if (row.releaseDate)
    return (
      (from === null || row.releaseDate >= from) &&
      (to === null || row.releaseDate <= to)
    )
  if (row.year === null) return false
  // A title known only by its year is in when its year is.
  const year = String(row.year)
  return (
    (from === null || year >= from.slice(0, 4)) &&
    (to === null || year <= to.slice(0, 4))
  )
}

/** Sorts rows the way TMDB would for the query's order; "For you" keeps the stored one. */
function sorted(
  rows: Row[],
  sort: BrowseInput["sort"],
  query: DiscoverQuery,
  language: string,
) {
  if (sort === "forYou") return rows
  const sign = query.sort.direction === "asc" ? 1 : -1
  if (query.sort.by === "name") {
    const collator = new Intl.Collator(language)
    return rows.toSorted(
      (a, b) => sign * collator.compare(a.row.name, b.row.name),
    )
  }
  const by = query.sort.by
  const value = ({ row, features: f }: Row): number | null => {
    switch (by) {
      case "popularity":
        return f?.popularity ?? null
      case "vote_average":
        return f && f.votes > 0 ? f.rating : null
      case "vote_count":
        return f?.votes ?? null
      case "date": {
        // Days as numbers, YYYYMMDD; a year alone falls in its middle.
        const day =
          row.releaseDate ?? (row.year === null ? null : `${row.year}-07-01`)
        return day === null ? null : Number(day.replaceAll("-", ""))
      }
    }
  }
  return rows.toSorted((a, b) => {
    const x = value(a)
    const y = value(b)
    // Titles without a value go last either way, as TMDB's do.
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return sign * (x - y)
  })
}

/** A page of the viewer's recommendations of one kind, filtered and sorted. */
export async function recommendedPage(
  viewer: Viewer,
  input: BrowseInput,
  query: DiscoverQuery,
  language: string,
): Promise<Pick<t.infer<typeof CatalogBrowsePage>, "items" | "nextPage">> {
  const all = await db
    .select({ row: recommendation, features: titleFeatures })
    .from(recommendation)
    .leftJoin(
      titleFeatures,
      and(
        eq(titleFeatures.kind, recommendation.kind),
        eq(titleFeatures.tmdbId, recommendation.tmdbId),
      ),
    )
    .leftJoin(title, eq(title.id, recommendation.titleId))
    .where(
      and(
        eq(recommendation.userId, viewer.id),
        eq(recommendation.kind, input.kind),
        notDismissed(viewer),
        // Titles to ask for only, or with them the library's that the
        // viewer can still see.
        input.filters.requestable
          ? isNull(recommendation.titleId)
          : or(isNull(recommendation.titleId), visibleTitles(viewer)),
      ),
    )
    .orderBy(desc(recommendation.score))
  const rows = sorted(
    all.filter((row) => passes(row, query)),
    input.sort,
    query,
    language,
  )
  const start = (input.page - 1) * PAGE
  const chunk = rows.slice(start, start + PAGE)
  const cards = await catalogCards(
    viewer,
    input.kind,
    chunk.map(({ row, features }) => ({
      id: row.tmdbId,
      name: row.name,
      year: row.year,
      poster: row.poster,
      releaseDate: row.releaseDate,
      score: features && features.votes > 0 ? features.rating : null,
      votes: features?.votes ?? 0,
    })),
  )
  impressions(
    viewer,
    chunk.map(({ row }) => row),
    "discover",
    "forYou",
  )
  return {
    // One here or declined since the list was worked out leaves the page
    // a card short, rather than every title's state read for every page.
    items: cards.flatMap(({ row, card }) =>
      input.filters.requestable && !askable(card.availability)
        ? []
        : [
            {
              ...card,
              score: row.score,
              votes: row.votes,
              releaseDate: row.releaseDate,
            },
          ],
    ),
    nextPage: rows.length > start + PAGE ? input.page + 1 : null,
  }
}
