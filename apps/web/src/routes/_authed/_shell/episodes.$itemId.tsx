import type { MediaItem } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { type QueryClient, skipToken, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { ChevronRightIcon, PlayIcon } from "lucide-react"

import { ActionsMenu } from "@/components/actions-menu"
import { pageBleed, pageColumn } from "@/components/app-shell"
import { ItemFavoriteButton } from "@/components/favorite-button"
import { EpisodeCard, Picture, Thumb, tone } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { MediaInfo } from "@/components/title/media-info"
import { seasonParams } from "@/components/title/seasons"
import {
  seasonItemsOptions,
  titleOptions,
} from "@/components/title/title-queries"
import { useItemWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { formatDate, formatRuntime } from "@/lib/format"
import {
  art,
  frame,
  itemLabel,
  landscapeSources,
  present,
  progressRatio,
  timeLeft,
  seasonName,
} from "@/lib/media"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOverviewToggle } from "@/lib/use-overview-toggle"

export const Route = createFileRoute("/_authed/_shell/episodes/$itemId")({
  // Starts the episode's fetch while the page's code loads, and on hover,
  // and its season's as soon as the episode says which.
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
  const { itemId } = Route.useParams()
  const item = useQuery(orpc.media.get.queryOptions({ input: { id: itemId } }))
  const label = item.data ? itemLabel(item.data) : null
  useDocumentTitle(
    label?.code ? `${label.title} · ${label.showName}` : label?.title,
  )

  if (item.isPending) return <EpisodeSkeleton />
  if (!item.data) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr("title.episode.loadError")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(item.error)}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          {tr("title.backHome")}
        </Link>
      </div>
    )
  }
  // A movie's page is its title's.
  const owner = item.data.title
  if (owner?.kind === "movie") {
    return (
      <Navigate to="/titles/$titleId" params={{ titleId: owner.id }} replace />
    )
  }
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <EpisodeHeader item={item.data} />
      <SeasonRail item={item.data} />
    </div>
  )
}

function EpisodeSkeleton() {
  return (
    <div className={pageBleed}>
      <Skeleton className="h-[min(46vh,420px)] w-full rounded-none sm:h-[min(56vh,520px)]" />
      <div className={cn(pageColumn, "-mt-40 flex gap-8")}>
        <Skeleton className="aspect-video w-full max-w-md shrink-0 rounded-lg sm:w-80 sm:max-w-none lg:w-[28rem] xl:w-[32rem] 2xl:w-[36rem]" />
        <div className="flex-1 pt-16 max-sm:hidden">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-6 h-16 w-full max-w-xl" />
        </div>
      </div>
    </div>
  )
}

// Underlined on hover, like a link in running text.
const headingLink =
  "focus-visible:ring-ring decoration-foreground/40 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"

/**
 * The whole page: the show's backdrop across the window, the episode's
 * still, which plays it, and its name, facts, description, and Play.
 */
function EpisodeHeader({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const { expanded, toggle, artRef, artClass, artStyle } =
    useOverviewToggle<HTMLAnchorElement>()
  const marked = useItemWatched(item)
  const watched = marked.on
  const resume = item.progress !== null && !watched
  const overview = item.episode?.overview
  const runtime = formatRuntime(
    item.episode?.runtimeMinutes ??
      (item.durationSeconds ? Math.round(item.durationSeconds / 60) : null),
  )
  const facts = [
    item.episode?.airDate
      ? formatDate(new Date(`${item.episode.airDate}T12:00:00`))
      : null,
    resume ? timeLeft(item) : runtime,
  ].filter(Boolean)
  // On a phone the still is the backdrop and isn't shown again under it;
  // wider, the show's art is, with the still beside the details.
  const phone = useMediaQuery("(width < 40rem)")
  const still = [art(item.episode?.still, "large"), frame(item.id, "large")]
  const show = art(item.title?.images.backdrop, "large")
  const backdrop = phone ? present(...still, show) : present(show, ...still)

  return (
    <section className={pageBleed} aria-labelledby="episode-name">
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[min(46vh,420px)] overflow-hidden sm:h-[min(64vh,600px)]",
          tone(label.showKey),
        )}
      >
        <Picture sources={backdrop} eager className="object-top" />
        <div className="from-background/95 via-background/50 absolute inset-0 bg-gradient-to-r to-transparent" />
        <div className="from-background via-background/70 absolute inset-0 bg-gradient-to-t via-40% to-transparent" />
      </div>

      <div
        className={cn(
          pageColumn,
          // As on a title's page. Phones start higher, so the season's other
          // episodes make the first screen too.
          "relative pt-[max(10rem,30vh)] sm:pt-[max(12rem,32vh)]",
        )}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-8">
          {/* 16:9 at the least, then stretched to the details' height with
              the sides cropped. Capped at 4:3 so long details don't crop it
              to a square. An expanded overview leaves it as it was. */}
          <Link
            to="/watch/$itemId"
            params={{ itemId: item.id }}
            aria-label={
              resume
                ? tr("title.resumeName", { name: label.title })
                : tr("title.playName", { name: label.title })
            }
            ref={artRef}
            style={artStyle}
            className={cn(
              "group focus-visible:ring-ring focus-visible:ring-offset-background w-full max-w-md shrink-0 max-sm:hidden rounded-lg shadow-2xl shadow-black/60 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:max-h-60 sm:w-80 sm:max-w-none lg:max-h-84 lg:w-[28rem] xl:max-h-96 xl:w-[32rem] 2xl:max-h-108 2xl:w-[36rem]",
              artClass,
            )}
          >
            <Thumb
              sources={landscapeSources(item, "large")}
              toneKey={label.showKey}
              progress={progressRatio(item)}
              watched={watched}
              className="group-hover:border-foreground/25 w-full rounded-lg sm:h-full"
            />
          </Link>

          {/* Stretched to the row, so the show's name lines up with the
              still's top and the buttons with its bottom. */}
          <div className="min-w-0 flex-1 sm:flex sm:flex-col">
            <ShowLink item={item} />
            <EpisodeHeading item={item} />
            <h1
              id="episode-name"
              className="mt-1 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {label.title}
            </h1>

            <div className="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              {facts.length > 0 && <span>{facts.join(" · ")}</span>}
              {item.title?.contentRating && (
                <span className="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                  {item.title.contentRating}
                </span>
              )}
            </div>

            {overview && (
              <div className="mt-4 max-w-2xl">
                <p
                  className={cn(
                    "text-sm leading-6 whitespace-pre-line text-foreground/85 sm:text-[15px]",
                    !expanded && "line-clamp-3",
                  )}
                >
                  {overview}
                </p>
                {overview.length > 240 && (
                  <button
                    type="button"
                    onClick={toggle}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-1 rounded text-sm font-medium outline-none focus-visible:ring-2"
                  >
                    {expanded ? tr("title.less") : tr("title.more")}
                  </button>
                )}
              </div>
            )}

            <MediaInfo item={item} className="mt-4" />

            <div className="flex items-center gap-2 pt-6 sm:mt-auto">
              <Link
                to="/watch/$itemId"
                params={{ itemId: item.id }}
                className={buttonVariants({
                  size: "lg",
                  className: "min-w-0 max-sm:h-11 max-sm:flex-1",
                })}
              >
                <PlayIcon className="fill-current" />
                {resume ? tr("title.resume") : tr("title.play")}
              </Link>
              <WatchedButton watched={marked} />
              <ItemFavoriteButton item={item} />
              <ActionsMenu
                target={{ kind: "item", item, name: label.title }}
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
function SeasonRail({ item }: { item: MediaItem }) {
  const show = seasonShow(item)
  const title = useQuery(
    orpc.titles.get.queryOptions({
      input: show ? { id: show.id } : skipToken,
    }),
  )
  const items = useQuery(
    orpc.titles.items.queryOptions({
      input: show ? { id: show.id, season: show.season } : skipToken,
    }),
  )
  if (!show || !title.data || !items.data) return null
  const others = items.data.filter((other) => other.id !== item.id)
  if (others.length === 0) return null
  const at = items.data.findIndex((other) => other.id === item.id)
  const season = title.data.seasons.find((s) => s.number === item.seasonNumber)
  const name = season
    ? tr("title.episode.moreFrom", { season: seasonName(season.number) })
    : tr("title.episode.moreFromSeason")
  const headingClass =
    "focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
  const headingText = (
    <>
      <span className="truncate">{name}</span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
      />
    </>
  )
  // A show with one season lists its episodes on its own page.
  const heading =
    title.data.seasons.length === 1 ? (
      <Link
        to="/titles/$titleId"
        params={{ titleId: show.id }}
        className={headingClass}
      >
        {headingText}
      </Link>
    ) : (
      season && (
        <Link
          to="/titles/$titleId/seasons/$season"
          params={seasonParams(show, season)}
          className={headingClass}
        >
          {headingText}
        </Link>
      )
    )
  return (
    // A new episode starts the row over.
    <Rail
      key={item.id}
      title={name}
      heading={heading}
      startIndex={Math.max(0, at - 1)}
    >
      {others.map((other) => (
        <RailItem key={other.id}>
          <EpisodeCard item={other} showName={false} />
        </RailItem>
      ))}
    </Rail>
  )
}

/**
 * The show's name over the episode's, which goes to the show. A loose file
 * has its library there instead.
 */
function ShowLink({ item }: { item: MediaItem }) {
  const library = useQuery({
    ...orpc.libraries.get.queryOptions({ input: { id: item.libraryId } }),
    enabled: item.title === null,
  })
  // The negative margin sets the letters, not the line box, level with the
  // still's top.
  const className =
    "text-foreground -mt-1 text-xl leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8"
  if (item.title) {
    return (
      <p className={className}>
        <Link
          to="/titles/$titleId"
          params={{ titleId: item.title.id }}
          className={headingLink}
        >
          {item.title.name}
        </Link>
      </p>
    )
  }
  // Holds the line while the library loads, so nothing moves.
  if (!library.data) return <div className="-mt-1 h-7 sm:h-8" />
  return (
    <p className={className}>
      <Link
        to="/libraries/$libraryId"
        params={{ libraryId: item.libraryId }}
        className={headingLink}
      >
        {library.data.name}
      </Link>
    </p>
  )
}

/**
 * "Season 1 · Episode 2", or "Specials · Episode 3". The season goes to
 * its page.
 */
function EpisodeHeading({ item }: { item: MediaItem }) {
  const { seasonNumber: season, episodeNumber: number } = item
  if (season === null || number === null) return null
  const name =
    season === 0
      ? tr("title.episode.specials")
      : tr("title.episode.season", { number: String(season) })
  return (
    <p className="text-foreground/80 mt-1 text-base font-medium tabular-nums sm:text-lg">
      {item.title ? (
        <Link
          to="/titles/$titleId/seasons/$season"
          params={{ titleId: item.title.id, season: String(season) }}
          className={cn(headingLink, "hover:text-foreground")}
        >
          {name}
        </Link>
      ) : (
        name
      )}
      {" · "}
      {tr("title.episode.number", { number: String(number) })}
    </p>
  )
}
