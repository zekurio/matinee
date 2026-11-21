import { CatalogRef } from "./catalog"
import { get, put } from "./contract-routes"
import { t } from "./schema"
import { TitleSummary } from "./titles"

/*
 * Recommendations from what each person watches: the titles on the
 * server they'd likely play next, on Home, and the ones they could ask
 * for, on Discover. The server works them out in the background from
 * watch time, favorites, and what titles share (genres, keywords,
 * people), and clients only show the rows it sends.
 */

/**
 * Why a title is recommended. Each client words the kind itself:
 * "watched" is "Because you watched {name}", "person" is "With {name}",
 * and "taste" names no subject. `name` is the subject's own name, null
 * for "taste".
 */
export const RecommendationReason = t.object({
  kind: t.enum(["watched", "person", "taste"]),
  name: t.string().nullable(),
})
export type RecommendationReason = t.infer<typeof RecommendationReason>

/** The title a "Because you watched" row starts from. */
export const RecommendationSeed = t.object({
  ref: CatalogRef,
  name: t.string(),
})
export type RecommendationSeed = t.infer<typeof RecommendationSeed>

/**
 * The kinds of recommendation rows: "forYou" mixes everything, and
 * "becauseWatched" holds what's like one title the viewer watched,
 * named by its `seed`.
 */
export const RECOMMENDATION_RAILS = ["forYou", "becauseWatched"] as const
export const RecommendationRailId = t.enum(RECOMMENDATION_RAILS)

/** A title on the server, recommended to the viewer. */
export const RecommendedTitle = t.object({
  /** The title at TMDB, for `recommendations.dismiss`. */
  ref: CatalogRef,
  title: TitleSummary,
  reason: RecommendationReason.nullable(),
})

export const HomeRecommendationRail = t.object({
  id: RecommendationRailId,
  /** Set for a "becauseWatched" row, null for "forYou". */
  seed: RecommendationSeed.nullable(),
  items: t.array(RecommendedTitle),
})

export const HomeRecommendations = t.object({
  /** Best first. Empty before the viewer watched enough to go on. */
  rails: t.array(HomeRecommendationRail),
  /** When the viewer's lists were last worked out; null before the first time. */
  computedAt: t.date().nullable(),
})

export const recommendationsContract = {
  /** The recommendation rows Home shows, of titles in the viewer's libraries. */
  home: get("/recommendations/home", "recommendation.read").output(
    HomeRecommendations,
  ),
  /**
   * "Not interested": leave a title out of the viewer's recommendations,
   * or let it back in. Either is fine to repeat.
   */
  dismiss: put("/recommendations/dismissed", "recommendation.update")
    .input(t.object({ ref: CatalogRef, dismissed: t.boolean() }))
    .output(t.void()),
}
