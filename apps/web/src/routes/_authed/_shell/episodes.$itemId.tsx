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
import { Picture, tone } from "@/components/picture"
import { Rail, RailItem } from "@/components/rail"
import { MediaInfo } from "@/components/title/media-info"
import { railStart } from "@/components/title/rail-start"
import { Score } from "@/components/title/score"
import { headingLink } from "@/components/title/season-page"
import { seasonParams } from "@/components/title/seasons"
import {
  seasonItemsOptions,
  titleOptions,
} from "@/components/title/title-queries"
import { useItemWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { formatDate, formatRuntime } from "@/lib/format"
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
import { useOverviewToggle } from "@/lib/use-overview-toggle"
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
            class={buttonVariants({ variant: "secondary", className: "mt-6" })}
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
      <Skeleton class="absolute inset-x-0 top-0 h-[min(46vh,420px)] rounded-none [mask-image:linear-gradient(black,transparent)] sm:h-[min(56vh,520px)]" />
      <div class="relative flex gap-8 pt-[max(10rem,30vh)] sm:pt-[max(12rem,32vh)]">
        <Skeleton class="aspect-video w-full max-w-md shrink-0 rounded-lg sm:w-80 sm:max-w-none lg:w-[28rem] xl:w-[32rem] 2xl:w-[36rem]" />
        <div class="flex-1 max-sm:hidden">
          <Skeleton class="h-4 w-32" />
          <Skeleton class="mt-3 h-10 w-2/3" />
          <Skeleton class="mt-6 h-16 w-full max-w-xl" />
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
 * The whole page: the show's backdrop across the window, the episode's
 * still, and its name, facts, description, and Play. The still only shows;
 * Play sits with the other buttons.
 */
function EpisodeHeader(props: { item: MediaItem }) {
  const label = () => itemLabel(props.item)
  const overview = useOverviewToggle()
  const marked = useItemWatched(() => props.item)
  const resume = () => props.item.progress !== null && !marked.on()
  const facts = () => {
    const { episode, durationSeconds } = props.item
    const runtime = formatRuntime(
      episode?.runtimeMinutes ??
        (durationSeconds ? Math.round(durationSeconds / 60) : null),
    )
    return [
      episode?.airDate
        ? formatDate(new Date(`${episode.airDate}T12:00:00`))
        : null,
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

  return (
    <section aria-labelledby="episode-name" class="isolate">
      <div
        aria-hidden="true"
        class={[
          "absolute inset-x-0 top-0 -z-10 h-[min(46vh,420px)] overflow-hidden sm:h-[min(64vh,600px)]",
          tone(label().showKey),
        ]}
      >
        <Picture sources={backdrop()} eager class="object-top" />
        <div class="from-background/95 via-background/50 max-sm:from-background/70 max-sm:via-background/25 absolute inset-0 bg-linear-to-r to-transparent" />
        <div class="from-background via-background/70 absolute inset-0 bg-linear-to-t via-40% to-transparent" />
      </div>

      {/* As on a title's page. Phones start higher, so the season's other
          episodes make the first screen too. */}
      <div class="pt-[max(10rem,30vh)] sm:pt-[max(12rem,32vh)]">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-8">
          {/* 16:9 at the least, then stretched to the details' height with
              the sides cropped. Capped at 4:3 so long details don't crop it
              to a square. An expanded overview leaves it as it was. */}
          {/* A still that only shows: Play is below, in words. */}
          <div
            ref={overview.artRef}
            style={overview.artStyle()}
            class={[
              "w-full max-w-md shrink-0 overflow-hidden rounded-lg shadow-2xl shadow-black/60 max-sm:hidden sm:max-h-60 sm:w-80 sm:max-w-none lg:max-h-84 lg:w-[28rem] xl:max-h-96 xl:w-[32rem] 2xl:max-h-108 2xl:w-[36rem]",
              overview.artClass(),
            ]}
          >
            <Thumb
              sources={landscapeSources(props.item, "large")}
              toneKey={label().showKey}
              progress={progressRatio(props.item)}
              watched={marked.on()}
              hover={false}
              class="w-full rounded-lg sm:h-full"
            />
          </div>

          {/* Stretched to the row, so the show's name lines up with the
              still's top and the buttons with its bottom. */}
          <div class="min-w-0 flex-1 sm:flex sm:flex-col">
            <ShowLink item={props.item} />
            <EpisodeHeading item={props.item} />
            <h1
              id="episode-name"
              class="mt-1 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {label().title}
            </h1>

            <div class="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
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

            <Show when={props.item.episode?.overview}>
              {(text) => (
                <div class="mt-4 max-w-2xl">
                  <p
                    class={[
                      "text-foreground/85 sm:text-15px text-sm leading-6 whitespace-pre-line",
                      { "line-clamp-3": !overview.expanded() },
                    ]}
                  >
                    {text()}
                  </p>
                  <Show when={text().length > 240}>
                    <button
                      type="button"
                      onClick={() => overview.toggle()}
                      class="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-1 rounded text-sm font-medium outline-none focus-visible:ring-2"
                    >
                      {overview.expanded()
                        ? tr("title.less")
                        : tr("title.more")}
                    </button>
                  </Show>
                </div>
              )}
            </Show>

            <div class="mt-4">
              <MediaInfo item={props.item} />
            </div>

            <div class="flex items-center gap-2 pt-6 sm:mt-auto">
              <Link
                to="/watch/$itemId"
                params={{ itemId: props.item.id }}
                class={buttonVariants({
                  size: "lg",
                  className: "min-w-0 max-sm:flex-1",
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
          </div>
        </div>
      </div>
    </section>
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
  // The negative margin sets the letters, not the line box, level with the
  // still's top.
  const lineClass =
    "text-foreground -mt-1 text-xl leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8"
  return (
    <Show
      when={props.item.title}
      fallback={
        // Holds the line while the library loads, so nothing moves.
        <Show
          when={library.isSuccess && library.data}
          fallback={<div class="-mt-1 h-7 sm:h-8" />}
        >
          {(found) => (
            <p class={lineClass}>
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
        <p class={lineClass}>
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
