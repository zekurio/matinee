import type { Favorite } from "@matinee/contracts"

import {
  EpisodePosterCard,
  PosterCard,
  SeasonPosterCard,
} from "@/components/media-item"

/** Tells favorites apart in a row that mixes their kinds. */
export function favoriteKey(favorite: Favorite): string {
  switch (favorite.kind) {
    case "movie":
    case "show":
      return `title/${favorite.title.id}`
    case "showSeason":
      return `season/${favorite.title.id}/${favorite.season.number}`
    case "episode":
      return `episode/${favorite.item.id}`
  }
}

/**
 * A favorite of any kind as a poster, so a row that mixes them lines up:
 * a movie, a show, a season, or an episode on its show's poster.
 */
export function FavoriteCard({ favorite }: { favorite: Favorite }) {
  switch (favorite.kind) {
    case "movie":
    case "show":
      return <PosterCard title={favorite.title} />
    case "showSeason":
      return (
        <SeasonPosterCard title={favorite.title} season={favorite.season} />
      )
    case "episode":
      return <EpisodePosterCard item={favorite.item} />
  }
}
