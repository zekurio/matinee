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
import { Picture, tone } from "@/components/picture"
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

import { HeaderOverview } from "./header-overview"
import { railStart } from "./rail-start"
import { RestOfSeasonCard } from "./rest-of-season"
import { Score } from "./score"
import { useShowGaps } from "./show-gaps"
import { PlayButton } from "./title-header"
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
 * the season's poster, the show's name over the season's, and Play.
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

  return (
    <section aria-labelledby="season-name" class="isolate">
      <HeaderBackdrop
        toneKey={props.title.id}
        backdrop={art(props.title.images.backdrop, "large")}
        poster={art(poster())}
      />

      <div class="pt-[max(7rem,20vh)] sm:pt-[max(8rem,14vh)]">
        <div class={headerRow}>
          <HeaderPoster
            name={name()}
            toneKey={props.title.id}
            poster={art(poster())}
          />

          <div class="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
            <div class="min-w-0">
              {/* The negative margin sets the letters, not the line box,
                  level with the poster's top. */}
              <p class="-mt-1 text-lg leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8">
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

              <div class="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm tabular-nums">
                <span>{facts()}</span>
                <Show when={props.title.contentRating}>
                  <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                    {props.title.contentRating}
                  </span>
                </Show>
                <Score score={props.season.rating} />
              </div>
            </div>

            <div class="col-span-2 min-w-0 sm:flex sm:flex-1 sm:flex-col">
              <div class="sm:mt-4">
                <HeaderOverview
                  tagline={null}
                  overview={props.season.overview}
                />
              </div>

              <div class="flex items-center gap-2 pt-6 sm:mt-auto">
                <Show when={next()}>
                  {(item) => <PlayButton item={item()} />}
                </Show>
                <WatchedButton watched={watched} />
                <SeasonFavoriteButton
                  title={props.title}
                  season={props.season}
                />
                <ActionsMenu
                  target={{
                    kind: "season",
                    title: props.title,
                    season: props.season,
                  }}
                  look="page"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Underlined on hover, like a link in running text.
export const headingLink =
  "focus-visible:ring-ring decoration-foreground/40 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"

// On phones, a small poster beside the name and facts, and the rest under
// both, full width. From `sm` up: the poster beside it all.
const headerRow =
  "grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-4 gap-y-5 sm:flex sm:items-stretch sm:gap-6"

/**
 * The show's backdrop across the top of the page, fading into it. Without
 * one, the poster, blurred, keeps the page from going flat.
 */
function HeaderBackdrop(props: {
  toneKey: string
  backdrop: ImageSource | null
  poster: ImageSource | null
  class?: string
}) {
  return (
    <div
      aria-hidden="true"
      class={[
        "absolute inset-x-0 top-0 -z-10 h-[min(46vh,420px)] overflow-hidden sm:h-[min(54vh,520px)]",
        tone(props.toneKey),
        props.class,
      ]}
    >
      <Show
        when={props.backdrop}
        fallback={
          <Show when={props.poster}>
            {(poster) => (
              <div class="absolute inset-0 opacity-50">
                <Picture
                  sources={[poster()]}
                  eager
                  class="scale-110 blur-2xl"
                />
              </div>
            )}
          </Show>
        }
      >
        {(backdrop) => (
          <Picture sources={[backdrop()]} eager class="object-top" />
        )}
      </Show>
      <div class="from-background/95 via-background/50 max-sm:from-background/70 max-sm:via-background/25 absolute inset-0 bg-linear-to-r to-transparent" />
      <div class="from-background via-background/70 absolute inset-0 bg-linear-to-t via-40% to-transparent" />
    </div>
  )
}

/**
 * The poster beside a header's details, always 2:3. It sets the header's
 * height; the details fit beside it. Shows the name when there's no
 * poster or it fails to load.
 */
function HeaderPoster(props: {
  name: string
  toneKey: string
  poster: ImageSource | null
}) {
  return (
    <div
      class={[
        "relative grid aspect-[2/3] w-24 shrink-0 place-items-center overflow-hidden rounded-lg border p-2 text-center shadow-2xl shadow-black/60 sm:w-36 sm:self-start sm:p-3 lg:w-[180px]",
        tone(props.toneKey),
      ]}
    >
      <Picture
        sizes="(min-width: 1024px) 180px, (min-width: 640px) 144px, 96px"
        sources={present(props.poster)}
        eager
        fallback={
          <span
            aria-hidden="true"
            class="text-foreground/70 line-clamp-5 text-xs font-medium text-balance sm:text-sm"
          >
            {props.name}
          </span>
        }
      />
    </div>
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
              class="bg-primary text-primary-foreground text-11px absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 leading-none font-semibold tabular-nums shadow-sm"
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
