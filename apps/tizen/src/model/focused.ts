import type {
  FeaturedTitle,
  MediaItem,
  Season,
  ShelfEntry,
  TitleSummary,
} from "@matinee/contracts"

import type { Navigator } from "@/app/navigator"
import { plural, tr } from "@/i18n"
import type { FocusedItem } from "@/kit/misc"

import {
  art,
  episodeCode,
  formatRuntime,
  frame,
  type ImageSource,
  itemLabel,
  present,
  runtimeMinutes,
  seasonName,
  timeLeft,
} from "./format"

/*
 * What a page's header says about the focused card, and the backdrop
 * behind it: the facts the phone's pages show for the same item.
 */

const facts = (...values: (string | null | undefined)[]): string[] =>
  values.filter((value): value is string => Boolean(value))

/** The art behind a file, best first, as the phone's banner has it. */
function backdropOf(
  item: MediaItem,
  title: TitleSummary | null,
): ImageSource[] {
  return present(
    art(title?.images.backdrop, "large"),
    art(item.episode?.still, "large"),
    frame(item.id, true),
  )
}

export function featuredInfo(slide: FeaturedTitle): FocusedItem {
  const { title, item, count } = slide
  return {
    name: title.name,
    logo: title.images.logo,
    subtitle: null,
    facts: facts(
      title.year === null ? null : String(title.year),
      title.kind === "show" && count > 1
        ? plural("mediaEpisodeCount", count)
        : null,
      timeLeft(item),
    ),
    contentRating: title.contentRating,
    rating: title.rating,
    overview: title.overview,
    backdrop: backdropOf(item, title),
  }
}

/** A file in Continue watching or Next up. */
export function itemInfo(item: MediaItem): FocusedItem {
  const label = itemLabel(item)
  const code = episodeCode(item)
  const left = item.progress?.completed === false ? timeLeft(item) : null
  return {
    name: label.showName,
    logo: item.title?.images.logo ?? null,
    subtitle: code ? tr("mediaCodeTitle", code, label.title) : null,
    facts: facts(label.year, formatRuntime(runtimeMinutes(item)), left),
    contentRating: item.title?.contentRating ?? null,
    rating: item.title?.rating ?? null,
    overview: item.episode?.overview ?? item.title?.overview ?? null,
    backdrop: backdropOf(item, item.title),
  }
}

/** What a shelf entry's card shows and opens: a movie by its year, a show by what it got last. */
export type ShelfCard = {
  poster: ImageSource | null
  detail: string | null
  open: (nav: Navigator) => void
}

export function shelfCard(entry: ShelfEntry): ShelfCard {
  const { title, count, added } = entry
  const openTitle = (nav: Navigator) => nav.title(title.id)
  if (title.kind === "movie") {
    return {
      poster: art(title.images.poster),
      detail: title.year === null ? null : String(title.year),
      open: openTitle,
    }
  }
  if (!added) {
    return {
      poster: art(title.images.poster),
      detail: plural("mediaEpisodeCount", count),
      open: openTitle,
    }
  }
  const poster = art(added.season?.poster ?? title.images.poster)
  if (added.count === 1) {
    const code = episodeCode(added.item)
    const name = itemLabel(added.item).title
    return {
      poster,
      detail: code ? tr("mediaCodeTitle", code, name) : name,
      open: (nav) => nav.episode(added.item.id),
    }
  }
  const fresh = plural("mediaNewEpisodes", added.count)
  const season = added.season
  return {
    poster,
    detail: season ? `${seasonName(season.number)} · ${fresh}` : fresh,
    open: season ? (nav) => nav.season(title.id, season.number) : openTitle,
  }
}

/** A title on a library's shelf, with what its card says. */
export function shelfInfo(entry: ShelfEntry, card: ShelfCard): FocusedItem {
  const { title } = entry
  const movie = title.kind === "movie"
  return {
    name: title.name,
    logo: title.images.logo,
    subtitle: movie ? null : card.detail,
    facts: facts(
      title.year === null ? null : String(title.year),
      movie ? formatRuntime(runtimeMinutes(entry.item)) : null,
    ),
    contentRating: title.contentRating,
    rating: title.rating,
    overview: title.overview,
    backdrop: present(
      art(title.images.backdrop, "large"),
      frame(entry.item.id, true),
    ),
  }
}

/**
 * A movie or show by itself: the year, whether it's a movie or a show
 * when `kind` is asked for, as on a page that has both, and its runtime
 * or its first genres.
 */
export function titleInfo(
  title: TitleSummary,
  options: { kind?: boolean; genres?: boolean } = {},
): FocusedItem {
  return {
    name: title.name,
    logo: title.images.logo,
    subtitle: null,
    facts: facts(
      title.year === null ? null : String(title.year),
      options.kind
        ? tr(title.kind === "movie" ? "tvKindMovie" : "tvKindShow")
        : null,
      options.genres
        ? title.genres.slice(0, 2).join(", ")
        : title.kind === "movie"
          ? formatRuntime(title.runtimeMinutes)
          : null,
    ),
    contentRating: title.contentRating,
    rating: title.rating,
    overview: title.overview,
    backdrop: present(art(title.images.backdrop, "large")),
  }
}

/** A season of a show: the show's name with the season's, how many episodes it has, and its overview, or the show's. */
export function seasonInfo(title: TitleSummary, season: Season): FocusedItem {
  return {
    name: tr("titleSeasonOf", title.name, seasonName(season.number)),
    logo: null,
    subtitle: null,
    facts: [plural("mediaEpisodeCount", season.itemCount)],
    contentRating: title.contentRating,
    rating: title.rating,
    overview: season.overview ?? title.overview,
    backdrop: present(art(title.images.backdrop, "large")),
  }
}
