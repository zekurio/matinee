import type { Availability, RequestItem } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import {
  ArrivedCard,
  CatalogBadge,
  CatalogCard,
} from "@/components/catalog/catalog-card"
import {
  type LiveEntry,
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { stateWord } from "@/components/catalog/words"
import { cardClass, CardText, PosterArt } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art, seasonName } from "@/lib/media"
import { orpc } from "@/lib/rpc"

export type AskedItem = t.infer<typeof RequestItem>

/** What the viewer asked for or follows, in progress first. */
function mineOptions(limit = 24) {
  return orpc.requests.mine.queryOptions({ input: { limit } })
}

/** The live state of the titles in a list of requests, one stream for all. */
function useAskedLive(items: AskedItem[]) {
  return useLiveAvailability(
    items.map((item) => ({ ref: item.title.ref, libraryId: item.library.id })),
  )
}

/**
 * One title the viewer asked for, as its state stands: the catalog card
 * with its state while it isn't here; once it is, the library's card. A show that's partly here and still waits
 * for a season is the library's poster with that season's state.
 */
function AskedCard({
  item,
  live,
}: {
  item: AskedItem
  live: LiveEntry[] | undefined
}) {
  const entry = liveEntry(live, item.title.ref)
  const availability = entry?.availability ?? item.availability
  const here =
    availability.state === "here" ? availability.libraryTitleId : null
  // Already here when the list loaded: the library's card straight away.
  // One that arrives while it's on screen goes through the catalog card,
  // which fades its badge out first.
  const [hereAtFirst] = useState(here !== null)
  const pending = item.season
    ? (entry?.seasons.find((season) => season.number === item.season?.number) ??
      item.season)
    : null
  if (here && pending && pending.state !== "here") {
    return (
      <ShowSeasonCard
        item={item}
        titleId={here}
        season={{ number: pending.number, availability: pending }}
      />
    )
  }
  if (here && hereAtFirst) {
    return <ArrivedCard title={item.title} titleId={here} fresh={false} />
  }
  return <CatalogCard title={item.title} availability={availability} />
}

/** "Season 4 isn't here yet" while it can be asked for, else its state. */
function seasonLine(season: {
  number: number
  availability: Availability
}): string {
  const label = seasonName(season.number)
  const { availability } = season
  const state =
    availability.state === "coming" && availability.progress !== null
      ? tr("catalog.state.comingPercent", {
          percent: formatPercent(availability.progress),
        })
      : stateWord(availability)
  return state
    ? tr("title.nextUp.seasonState", { season: label, state })
    : tr("title.nextUp.notHere", { season: label })
}

/**
 * A show in the library still waiting for a season the viewer asked for:
 * its poster, opening its page, with the season's state in the corner and
 * on the second line, "Season 2 · On its way".
 */
function ShowSeasonCard({
  item,
  titleId,
  season,
}: {
  item: AskedItem
  titleId: string
  season: Parameters<typeof seasonLine>[0]
}) {
  return (
    <div className="relative">
      <Link
        to="/titles/$titleId"
        params={{ titleId }}
        title={item.title.name}
        className={cardClass}
      >
        <PosterArt
          name={item.title.name}
          toneKey={refKey(item.title.ref)}
          poster={art(item.title.poster)}
        />
        <CardText primary={item.title.name} secondary={seasonLine(season)} />
      </Link>
      <CatalogBadge
        availability={season.availability}
        className="pointer-events-none absolute top-1.5 right-1.5"
      />
    </div>
  )
}

/**
 * The profile's "Asked for", only on the viewer's own: the latest of
 * everything they asked for, with "See all" to the full list.
 */
export function ProfileAskedRail({ username }: { username: string }) {
  const mine = useQuery(mineOptions())
  const items = mine.data?.items ?? []
  const live = useAskedLive(items)
  if (items.length === 0) return null
  return (
    <Rail
      title={tr("ask.mine.title")}
      action={
        <Link
          to="/profiles/$username/asked"
          params={{ username }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm font-medium outline-none focus-visible:ring-2"
        >
          {tr("ask.mine.seeAll")}
        </Link>
      }
    >
      {items.map((item) => (
        <RailItem key={item.id} artwork="poster">
          <AskedCard item={item} live={live} />
        </RailItem>
      ))}
    </Rail>
  )
}
