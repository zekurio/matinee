import type { MediaItem, Season, Title } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { skipToken, useQuery } from "@tanstack/react-query"
import { getRouteApi, Link, Navigate } from "@tanstack/react-router"

import { ActionsMenu } from "@/components/actions-menu"
import { pageBleed } from "@/components/app-shell"
import { SeasonFavoriteButton } from "@/components/favorite-button"
import { useDocumentTitle } from "@/components/page-header"
import { ItemTopBar, parentLink } from "@/components/phone-nav"
import { useSeasonWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { art, seasonName } from "@/lib/media"
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
import { titleOptions } from "./title-queries"

const route = getRouteApi("/_authed/_shell/titles/$titleId_/seasons/$season")

/** One season of a show: its poster and description, then its episodes. */
export function SeasonPage() {
  const { titleId, season: param } = route.useParams()
  const number = parseSeasonParam(param)
  const title = useQuery(titleOptions(titleId))
  // Asked for alongside the title rather than after it.
  const items = useQuery(
    orpc.titles.items.queryOptions({
      input: number === undefined ? skipToken : { id: titleId, season: number },
    }),
  )
  // Hidden specials still open from a link.
  const season =
    number === undefined
      ? undefined
      : (title.data?.seasons.find((s) => s.number === number) ??
        (title.data?.specials?.number === number
          ? title.data.specials
          : undefined))

  useDocumentTitle(
    title.data && season
      ? `${seasonName(season.number)} · ${title.data.name}`
      : null,
  )

  if (title.isPending) {
    return (
      <>
        <ItemTopBar />
        <TitleSkeleton />
      </>
    )
  }
  if (!title.data || !season) {
    return (
      <div className="py-24 text-center">
        <ItemTopBar />
        <h1 className="text-2xl font-semibold tracking-tight">
          {title.data
            ? tr("title.season.missing", { name: title.data.name })
            : tr("title.season.showError")}
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
            {tr("title.season.all")}
          </Link>
        ) : (
          <Link
            to="/"
            className={buttonVariants({
              variant: "secondary",
              className: "mt-6",
            })}
          >
            {tr("title.backHome")}
          </Link>
        )}
      </div>
    )
  }
  // A show with one season lists its episodes on its own page; hidden
  // specials aren't that season.
  if (title.data.seasons.length === 1 && season !== title.data.specials) {
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
      <ItemTopBar
        parent={
          <Link
            to="/titles/$titleId"
            params={{ titleId: title.data.id }}
            className={parentLink}
          >
            {title.data.name}
          </Link>
        }
      />
      {/* A new season starts the header over, collapsing its overview. */}
      <SeasonHeader
        key={`header-${seasonKey(season)}`}
        title={title.data}
        season={season}
        items={items.data}
      />
      {/* A new season starts the row over, on its own next episode. */}
      <SeasonEpisodes
        key={`episodes-${seasonKey(season)}`}
        title={title.data}
        season={season.number}
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
    tr("title.episodeCount", { count: season.itemCount }),
    season.watchedCount === 0
      ? null
      : season.watchedCount >= season.itemCount
        ? tr("title.season.watched")
        : tr("title.season.watchedCount", { count: season.watchedCount }),
  ].filter(Boolean)

  return (
    <section className={pageBleed} aria-labelledby="season-name">
      <HeaderBackdrop title={title} poster={poster} />

      <div className={headerColumn}>
        <div className={headerRow}>
          <HeaderPoster
            name={tr("title.seasonOf", {
              show: title.name,
              season: seasonName(season.number),
            })}
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
                {seasonName(season.number)}
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
                name={tr("title.seasonOf", {
                  show: title.name,
                  season: seasonName(season.number),
                })}
                overview={season.overview}
                className="sm:mt-4"
              />

              <div className="flex items-center gap-2 pt-6 sm:mt-auto">
                <PlayButton item={items ? seasonNext(title, items) : null} />
                <SeasonWatchedButton
                  title={title}
                  season={season}
                  items={items}
                />
                <SeasonFavoriteButton title={title} season={season} />
                <ActionsMenu
                  target={{ kind: "season", title, season }}
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

/** The tick beside Play, for every file of the season. */
function SeasonWatchedButton({
  title,
  season,
  items,
}: {
  title: Title
  season: Season
  /** The season's files, once loaded. */
  items: MediaItem[] | undefined
}) {
  return <WatchedButton watched={useSeasonWatched(title, season, items)} />
}
