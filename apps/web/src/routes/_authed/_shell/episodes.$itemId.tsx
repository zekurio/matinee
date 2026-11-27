import type { MediaItem, Title } from "@matinee/contracts"
import { type QueryClient, skipToken, useQuery } from "@tanstack/solid-query"
import { createFileRoute, Link, Navigate } from "@tanstack/solid-router"
import { ChevronRight, Play } from "lucide"
import { createMemo, For, Match, Show, Switch, untrack } from "solid-js"

import { ActionsMenu } from "@/components/actions-menu"
import { pageGutter } from "@/components/app-shell"
import { ItemFavoriteButton } from "@/components/favorite-button"
import { SeasonEpisodeCard, Thumb } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { ItemTopBar, parentLink } from "@/components/phone-nav"
import { Rail, RailItem } from "@/components/rail"
import { MediaInfo } from "@/components/title/media-info"
import { railStart } from "@/components/title/rail-start"
import { Score } from "@/components/title/score"
import { headingLink, heroParent } from "@/components/title/season-page"
import { seasonParams } from "@/components/title/seasons"
import { TitleDetails } from "@/components/title/title-details"
import {
  DetailHero,
  heroActions,
  heroBody,
  OverviewAndDetails,
  titleBackdrop,
  titleColumnTop,
  titleStill,
  titleTop,
} from "@/components/title/title-header"
import {
  seasonItemsOptions,
  titleOptions,
} from "@/components/title/title-queries"
import { useItemWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { formatDate, formatRuntime, parseDay } from "@/lib/format"
import {
  art,
  frame,
  itemLabel,
  landscapeSources,
  present,
  progressRatio,
  seasonName,
  timeLeft,
} from "@/lib/media"
import { reloadOnEnter } from "@/lib/route-loading"
import { errorMessage, orpc } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"

export const Route = createFileRoute("/_authed/_shell/episodes/$itemId")({
  // Starts the episode's fetch while the page's code loads, and on hover,
  // and its season's as soon as the episode says which.
  shouldReload: reloadOnEnter,
  loader: ({ context, params }) => {
    void preloadEpisode(context.queryClient, params.itemId)
  },
  component: EpisodePage,
})

async function preloadEpisode(queryClient: QueryClient, id: string) {
  const options = orpc.media.get.queryOptions({ input: { id } })
  await queryClient.prefetchQuery(options)
  const show = seasonShow(queryClient.getQueryData(options.queryKey))
  if (!show) return
  await Promise.all([
    queryClient.prefetchQuery(titleOptions(show.id)),
    queryClient.prefetchQuery(seasonItemsOptions(show.id, show.season)),
  ])
}

/** The show an episode is in, and its season, for the row of the rest. */
function seasonShow(item: MediaItem | undefined) {
  const owner = item?.title
  return owner?.kind === "show"
    ? { id: owner.id, season: item?.seasonNumber ?? null }
    : null
}

function EpisodePage() {
  const params = Route.useParams()
  return (
    <div class={[pageGutter, "relative sm:-mt-16"]}>
      <Show when={params().itemId} keyed>
        {(itemId) => <EpisodeDetail itemId={itemId} />}
      </Show>
    </div>
  )
}

function EpisodeDetail(props: { itemId: string }) {
  const item = useQuery(() =>
    orpc.media.get.queryOptions({ input: { id: props.itemId } }),
  )
  const data = () => (item.isSuccess ? item.data : undefined)
  useDocumentTitle(() => {
    const found = data()
    if (!found) return null
    const label = itemLabel(found)
    return label.code ? `${label.title} · ${label.showName}` : label.title
  })

  return (
    <Switch>
      <Match when={item.isPending}>
        <ItemTopBar />
        <EpisodeSkeleton />
      </Match>
      <Match when={!data()}>
        <div class="pt-40 pb-24 text-center">
          <ItemTopBar />
          <h1 class="text-2xl font-semibold tracking-tight">
            {tr("title.episode.loadError")}
          </h1>
          <p class="text-muted-foreground mt-2 text-sm">
            {errorMessage(item.error)}
          </p>
          <Link
            to="/"
            class={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            {tr("title.backHome")}
          </Link>
        </div>
      </Match>
      {/* A movie's page is its title's. */}
      <Match when={data()?.title?.kind === "movie" && data()?.title}>
        {(owner) => (
          <Navigate
            to="/titles/$titleId"
            params={{ titleId: owner().id }}
            replace
          />
        )}
      </Match>
      <Match when={data()}>
        {(found) => (
          <div class="flex flex-col gap-8 sm:gap-10">
            <ItemTopBar parent={<EpisodeParent item={found()} />} />
            <EpisodeHeader item={found()} />
            {/* Positioned, so the row's heading paints over the backdrop
                where it reaches down past the header. */}
            <div class="relative">
              <Show when={found().id} keyed>
                {(_id) => <SeasonRail item={found()} />}
              </Show>
            </div>
          </div>
        )}
      </Match>
    </Switch>
  )
}

function EpisodeSkeleton() {
  return (
    <div role="status" aria-label={tr("ui.loading")}>
      <Skeleton
        class={[
          "absolute inset-x-0 top-0 rounded-none [mask-image:linear-gradient(black,transparent)]",
          titleBackdrop,
        ].join(" ")}
      />
      <div class={["relative flex gap-6 lg:gap-10", titleTop]}>
        <Skeleton class={[titleStill, "aspect-video rounded-lg"].join(" ")} />
        <div class={["w-full max-w-xl", titleColumnTop].join(" ")}>
          <Skeleton class="h-6 w-40" />
          <Skeleton class="mt-3 h-9 w-2/3 sm:h-10" />
          <Skeleton class="mt-3 h-5 w-1/3" />
          <div class="mt-5 flex items-center gap-2">
            <Skeleton class="h-11 flex-1 sm:h-10 sm:w-40 sm:flex-none" />
            <Skeleton class="size-11 rounded-full sm:size-10" />
            <Skeleton class="size-11 rounded-full sm:size-10" />
          </div>
          <Skeleton class="mt-6 h-[4.5rem] w-full" />
        </div>
      </div>
    </div>
  )
}

/**
 * The pill over a phone's art back to the episode's season, or its show
 * when it has no season. A loose file has neither.
 */
function EpisodeParent(props: { item: MediaItem }) {
  return (
    <Show when={props.item.title}>
      {(title) => (
        <Show
          when={props.item.seasonNumber !== null}
          fallback={
            <Link
              to="/titles/$titleId"
              params={{ titleId: title().id }}
              class={parentLink}
            >
              {title().name}
            </Link>
          }
        >
          <Link
            to="/titles/$titleId/seasons/$season"
            params={{
              titleId: title().id,
              season: String(props.item.seasonNumber),
            }}
            class={parentLink}
          >
            {seasonName(props.item.seasonNumber)}
          </Link>
        </Show>
      )}
    </Show>
  )
}

/**
 * The top of the page, laid out as its show's: the show's backdrop across
 * the window, the episode's still in the poster's place, its name, facts,
 * and Play, then the file, and the overview beside the show's genres,
 * creators, and studios. The still only shows; Play sits with the other
 * buttons.
 */
function EpisodeHeader(props: { item: MediaItem }) {
  const label = () => itemLabel(props.item)
  const marked = useItemWatched(() => props.item)
  const resume = () => props.item.progress !== null && !marked.on()
  const facts = () => {
    const { episode, durationSeconds } = props.item
    const runtime = formatRuntime(
      episode?.runtimeMinutes ??
        (durationSeconds ? Math.round(durationSeconds / 60) : null),
    )
    const aired = episode?.airDate ? parseDay(episode.airDate) : null
    return [
      aired ? formatDate(aired) : null,
      resume() ? timeLeft(props.item) : runtime,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  // On a phone the still is the backdrop and isn't shown again under it;
  // wider, the show's art is, with the still beside the details.
  const backdrop = createMemo(() => {
    const still = [
      art(props.item.episode?.still, "large"),
      frame(props.item.id, "large"),
    ]
    const show = art(props.item.title?.images.backdrop, "large")
    return isPhone() ? present(...still, show) : present(show, ...still)
  })
  // The show's, for its genres, creators, and studios. The page's loader
  // asked for it already.
  const owner = () =>
    props.item.title?.kind === "show" ? props.item.title.id : null
  const show = useQuery(() => {
    const id = owner()
    return orpc.titles.get.queryOptions({ input: id ? { id } : skipToken })
  })

  return (
    <DetailHero
      labelledBy="episode-name"
      toneKey={label().showKey}
      backdrop={backdrop()}
      artClass={titleStill}
      art={
        <Thumb
          sources={landscapeSources(props.item, "large")}
          toneKey={label().showKey}
          progress={progressRatio(props.item)}
          watched={marked.on()}
          hover={false}
          class="w-full rounded-lg shadow-2xl shadow-black/60"
        />
      }
    >
      <ShowLink item={props.item} />
      <EpisodeHeading item={props.item} />
      <h1
        id="episode-name"
        class="mt-1 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
      >
        {label().title}
      </h1>

      <div class="text-foreground/80 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Show when={facts()}>
          <span>{facts()}</span>
        </Show>
        <Show when={props.item.title?.contentRating}>
          <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
            {props.item.title?.contentRating}
          </span>
        </Show>
        {/* The episode's own score, never its show's. */}
        <Score score={props.item.episode?.rating ?? null} />
      </div>

      <div class={heroActions}>
        <Link
          to="/watch/$itemId"
          params={{ itemId: props.item.id }}
          class={buttonVariants({
            size: "lg",
            className: "min-w-0 max-sm:flex-1 sm:min-w-40",
          })}
        >
          <Icon icon={Play} fill="currentColor" />
          {resume() ? tr("title.resume") : tr("title.play")}
        </Link>
        <WatchedButton watched={marked} />
        <ItemFavoriteButton item={props.item} />
        <ActionsMenu
          target={{
            kind: "item",
            item: props.item,
            name: label().title,
          }}
          look="page"
        />
      </div>

      <div class={heroBody}>
        <MediaInfo item={props.item} />
        <OverviewAndDetails
          tagline={null}
          overview={props.item.episode?.overview ?? null}
          details={
            <Show when={show.isSuccess && show.data}>
              {(found) => (
                <TitleDetails
                  genres={found().genres}
                  studios={found().studios}
                  credits={found().credits}
                  crew={["creator"]}
                  dates={null}
                />
              )}
            </Show>
          }
        />
      </div>
    </DetailHero>
  )
}

/**
 * The rest of the episode's season, as a row that starts on the episode
 * before this one, so the next follows it.
 */
function SeasonRail(props: { item: MediaItem }) {
  const show = createMemo(() => seasonShow(props.item), {
    equals: (a, b) => a?.id === b?.id && a?.season === b?.season,
  })
  const title = useQuery(() => {
    const owner = show()
    return orpc.titles.get.queryOptions({
      input: owner ? { id: owner.id } : skipToken,
    })
  })
  const items = useQuery(() => {
    const owner = show()
    return orpc.titles.items.queryOptions({
      input: owner ? { id: owner.id, season: owner.season } : skipToken,
    })
  })
  const loaded = () =>
    title.isSuccess && items.isSuccess
      ? { title: title.data, items: items.data }
      : undefined
  return (
    <Show
      when={
        loaded()?.items.some((other) => other.id !== props.item.id) && loaded()
      }
    >
      {(found) => <SeasonRow item={props.item} found={found()} />}
    </Show>
  )
}

function SeasonRow(props: {
  item: MediaItem
  found: { title: Title; items: MediaItem[] }
}) {
  const others = createMemo(() =>
    props.found.items.filter((other) => other.id !== props.item.id),
  )
  // Where the row starts is kept from the first render, as a new episode
  // builds the row again.
  const at = untrack(() =>
    props.found.items.findIndex((other) => other.id === props.item.id),
  )
  const season = createMemo(() =>
    props.found.title.seasons.find(
      (entry) => entry.number === props.item.seasonNumber,
    ),
  )
  const name = () => {
    const current = season()
    return current
      ? tr("title.episode.moreFrom", { season: seasonName(current.number) })
      : tr("title.episode.moreFromSeason")
  }
  const headingClass =
    "focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
  const headingText = () => (
    <>
      <span class="truncate">{name()}</span>
      <Icon
        icon={ChevronRight}
        class="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
      />
    </>
  )
  // A show with one season lists its episodes on its own page.
  const heading = () => (
    <Show
      when={props.found.title.seasons.length !== 1}
      fallback={
        <Link
          to="/titles/$titleId"
          params={{ titleId: props.found.title.id }}
          class={headingClass}
        >
          {headingText()}
        </Link>
      }
    >
      <Show when={season()} fallback={name()}>
        {(current) => (
          <Link
            to="/titles/$titleId/seasons/$season"
            params={seasonParams(props.found.title, current())}
            class={headingClass}
          >
            {headingText()}
          </Link>
        )}
      </Show>
    </Show>
  )
  return (
    <Rail
      title={name()}
      heading={heading()}
      ref={railStart(Math.max(0, at - 1))}
    >
      <For each={others()} keyed={(other) => other.id}>
        {(other) => (
          <RailItem>
            <SeasonEpisodeCard item={other()} />
          </RailItem>
        )}
      </For>
    </Rail>
  )
}

/**
 * The show's name over the episode's, which goes to the show. A loose file
 * has its library there instead.
 */
function ShowLink(props: { item: MediaItem }) {
  const library = useQuery(() => ({
    ...orpc.libraries.get.queryOptions({ input: { id: props.item.libraryId } }),
    enabled: props.item.title === null,
  }))
  return (
    <Show
      when={props.item.title}
      fallback={
        // Holds the line while the library loads, so nothing moves.
        <Show
          when={library.isSuccess && library.data}
          fallback={<div class="h-7 sm:h-8" />}
        >
          {(found) => (
            <p class={heroParent}>
              <Link
                to="/libraries/$libraryId"
                params={{ libraryId: props.item.libraryId }}
                class={headingLink}
              >
                {found().name}
              </Link>
            </p>
          )}
        </Show>
      }
    >
      {(title) => (
        <p class={heroParent}>
          <Link
            to="/titles/$titleId"
            params={{ titleId: title().id }}
            class={headingLink}
          >
            {title().name}
          </Link>
        </p>
      )}
    </Show>
  )
}

/**
 * "Season 1 · Episode 2", or "Specials · Episode 3". The season goes to
 * its page.
 */
function EpisodeHeading(props: { item: MediaItem }) {
  const name = () =>
    props.item.seasonNumber === 0
      ? tr("title.episode.specials")
      : tr("title.episode.season", { number: String(props.item.seasonNumber) })
  return (
    <Show
      when={
        props.item.seasonNumber !== null && props.item.episodeNumber !== null
      }
    >
      <p class="text-foreground/80 mt-1 text-base font-medium tabular-nums sm:text-lg">
        <Show when={props.item.title} fallback={name()}>
          {(title) => (
            <Link
              to="/titles/$titleId/seasons/$season"
              params={{
                titleId: title().id,
                season: String(props.item.seasonNumber),
              }}
              class={[headingLink, "hover:text-foreground"]}
            >
              {name()}
            </Link>
          )}
        </Show>
        {" · "}
        {tr("title.episode.number", {
          number: String(props.item.episodeNumber),
        })}
      </p>
    </Show>
  )
}
