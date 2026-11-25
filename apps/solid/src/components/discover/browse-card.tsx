import type { CatalogBrowsePage } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { createMemo, Show } from "solid-js"

import { CatalogCard } from "@/components/catalog/catalog-card"
import { type LiveEntry, liveEntry } from "@/components/catalog/catalog-data"
import type { Browse } from "@/components/discover/browse-params"
import { PosterCard } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatDate, formatScore, parseDay } from "@/lib/format"

/*
 * A card of a browse, which Discover's rows show too: the library's own
 * for a title here, a catalog card for the rest, and under its name what
 * the browse calls for.
 */

export type BrowseEntry = t.infer<typeof CatalogBrowsePage>["items"][number]

/** Whether a browse lists the viewer's recommendations, whose cards offer "Not interested". */
export function recommends(browse: Pick<Browse, "filters">): boolean {
  return browse.filters.recommended
}

/** What a card says under its name, as the server says the list calls for. */
export function cardDetail(
  detail: t.infer<typeof CatalogBrowsePage>["detail"],
  item: BrowseEntry,
): string | undefined {
  if (detail === "score" && item.score !== null) {
    const score = formatScore(item.score)
    return item.year
      ? tr("filters.card.score", { score, year: String(item.year) })
      : tr("filters.card.scoreOnly", { score })
  }
  if (detail === "releaseDate" && item.releaseDate) {
    const day = parseDay(item.releaseDate)
    if (day) return formatDate(day)
  }
  // Every card is the same kind, so the year alone.
  return item.year ? String(item.year) : undefined
}

/**
 * A title the viewer can watch is the library's card, with Play. The
 * rest are catalog cards with what the stream says now.
 */
export function BrowseCard(props: {
  item: BrowseEntry
  live: LiveEntry[] | undefined
  detail: string | undefined
  /** "Not interested", for a recommendation. */
  dismiss?: () => void
}) {
  const availability = createMemo(
    () => liveEntry(props.live, props.item.ref)?.availability,
  )
  const watchable = () => {
    const title = props.item.title
    const current = availability() ?? props.item.availability
    return title &&
      current.state === "here" &&
      current.libraryTitleId === title.id
      ? title
      : undefined
  }
  return (
    <Show
      when={watchable()}
      fallback={
        <CatalogCard
          title={props.item}
          availability={availability()}
          detail={props.detail}
          dismiss={props.dismiss}
        />
      }
    >
      {(title) => <PosterCard title={title()} detail={props.detail} />}
    </Show>
  )
}
