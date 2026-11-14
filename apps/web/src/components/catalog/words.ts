import type { Availability, CatalogRef } from "@matinee/contracts"

import { tr } from "@/i18n"
import { formatDay, formatPercent, parseDay } from "@/lib/format"

import type { CatalogSeasonEntry } from "./catalog-data"

/*
 * The words for what the server says about a title. The server decides
 * the state, the action, and every number; these only put them in the
 * interface's language.
 */

/** "Out 14 Aug" while the day is ahead, else "Not out yet". */
export function releaseWord(day: string | null): string {
  const date = day ? parseDay(day) : null
  return date && date.getTime() > Date.now()
    ? tr("catalog.state.out", { date: formatDay(date) })
    : tr("catalog.state.notOut")
}

/** The state's word, for a state that has one. Null for none and here. */
export function stateWord(availability: Availability): string | null {
  switch (availability.state) {
    case "asked":
      return tr("catalog.state.asked")
    case "coming":
      return tr("catalog.state.coming")
    case "release":
      return releaseWord(availability.releaseDate)
    case "unavailable":
      return tr("catalog.state.unavailable")
    case "none":
    case "here":
      return null
  }
}

/** "2021 · Movie" */
export function yearKind(year: number | null, kind: CatalogRef["kind"]) {
  return [year === null ? null : String(year), tr(`search.kind.${kind}`)]
    .filter(Boolean)
    .join(" · ")
}

/**
 * A catalog card's second line: the year and kind, or `detail` in their
 * place, or the state once there is one, with the share that's in while
 * it's on its way.
 */
export function cardLine(
  title: { year: number | null; ref: CatalogRef },
  availability: Availability,
  detail?: string,
): string {
  if (availability.state === "coming" && availability.progress !== null) {
    return tr("catalog.state.comingPercent", {
      percent: formatPercent(availability.progress),
    })
  }
  return (
    stateWord(availability) ?? detail ?? yearKind(title.year, title.ref.kind)
  )
}

/** Whether the main action asks or adds, the two that start a request. */
export function asks(
  availability: Availability,
): availability is Availability & { action: "ask" | "add" } {
  return availability.action === "ask" || availability.action === "add"
}

/** The one thing a poster offers to do about a title. */
export type PosterAction = "request" | "cancel" | "follow" | "unfollow"

/** What the server lets the viewer do, as the poster's one button, or null. */
export function posterAction(availability: Availability): PosterAction | null {
  if (asks(availability)) return "request"
  if (!availability.requestId) return null
  switch (availability.action) {
    case "cancel":
    case "follow":
    case "unfollow":
      return availability.action
    default:
      return null
  }
}

/** The poster button's words. */
export function posterActionLabel(action: PosterAction): string {
  switch (action) {
    case "request":
      return tr("ask.ask")
    case "cancel":
      return tr("ask.cancel")
    case "follow":
      return tr("ask.notify")
    case "unfollow":
      return tr("ask.stopNotifying")
  }
}

/** A decline's reason for My requests: "Not for this server.", or "No copy found." */
export function declineLine(
  reason: NonNullable<Availability["reason"]>,
): string {
  if (reason.kind === "notFound" || reason.code === "notFound") {
    return tr("ask.reason.notFound")
  }
  return reason.code === "alreadyHere"
    ? tr("ask.reason.alreadyHere")
    : reason.code === "notForServer"
      ? tr("ask.reason.notForServer")
      : tr("ask.reason.declined")
}

/**
 * The answer to a declined request the viewer requested or follows, in a
 * sentence: the reason picked, in the words it was picked from, or that no
 * copy was found. Null for everyone else, whom the server tells nothing.
 */
function declineAnswer(availability: Availability): string | null {
  const { reason } = availability
  if (availability.state !== "unavailable" || !reason) return null
  const code = reason.code ?? (reason.kind === "notFound" ? "notFound" : null)
  if (code === "notFound") return tr("ask.declined.notFound")
  return code
    ? tr("ask.declined.why", { reason: tr(`requests.reason.${code}`) })
    : tr("ask.reason.declined")
}

/**
 * Whether the poster's Request stays in place though it can't be
 * pressed, dimmed, with why in its tooltip: requests are off for the
 * viewer, no library takes the title, they're out of requests, or an
 * admin declined the title, which closes it for everyone.
 */
export function requestDimmed(availability: Availability): boolean {
  return availability.disabledReason !== null
}

/** Why a dimmed Request can't be pressed, after a decline's answer. */
function dimmedWhy(availability: Availability, admin: boolean): string | null {
  switch (availability.disabledReason) {
    case "off":
      return tr("ask.disabled.off")
    case "noDestination":
      return tr("ask.disabled.noDestination")
    case "limit":
      return availability.limit
        ? tr("ask.limit.until", {
            date: formatDay(availability.limit.resetsAt),
          })
        : tr("ask.limit.later")
    case "declined":
      // Whoever requested it has the answer; everyone else hears only
      // that it's closed, and an admin where to open it again.
      if (availability.reason) return null
      return admin
        ? tr("ask.disabled.declinedAdmin")
        : tr("ask.disabled.declined")
    case null:
      return null
  }
}

/**
 * What the poster's Request says in its tooltip, which is read aloud
 * with it too: the admin's answer to a declined request the viewer
 * requested, as "Lukas declined this: Not for this server.", or why it
 * can't be pressed, or for one that works, how few requests are left
 * when two or fewer. The admin's note, when he left one, is `note`, a
 * line of its own. Null when there's nothing to say. `admin` points an
 * admin to where a decline is lifted.
 */
export function requestTip(
  availability: Availability,
  admin = false,
): { text: string; note: string | null } | null {
  const { limit } = availability
  const left =
    asks(availability) && limit && limit.left <= 2
      ? tr("ask.left", { count: limit.left })
      : null
  const text = [
    declineAnswer(availability),
    dimmedWhy(availability, admin) ?? left,
  ]
    .filter((part) => part !== null)
    .join(" ")
  if (!text) return null
  const note =
    availability.state === "unavailable"
      ? availability.reason?.note?.trim() || null
      : null
  return { text, note }
}

/** A season's episodes: "10 episodes", "Airing · 3 of 10", or when it's out. */
export function seasonDetail(season: CatalogSeasonEntry): string {
  const { episodesAired } = season.availability
  const count = season.episodeCount ?? 0
  if (episodesAired === 0 && count > 0) return releaseWord(season.airDate)
  if (count > episodesAired && episodesAired > 0) {
    return tr("catalog.season.airing", { aired: episodesAired, count })
  }
  return tr("title.episodeCount", { count })
}
