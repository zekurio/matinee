import type { MediaItem, Season, Title, WatchedAt } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { skipToken, useQuery } from "@tanstack/react-query"
import { getRouteApi, Link, Navigate } from "@tanstack/react-router"
import { EllipsisIcon } from "lucide-react"
import { useState } from "react"

import { pageBleed } from "@/components/app-shell"
import { useDocumentTitle } from "@/components/page-header"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { useSetTitleWatched, WatchedMenuItems } from "@/components/watched-menu"
import { plural } from "@/lib/format"
import { art } from "@/lib/media"
import { errorMessage, orpc } from "@/lib/rpc"

import { SeasonEpisodes } from "./episodes"
import { HeaderOverview } from "./header-overview"
import { parseSeasonParam, seasonKey, seasonNext } from "./seasons"
import { SeasonsRail } from "./seasons-rail"
import {
  HeaderBackdrop,
  headerColumn,
  HeaderPoster,
  headerRow,
  PlayButton,
} from "./title-header"
import { TitleSkeleton } from "./title-page"

const route = getRouteApi("/_authed/_shell/titles/$titleId_/seasons/$season")

/** One season of a show: its poster and description, then its episodes. */
export function SeasonPage() {
  const { titleId, season: param } = route.useParams()
  const number = parseSeasonParam(param)
  const title = useQuery(
    orpc.titles.get.queryOptions({ input: { id: titleId } }),
  )
  // Asked for alongside the title rather than after it.
  const items = useQuery(
    orpc.titles.items.queryOptions({
      input: number === undefined ? skipToken : { id: titleId, season: number },
    }),
  )
  const season =
    number === undefined
      ? undefined
      : title.data?.seasons.find((s) => s.number === number)

  useDocumentTitle(
    title.data && season ? `${season.name} · ${title.data.name}` : null,
  )

  if (title.isPending) return <TitleSkeleton />
  if (!title.data || !season) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {title.data
            ? `${title.data.name} has no such season`
            : "Couldn't load this show"}
        </h1>
        {!title.data && (
          <p className="text-muted-foreground mt-2 text-sm">
            {errorMessage(title.error)}
          </p>
        )}
        {title.data ? (
          <Link
            to="/titles/$titleId"
            params={{ titleId: title.data.id }}
            className={buttonVariants({
              variant: "secondary",
              className: "mt-6",
            })}
          >
            See all seasons
          </Link>
        ) : (
          <Link
            to="/"
            className={buttonVariants({
              variant: "secondary",
              className: "mt-6",
            })}
          >
            Back to Home
          </Link>
        )}
      </div>
    )
  }
  // A show with one season lists its episodes on its own page.
  if (title.data.seasons.length === 1) {
    return (
      <Navigate
        to="/titles/$titleId"
        params={{ titleId: title.data.id }}
        replace
      />
    )
  }
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* A new season starts the header over, collapsing its overview. */}
      <SeasonHeader
        key={seasonKey(season)}
        title={title.data}
        season={season}
        items={items.data}
      />
      {/* A new season starts the row over, on its own next episode. */}
      <SeasonEpisodes
        key={seasonKey(season)}
        title={title.data}
        items={items.data}
        error={items.isError ? errorMessage(items.error) : null}
      />
      <SeasonsRail title={title.data} current={season} />
    </div>
  )
}

/**
 * The top of a season's page, laid out as the show's: the show's backdrop,
 * the season's poster, the show's name over the season's, and Play.
 */
function SeasonHeader({
  title,
  season,
  items,
}: {
  title: Title
  season: Season
  items: MediaItem[] | undefined
}) {
  const poster = season.poster ?? title.images.poster
  // The year the season started airing.
  const year = items?.[0]?.episode?.airDate?.slice(0, 4)
  const facts = [
    year,
    plural(season.itemCount, "episode"),
    season.watchedCount === 0
      ? null
      : season.watchedCount >= season.itemCount
        ? "Watched"
        : `${season.watchedCount} watched`,
  ].filter(Boolean)

  return (
    <section className={pageBleed} aria-labelledby="season-name">
      <HeaderBackdrop title={title} poster={poster} />

      <div className={headerColumn}>
        <div className={headerRow}>
          <HeaderPoster
            name={`${title.name}: ${season.name}`}
            toneKey={title.id}
            poster={art(poster)}
          />

          <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
            <div className="min-w-0">
              {/* The negative margin sets the letters, not the line box,
                  level with the poster's top. */}
              <p className="-mt-1 text-lg leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8">
                <Link
                  to="/titles/$titleId"
                  params={{ titleId: title.id }}
                  className="focus-visible:ring-ring decoration-foreground/40 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"
                >
                  {title.name}
                </Link>
              </p>
              <h1
                id="season-name"
                className="mt-1 text-2xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
              >
                {season.name}
              </h1>

              <div className="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm tabular-nums">
                <span>{facts.join(" · ")}</span>
                {title.contentRating && (
                  <span className="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                    {title.contentRating}
                  </span>
                )}
              </div>
            </div>

            <div className="col-span-2 min-w-0 sm:flex sm:flex-1 sm:flex-col">
              <HeaderOverview
                name={`${title.name}: ${season.name}`}
                overview={season.overview}
                className="sm:mt-4"
              />

              <div className="flex items-center gap-2 pt-6 sm:mt-auto">
                <PlayButton
                  item={items ? seasonNext(title, items) : null}
                  code={season.number !== null}
                />
                <SeasonMenu title={title} season={season} items={items} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Mark the season watched or unwatched. */
function SeasonMenu({
  title,
  season,
  items,
}: {
  title: Title
  season: Season
  /** The season's files, once loaded. They change before the counts do. */
  items: MediaItem[] | undefined
}) {
  const setWatched = useSetTitleWatched()
  const [picking, setPicking] = useState(false)
  const watched = items
    ? items.every((item) => item.progress?.completed)
    : season.watchedCount >= season.itemCount
  const started = items
    ? items.some((item) => item.progress !== null)
    : season.watchedCount > 0
  const mark = (next: boolean, watchedAt?: WatchedAt) =>
    setWatched.mutate({
      titleId: title.id,
      season: season.number,
      watched: next,
      watchedAt,
    })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-lg"
              aria-label={`More actions for ${season.name}`}
              className="border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-52">
          <WatchedMenuItems
            scope="season"
            watched={watched}
            started={started}
            onSelect={mark}
            onPickDate={() => setPicking(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <WatchedDateDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(watchedAt) => mark(true, watchedAt)}
      />
    </>
  )
}
