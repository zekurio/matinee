import type { TitleStatus } from "@matinee/contracts"

/*
 * A show's status from the provider's word for it, as Jellyfin maps them.
 * Migration 0009 maps the rows stored before this with the same table, in
 * SQL; keep the two alike.
 */

/** Provider words, lowercase, by the status they map to. */
const STATUSES = new Map<string, TitleStatus>([
  // The statuses themselves, as TheTVDB's Continuing and Ended arrive.
  ["continuing", "continuing"],
  ["ended", "ended"],
  ["unreleased", "unreleased"],
  // TMDB's shows.
  ["returning series", "continuing"],
  ["returning", "continuing"],
  ["pilot", "continuing"],
  ["canceled", "ended"],
  ["cancelled", "ended"],
  // TheTVDB's series not yet aired. Jellyfin has no word for it, but
  // without it no provider would ever give `unreleased`.
  ["upcoming", "unreleased"],
])

/** A show's status, or null for a word the table doesn't have. */
export function showStatus(
  value: string | null | undefined,
): TitleStatus | null {
  return STATUSES.get(value?.trim().toLowerCase() ?? "") ?? null
}
