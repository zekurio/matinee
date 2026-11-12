import type { MediaItem, Season, Title } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

// Files without a season number, in the URL.
const NO_SEASON = -1

/** A season in the URL: its number, or `NO_SEASON`. */
const SeasonParam = t.coerce.number().int().min(NO_SEASON)

export function seasonKey(season: Season): number {
  return season.number ?? NO_SEASON
}

/** The path params of a season's page. */
export function seasonParams(title: { id: string }, season: Season) {
  return { titleId: title.id, season: String(seasonKey(season)) }
}

/**
 * The season a season page's URL names, as `Season.number` has it: null
 * for the files without one. Undefined when the URL makes no sense.
 */
export function parseSeasonParam(param: string): number | null | undefined {
  const parsed = SeasonParam.safeParse(param)
  if (!parsed.success) return undefined
  return parsed.data === NO_SEASON ? null : parsed.data
}

/**
 * What Play starts in a season: the title's next file when it's in this
 * season, else the season's file in progress, its first unwatched file, or
 * its first.
 */
export function seasonNext(
  title: Title,
  items: MediaItem[],
): MediaItem | undefined {
  const next = items.find((item) => item.id === title.next?.id)
  return (
    next ??
    items.find((item) => item.progress && !item.progress.completed) ??
    items.find((item) => !item.progress?.completed) ??
    items[0]
  )
}

/**
 * The season of a show that has just one, so no specials either. Its
 * episodes go on the show's own page.
 */
export function onlySeason(title: Title): Season | undefined {
  return title.kind === "show" && title.seasons.length === 1
    ? title.seasons[0]
    : undefined
}
