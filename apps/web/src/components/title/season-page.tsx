import type { MediaItem, Season, Title } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { getRouteApi, Link, Navigate } from "@tanstack/solid-router"
import { createMemo, For, Match, Repeat, Show, Switch, untrack } from "solid-js"

import { ActionsMenu } from "@/components/actions-menu"
import { pageGutter } from "@/components/app-shell"
import { CardActions, CardScrim } from "@/components/card-actions"
import {
  SeasonFavoriteButton,
  useSeasonFavorite,
} from "@/components/favorite-button"
import {
  CardText,
  cardClass,
  PosterArt,
  SeasonEpisodeCard,
  UnwatchBadge,
} from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { ItemTopBar, parentLink } from "@/components/phone-nav"
import { Picture } from "@/components/picture"
import { Rail, RailItem } from "@/components/rail"
import {
  parseSeasonParam,
  seasonKey,
  seasonNext,
  seasonParams,
} from "@/components/title/seasons"
import { useSeasonWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Skeleton } from "@/kit/skeleton"
import { art, type ImageSource, present, seasonName } from "@/lib/media"
import { errorMessage, orpc } from "@/lib/rpc"

import { railStart } from "./rail-start"
import { RestOfSeasonCard } from "./rest-of-season"
import { Score } from "./score"
import { useShowGaps } from "./show-gaps"
import { airedBetween, TitleDetails } from "./title-details"
import {
  DetailHero,
  heroActions,
  heroBody,
  OverviewAndDetails,
  PlayButton,
  titlePoster,
} from "./title-header"
import { TitleSkeleton } from "./title-page"
import { useTitle } from "./title-queries"

const route = getRouteApi("/_authed/_shell/titles/$titleId_/seasons/$season")

/** One season of a show: its poster and description, then its episodes. */
export function SeasonPage() {
  const params = route.useParams()
  return (
    <div class={[pageGutter, "relative sm:-mt-16"]}>
      <Show when={params().titleId} keyed>
        {(titleId) => (
          <SeasonDetail titleId={titleId} param={params().season} />
        )}
      </Show>
    </div>
  )
}

function SeasonDetail(props: { titleId: string; param: string }) {
  const number = createMemo(() => parseSeasonParam(props.param))
  const title = useTitle(() => props.titleId)
  const data = () => title()?.data
  // Asked for alongside the title rather than after it.
  const items = useQuery(() => {
    const season = number()
    return orpc.titles.items.queryOptions({
      input: season === undefined ? skipToken : { id: props.titleId, season },
    })
  })
  const files = () => (items.isSuccess ? items.data : undefined)
  // Hidden specials still open from a link.
  const season = createMemo(() => {
    const wanted = number()
    const show = data()
    if (wanted === undefined || !show) return undefined
    return (
      show.seasons.find((entry) => entry.number === wanted) ??
      (show.specials?.number === wanted ? show.specials : undefined)
    )
  })

  useDocumentTitle(() => {
    const show = data()
    const current = season()
    return show && current
      ? `${seasonName(current.number)} · ${show.name}`
      : null
  })

  return (
    <Switch>
      <Match when={!data() && !title()?.isLoadingError}>
        <ItemTopBar />
        <TitleSkeleton />
      </Match>
      <Match when={!data()}>
        <SeasonMissing title={undefined} error={title()?.error} />
      </Match>
      <Match when={data()}>
        {(show) => (
          <Show
            when={season()}
            fallback={<SeasonMissing title={show()} error={null} />}
          >
            {(current) => (
              // A show with one season lists its episodes on its own
              // page; hidden specials aren't that season.
              <Show
                when={
                  show().seasons.length !== 1 || current() === show().specials
                }
                fallback={
                  <Navigate
                    to="/titles/$titleId"
                    params={{ titleId: show().id }}
                    replace
                  />
                }
              >
                <SeasonContent
                  title={show()}
                  season={current()}
                  items={files()}
                  error={items.isError ? errorMessage(items.error) : null}
                />
              </Show>
            )}
          </Show>
        )}
      </Match>
    </Switch>
  )
}

/** The season or its show didn't load, or the show has no such season. */
function SeasonMissing(props: { title: Title | undefined; error: unknown }) {
  return (
    <div class="pt-40 pb-24 text-center">
      <ItemTopBar />
      <h1 class="text-2xl font-semibold tracking-tight">
        {props.title
          ? tr("title.season.missing", { name: props.title.name })
          : tr("title.season.showError")}
      </h1>
      <Show
        when={props.title}
        fallback={
          <>
            <p class="text-muted-foreground mt-2 text-sm">
              {errorMessage(props.error)}
            </p>
            <Link
              to="/"
              class={buttonVariants({
                variant: "outline",
                className: "mt-6",
              })}
            >
              {tr("title.backHome")}
            </Link>
          </>
        }
      >
        {(show) => (
          <Link
            to="/titles/$titleId"
            params={{ titleId: show().id }}
            class={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            {tr("title.season.all")}
          </Link>
        )}
      </Show>
    </div>
  )
}

function SeasonContent(props: {
  title: Title
  season: Season
  items: MediaItem[] | undefined
  error: string | null
}) {
  return (
    <div class="flex flex-col gap-6 sm:gap-8">
      <ItemTopBar
        parent={
          <Link
            to="/titles/$titleId"
            params={{ titleId: props.title.id }}
            class={parentLink}
          >
            {props.title.name}
          </Link>
        }
      />
      {/* A new season starts the header over, collapsing its overview, and
          the row over, on its own next episode. */}
      <Show when={String(seasonKey(props.season))} keyed>
        {(_key) => (
          <SeasonHeader
            title={props.title}
            season={props.season}
            items={props.items}
          />
        )}
      </Show>
      {/* Positioned, so the rails' headings paint over the backdrop where it
          reaches down past the header. */}
      <div class="relative flex flex-col gap-6 sm:gap-8">
        <Show when={String(seasonKey(props.season))} keyed>
          {(_key) => (
            <SeasonEpisodes
              title={props.title}
              season={props.season.number}
              items={props.items}
              error={props.error}
            />
          )}
        </Show>
        <MoreSeasons title={props.title} current={props.season} />
      </div>
    </div>
  )
}

/**
 * The top of a season's page, laid out as the show's: the show's backdrop,
 * the season's poster, the show's name over the season's, Play, and the
 * overview beside the show's genres, creators, and studios, and when the
 * season aired.
 */
function SeasonHeader(props: {
  title: Title
  season: Season
  items: MediaItem[] | undefined
}) {
  const poster = () => props.season.poster ?? props.title.images.poster
  const name = () =>
    tr("title.seasonOf", {
      show: props.title.name,
      season: seasonName(props.season.number),
    })
  const facts = () => {
    // The year the season started airing.
    const year = props.items?.[0]?.episode?.airDate?.slice(0, 4)
    const { watchedCount, itemCount } = props.season
    return [
      year,
      tr("title.episodeCount", { count: itemCount }),
      watchedCount === 0
        ? null
        : watchedCount >= itemCount
          ? tr("title.season.watched")
          : tr("title.season.watchedCount", { count: watchedCount }),
    ]
      .filter(Boolean)
      .join(" · ")
  }
  const next = () => (props.items ? seasonNext(props.title, props.items) : null)
  const watched = useSeasonWatched(
    () => props.title,
    () => props.season,
    () => props.items,
  )

  const aired = () =>
    airedBetween(
      props.items?.map((item) => item.episode?.airDate ?? null) ?? [],
    )

  return (
    <DetailHero
      labelledBy="season-name"
      toneKey={props.title.id}
      backdrop={present(art(props.title.images.backdrop, "large"))}
      backdropFallback={<BlurredPoster poster={art(poster())} />}
      artClass={titlePoster}
      art={
        <PosterArt
          name={name()}
          toneKey={props.title.id}
          poster={art(poster())}
        />
      }
    >
      <p class={heroParent}>
        <Link
          to="/titles/$titleId"
          params={{ titleId: props.title.id }}
          class={headingLink}
        >
          {props.title.name}
        </Link>
      </p>
      <h1
        id="season-name"
        class="mt-1 text-2xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
      >
        {seasonName(props.season.number)}
      </h1>

      <div class="text-foreground/80 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span>{facts()}</span>
        <Show when={props.title.contentRating}>
          <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
            {props.title.contentRating}
          </span>
        </Show>
        <Score score={props.season.rating} />
      </div>

      <div class={heroActions}>
        <Show when={next()}>{(item) => <PlayButton item={item()} />}</Show>
        <WatchedButton watched={watched} />
        <SeasonFavoriteButton title={props.title} season={props.season} />
        <ActionsMenu
          target={{
            kind: "season",
            title: props.title,
            season: props.season,
          }}
          look="page"
        />
      </div>

      <div class={heroBody}>
        <OverviewAndDetails
          tagline={null}
          overview={props.season.overview}
          details={
            <TitleDetails
              genres={props.title.genres}
              studios={props.title.studios}
              credits={props.title.credits}
              crew={["creator"]}
              dates={aired()}
            />
          }
        />
      </div>
    </DetailHero>
  )
}

// Underlined on hover, like a link in running text.
export const headingLink =
  "focus-visible:ring-ring decoration-foreground/40 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"

/** The show's name over a season's or an episode's. */
export const heroParent =
  "text-foreground text-lg leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8"

/** The season's poster, blurred, where the show has no backdrop. */
function BlurredPoster(props: { poster: ImageSource | null }) {
  return (
    <Show when={props.poster}>
      {(poster) => (
        <div class="absolute inset-0 opacity-50">
          <Picture sources={[poster()]} eager class="scale-110 blur-2xl" />
        </div>
      )}
    </Show>
  )
}

/**
 * A season's episodes as a row of stills, or skeletons while they load.
 * A still or a name opens the episode's page, and the round button on the
 * still plays it. When only some of the season is here, a card for the
 * rest ends the row.
 */
function SeasonEpisodes(props: {
  title: Title
  /** Its number, null for the files without one. */
  season: number | null
  items: MediaItem[] | undefined
  /** Why they didn't load. */
  error: string | null
}) {
  const gaps = useShowGaps(() => props.title)
  const partial = () =>
    gaps()?.partial.find((entry) => entry.number === props.season)
  return (
    <Switch>
      <Match when={props.error}>
        {(error) => (
          <section aria-labelledby="episodes-heading">
            <h2
              id="episodes-heading"
              class="mb-3 text-xl font-semibold tracking-tight"
            >
              {tr("title.episodes")}
            </h2>
            <p class="text-muted-foreground text-sm">
              {tr("title.episodes.error", { error: error() })}
            </p>
          </section>
        )}
      </Match>
      <Match when={props.items === undefined}>
        <Rail title={tr("title.episodes")}>
          <Repeat count={6}>
            {() => (
              <RailItem>
                <Skeleton class="aspect-video rounded-md" />
                <Skeleton class="mt-2.5 h-3.5 w-2/3" />
                <Skeleton class="mt-2 h-3 w-1/3" />
              </RailItem>
            )}
          </Repeat>
        </Rail>
      </Match>
      <Match when={props.items}>
        {(items) => (
          <EpisodesRail
            items={items()}
            start={seasonNext(props.title, items())}
            rest={
              <Show when={gaps()}>
                {(found) => (
                  <Show when={partial()}>
                    {(season) => (
                      <RailItem>
                        <RestOfSeasonCard
                          title={props.title}
                          gaps={found()}
                          season={season()}
                        />
                      </RailItem>
                    )}
                  </Show>
                )}
              </Show>
            }
          />
        )}
      </Match>
    </Switch>
  )
}

/** The loaded row, which starts on `start`. */
function EpisodesRail(props: {
  items: MediaItem[]
  start: MediaItem | undefined
  rest: JSX.Element
}) {
  // Kept from the first render: marking an episode watched moves Play on,
  // and the row shouldn't scroll away under the pointer.
  const startIndex = untrack(() =>
    Math.max(
      0,
      props.items.findIndex((item) => item.id === props.start?.id),
    ),
  )
  return (
    <Rail title={tr("title.episodes")} ref={railStart(startIndex)}>
      <For each={props.items} keyed={(item) => item.id}>
        {(item) => (
          <RailItem>
            <SeasonEpisodeCard item={item()} />
          </RailItem>
        )}
      </For>
      {props.rest}
    </Rail>
  )
}

/**
 * The show's other seasons by their posters, each opening the season's
 * page.
 */
function MoreSeasons(props: { title: Title; current: Season }) {
  const gaps = useShowGaps(() => props.title)
  const seasons = createMemo(() =>
    props.title.seasons.filter(
      (season) => seasonKey(season) !== seasonKey(props.current),
    ),
  )
  return (
    <Show when={seasons().length > 0}>
      <Rail title={tr("title.seasons.more")}>
        <For each={seasons()} keyed={seasonKey}>
          {(season) => (
            <RailItem artwork="poster">
              <SeasonCard
                title={props.title}
                season={season()}
                partial={gaps()?.partial.find(
                  (entry) => entry.number === season().number,
                )}
              />
            </RailItem>
          )}
        </For>
      </Rail>
    </Show>
  )
}

/**
 * A season's poster, or the show's when it has none, with how many
 * episodes are left to watch in its corner, or a check once none are,
 * which marks it unwatched again. As on a poster, hovering or focusing it
 * shows the icons that mark it watched or a favorite and its "⋯" menu,
 * which touch screens always show.
 */
function SeasonCard(props: {
  title: Title
  season: Season
  /** What the server says of the season when only part of it is here. */
  partial?: { availability: { episodesHere: number; episodesAired: number } }
}) {
  const watched = useSeasonWatched(
    () => props.title,
    () => props.season,
    () => undefined,
  )
  const favorite = useSeasonFavorite(
    () => props.title,
    () => props.season,
  )
  const name = () =>
    tr("title.seasonOf", {
      show: props.title.name,
      season: seasonName(props.season.number),
    })
  // Marked unwatched, the counts catch up once the server answers; until
  // then every episode is left.
  const left = () => {
    const counted = props.season.itemCount - props.season.watchedCount
    return counted > 0 ? counted : props.season.itemCount
  }
  return (
    <div class="group/card relative">
      <Link
        to="/titles/$titleId/seasons/$season"
        params={seasonParams(props.title, props.season)}
        title={name()}
        class={cardClass}
      >
        <PosterArt
          name={name()}
          toneKey={props.title.id}
          poster={art(props.season.poster ?? props.title.images.poster)}
        >
          <CardScrim />
        </PosterArt>
        <CardText
          primary={seasonName(props.season.number)}
          secondary={
            props.partial
              ? tr("title.seasons.partial", {
                  here: props.partial.availability.episodesHere,
                  count: props.partial.availability.episodesAired,
                })
              : tr("title.episodeCount", { count: props.season.itemCount })
          }
        />
      </Link>
      {/* The buttons can't sit in the link, so this box lies over the
          poster to put them on it: the count or the check at the top, the
          icons at the bottom, clear of each other. */}
      <div class="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        <Show
          when={watched.on()}
          fallback={
            <span
              role="img"
              aria-label={tr("title.seasons.left", { count: left() })}
              class="bg-primary text-primary-foreground text-11px absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 leading-none font-semibold shadow-sm"
            >
              {left()}
            </span>
          }
        >
          <UnwatchBadge
            name={name()}
            watched={watched}
            touch
            class="pointer-events-auto absolute top-1.5 right-1.5"
          />
        </Show>
        <CardActions
          name={name()}
          watched={watched}
          favorite={props.season.number === null ? null : favorite}
          menu={
            <ActionsMenu
              target={{
                kind: "season",
                title: props.title,
                season: props.season,
              }}
              look="card"
            />
          }
          touch
          class="pointer-events-auto absolute right-1 bottom-1"
        />
      </div>
    </div>
  )
}
