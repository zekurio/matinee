import type { ClientAgent, TitleStatus } from "@matinee/contracts"

import { type StringKey, tr } from "@/i18n"

/*
 * The server's words for what metadata providers name in their own: genre
 * keys, title statuses, and a client's browser and system, in the TV's
 * language. As the Android app's MetadataText.kt, from the web's messages.
 */

/** Each genre key's words. A genre not here is a provider's own name. */
const GENRES = new Map<string, StringKey>([
  ["action", "web_metadata_genre_action"],
  ["adventure", "web_metadata_genre_adventure"],
  ["animation", "web_metadata_genre_animation"],
  ["anime", "web_metadata_genre_anime"],
  ["awards-show", "web_metadata_genre_awards_show"],
  ["children", "web_metadata_genre_children"],
  ["comedy", "web_metadata_genre_comedy"],
  ["crime", "web_metadata_genre_crime"],
  ["documentary", "web_metadata_genre_documentary"],
  ["drama", "web_metadata_genre_drama"],
  ["eastern", "web_metadata_genre_eastern"],
  ["family", "web_metadata_genre_family"],
  ["fantasy", "web_metadata_genre_fantasy"],
  ["food", "web_metadata_genre_food"],
  ["game-show", "web_metadata_genre_game_show"],
  ["history", "web_metadata_genre_history"],
  ["home-and-garden", "web_metadata_genre_home_and_garden"],
  ["horror", "web_metadata_genre_horror"],
  ["indie", "web_metadata_genre_indie"],
  ["martial-arts", "web_metadata_genre_martial_arts"],
  ["mini-series", "web_metadata_genre_mini_series"],
  ["music", "web_metadata_genre_music"],
  ["musical", "web_metadata_genre_musical"],
  ["mystery", "web_metadata_genre_mystery"],
  ["news", "web_metadata_genre_news"],
  ["podcast", "web_metadata_genre_podcast"],
  ["politics", "web_metadata_genre_politics"],
  ["reality", "web_metadata_genre_reality"],
  ["romance", "web_metadata_genre_romance"],
  ["science-fiction", "web_metadata_genre_science_fiction"],
  ["soap", "web_metadata_genre_soap"],
  ["special-interest", "web_metadata_genre_special_interest"],
  ["sport", "web_metadata_genre_sport"],
  ["suspense", "web_metadata_genre_suspense"],
  ["talk-show", "web_metadata_genre_talk_show"],
  ["thriller", "web_metadata_genre_thriller"],
  ["travel", "web_metadata_genre_travel"],
  ["tv-movie", "web_metadata_genre_tv_movie"],
  ["war", "web_metadata_genre_war"],
  ["western", "web_metadata_genre_western"],
])

const STATUSES = new Map<TitleStatus, StringKey>([
  ["continuing", "web_metadata_status_continuing"],
  ["ended", "web_metadata_status_ended"],
  ["canceled", "web_metadata_status_canceled"],
  ["upcoming", "web_metadata_status_upcoming"],
  ["in-production", "web_metadata_status_in_production"],
  ["pilot", "web_metadata_status_pilot"],
  ["released", "web_metadata_status_released"],
])

/** A genre's name: a key's in the TV's language, or the provider's own. */
export function genreName(genre: string): string {
  const key = GENRES.get(genre)
  return key ? tr(key) : genre
}

/** Genres in the TV language's alphabetical order. */
export function byGenreName<T>(list: T[], genre: (entry: T) => string): T[] {
  return list
    .slice()
    .sort((a, b) => genreName(genre(a)).localeCompare(genreName(genre(b))))
}

/** The genre keys whose names contain `query`, comma separated, for a search to send. */
export function genresNamed(query: string): string | undefined {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return undefined
  const keys: string[] = []
  GENRES.forEach((key, genre) => {
    if (tr(key).toLowerCase().indexOf(wanted) !== -1) keys.push(genre)
  })
  return keys.length > 0 ? keys.join(",") : undefined
}

/** A title's status in the TV's language. */
export function titleStatusName(status: TitleStatus | null): string | null {
  const key = status === null ? undefined : STATUSES.get(status)
  return key ? tr(key) : null
}

/** Like "Firefox on Linux", or whichever of the two is known. */
export function clientName(client: ClientAgent): string | null {
  if (client.browser !== null && client.system !== null) {
    return tr("web_metadata_client", client.browser, client.system)
  }
  return client.browser ?? client.system
}
