import {
  type ClientAgent,
  type Genre,
  GENRES,
  type TitleStatus,
} from "@matinee/contracts"

import { tr } from "@/i18n"

/*
 * The server's words for what metadata providers name in their own:
 * genre keys, title statuses, and the browser and system of a client.
 * Each reads in the interface's language here.
 */

const KEYS = new Set<string>(GENRES)

function isGenre(name: string): name is Genre {
  return KEYS.has(name)
}

/**
 * A genre's name: a key's in this language, or the provider's own for one
 * the server has no key for.
 */
export function genreName(genre: string): string {
  return isGenre(genre) ? tr(`metadata.genre.${genre}`) : genre
}

/** Genres in this language's alphabetical order. */
export function byGenreName<T>(list: T[], genre: (entry: T) => string): T[] {
  return list.toSorted((a, b) =>
    genreName(genre(a)).localeCompare(genreName(genre(b))),
  )
}

/**
 * The genre keys whose names in this language contain `query`, comma
 * separated, for a search to find genres by the names people read.
 */
export function genresNamed(query: string): string {
  const wanted = query.trim().toLocaleLowerCase()
  if (!wanted) return ""
  return GENRES.filter((genre) =>
    genreName(genre).toLocaleLowerCase().includes(wanted),
  ).join(",")
}

export function titleStatusName(status: TitleStatus): string {
  return tr(`metadata.status.${status}`)
}

/** Like `Firefox on Linux`, or whichever of the two is known. */
export function clientName(client: ClientAgent): string {
  if (client.browser && client.system) {
    return tr("metadata.client", {
      browser: client.browser,
      system: client.system,
    })
  }
  return client.browser ?? client.system ?? ""
}
