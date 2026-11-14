import type { RequestItem } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
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
import { declineLine } from "@/components/catalog/words"
import { cardClass, CardText, PosterArt } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { seasonLine } from "@/components/title/next-season"
import { tr } from "@/i18n"
import { art } from "@/lib/media"
import { orpc } from "@/lib/rpc"

export type AskedItem = t.infer<typeof RequestItem>

/** What the viewer asked for or follows, newest first. */
export function mineOptions(filter: "inProgress" | "all", limit = 24) {
  return orpc.requests.mine.queryOptions({ input: { filter, limit } })
}

/** The live state of the titles in a list of requests, one stream for all. */
export function useAskedLive(items: AskedItem[]) {
  return useLiveAvailability(
    items.map((item) => ({ ref: item.title.ref, libraryId: item.library.id })),
  )
}

/**
 * One title the viewer asked for, as its state stands: the catalog card
 * with its state while it isn't here; once it is, the library's card, with
 * the accent dot while `fresh`. A show that's partly here and still waits
 * for a season is the library's poster with that season's state.
 */
export function AskedCard({
  item,
  live,
  fresh,
}: {
  item: AskedItem
  live: LiveEntry[] | undefined
  /** Arrived lately: a dot until watched. */
  fresh: boolean
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
    return <ArrivedCard title={item.title} titleId={here} fresh={fresh} />
  }
  return <CatalogCard title={item.title} availability={availability} />
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

/** Why a declined title isn't coming, under its card in the full list. */
export function DeclinedNote({ item }: { item: AskedItem }) {
  const { reason } = item.availability
  if (item.availability.state !== "unavailable" || !reason) return null
  return (
    <p className="text-muted-foreground mt-1 text-[13px] leading-5">
      <span className="line-clamp-2">{declineLine(reason)}</span>
      {reason.note && (
        <span className="text-foreground/70 mt-0.5 line-clamp-2 italic">
          {reason.note}
        </span>
      )}
    </p>
  )
}

/** "Asked for", linking to the full list, as a rail's heading. */
function AskedHeading({ username }: { username: string }) {
  return (
    <Link
      to="/profiles/$username/asked"
      params={{ username }}
      className="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
    >
      <span className="truncate">{tr("ask.mine.title")}</span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors motion-reduce:transition-none"
      />
    </Link>
  )
}

/**
 * Home's "Asked for": what the viewer asked for that is on its way, and
 * what came or was answered in the last three days. Nothing when there's
 * none of either, so Home stays about what's here.
 */
export function AskedRail({ username }: { username: string }) {
  const mine = useQuery(mineOptions("inProgress"))
  const items = mine.data?.items ?? []
  const live = useAskedLive(items)
  if (items.length === 0) return null
  return (
    <Rail
      title={tr("ask.mine.title")}
      heading={<AskedHeading username={username} />}
    >
      {items.map((item) => (
        <RailItem key={item.id} artwork="poster">
          <AskedCard item={item} live={live} fresh />
        </RailItem>
      ))}
    </Rail>
  )
}

/**
 * The profile's "Asked for", only on the viewer's own: the latest of
 * everything they asked for, with "See all" to the full list.
 */
export function ProfileAskedRail({ username }: { username: string }) {
  const mine = useQuery(mineOptions("all"))
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
          <AskedCard item={item} live={live} fresh={false} />
        </RailItem>
      ))}
    </Rail>
  )
}
