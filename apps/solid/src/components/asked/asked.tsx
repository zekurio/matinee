import type { Availability, RequestItem } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { Link } from "@tanstack/solid-router"
import { createMemo, For, Match, Show, Switch, untrack } from "solid-js"

import {
  ArrivedCard,
  CatalogBadge,
  CatalogCard,
} from "@/components/catalog/catalog-card"
import {
  type LiveEntry,
  liveEntry,
  refKey,
} from "@/components/catalog/catalog-data"
import { stateWord } from "@/components/catalog/words"
import { cardClass, CardText, PosterArt } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { useFollowedQuery } from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art, seasonName } from "@/lib/media"
import { liveQuery, orpc } from "@/lib/rpc"

export type AskedItem = t.infer<typeof RequestItem>

/** What the viewer asked for or follows, in progress first. */
function mineOptions(limit = 24) {
  return orpc.requests.mine.queryOptions({ input: { limit } })
}

/**
 * The live state of the titles in a list of requests, one stream for
 * all. Followed through its observer, as the list changes its key.
 */
function useAskedLive(items: () => AskedItem[]) {
  const live = useFollowedQuery(() => {
    const titles = items()
      .slice(0, 100)
      .map((item) => ({ ref: item.title.ref, libraryId: item.library.id }))
    return {
      ...orpc.requests.live.experimental_liveOptions({ input: { titles } }),
      ...liveQuery,
      enabled: titles.length > 0,
    }
  })
  return () => live()?.data
}

type SeasonLine = { number: number; availability: Availability }

/**
 * One title the viewer asked for, as its state stands: the catalog card
 * with its state while it isn't here; once it is, the library's card. A
 * show that's partly here and still waits for a season is the library's
 * poster with that season's state.
 */
function AskedCard(props: { item: AskedItem; live: LiveEntry[] | undefined }) {
  const entry = createMemo(() => liveEntry(props.live, props.item.title.ref))
  const availability = () => entry()?.availability ?? props.item.availability
  const here = () => {
    const current = availability()
    return current.state === "here" ? current.libraryTitleId : null
  }
  // Already here when the list loaded: the library's card straight away.
  // One that arrives while it's on screen goes through the catalog card,
  // which fades its badge out first.
  const hereAtFirst = untrack(here) !== null
  // A show here that still waits for the season asked for.
  const waitingSeason = createMemo(() => {
    const titleId = here()
    const season = props.item.season
    if (!titleId || !season) return null
    const pending =
      entry()?.seasons.find((fresh) => fresh.number === season.number) ?? season
    if (pending.state === "here") return null
    return {
      titleId,
      season: { number: pending.number, availability: pending },
    }
  })
  return (
    <Switch
      fallback={
        <CatalogCard title={props.item.title} availability={availability()} />
      }
    >
      <Match when={waitingSeason()}>
        {(shown) => (
          <ShowSeasonCard
            item={props.item}
            titleId={shown().titleId}
            season={shown().season}
          />
        )}
      </Match>
      <Match when={hereAtFirst && here()}>
        {(titleId) => (
          <ArrivedCard
            title={props.item.title}
            titleId={titleId()}
            fresh={false}
          />
        )}
      </Match>
    </Switch>
  )
}

/** "Season 4 isn't here yet" while it can be asked for, else its state. */
function seasonLine(season: SeasonLine): string {
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
function ShowSeasonCard(props: {
  item: AskedItem
  titleId: string
  season: SeasonLine
}) {
  return (
    <div class="relative">
      <Link
        to="/titles/$titleId"
        params={{ titleId: props.titleId }}
        title={props.item.title.name}
        class={cardClass}
      >
        <PosterArt
          name={props.item.title.name}
          toneKey={refKey(props.item.title.ref)}
          poster={art(props.item.title.poster)}
        />
        <CardText
          primary={props.item.title.name}
          secondary={seasonLine(props.season)}
        />
      </Link>
      <CatalogBadge
        availability={props.season.availability}
        class="pointer-events-none absolute top-1.5 right-1.5"
      />
    </div>
  )
}

/**
 * The profile's "Asked for", only on the viewer's own: the latest of
 * everything they asked for, with "See all" to the full list.
 */
export function ProfileAskedRail(props: { username: string }) {
  // Through its observer, so a refetch, as after a Cancel, keeps the rail
  // as it was rather than holding it.
  const mine = useFollowedQuery(() => mineOptions())
  const items = () => mine()?.data?.items ?? []
  const live = useAskedLive(items)
  return (
    <Show when={items().length > 0}>
      <Rail
        title={tr("ask.mine.title")}
        action={
          <Link
            to="/profiles/$username/asked"
            params={{ username: props.username }}
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm font-medium outline-none focus-visible:ring-2"
          >
            {tr("ask.mine.seeAll")}
          </Link>
        }
      >
        <For each={items()} keyed={(item) => item.id}>
          {(item) => (
            <RailItem artwork="poster">
              <AskedCard item={item()} live={live()} />
            </RailItem>
          )}
        </For>
      </Rail>
    </Show>
  )
}
