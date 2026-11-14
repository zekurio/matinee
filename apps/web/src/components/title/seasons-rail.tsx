import type { Season, Title } from "@matinee/contracts"
import { Link } from "@tanstack/react-router"

import { ActionsMenu } from "@/components/actions-menu"
import { CardActions, CardScrim } from "@/components/card-actions"
import type { CatalogSeasonEntry } from "@/components/catalog/catalog-data"
import { CatalogSeasonCard } from "@/components/catalog/catalog-season-card"
import { useSeasonFavorite } from "@/components/favorite-button"
import {
  cardClass,
  CardText,
  PosterArt,
  UnwatchBadge,
} from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { useSeasonWatched } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { art, seasonName } from "@/lib/media"

import { seasonKey, seasonParams } from "./seasons"
import { useShowGaps } from "./show-gaps"

/**
 * A show's seasons by their posters, each opening the season's page, then
 * the seasons the server lacks, each with its own state and ask. On a
 * season's page, `current` leaves that season out. On the page of a show
 * with one season here, whose episodes are listed above, `extraOnly`
 * leaves out the library's seasons, and the rail is there only when the
 * server lacks some.
 */
export function SeasonsRail({
  title,
  current,
  extraOnly = false,
}: {
  title: Title
  current?: Season
  extraOnly?: boolean
}) {
  const gaps = useShowGaps(title)
  const seasons = extraOnly
    ? []
    : current
      ? title.seasons.filter((s) => seasonKey(s) !== seasonKey(current))
      : title.seasons
  const missing = gaps?.missing ?? []
  if (seasons.length === 0 && missing.length === 0) return null
  return (
    <Rail
      title={
        current || extraOnly ? tr("title.seasons.more") : tr("title.seasons")
      }
    >
      {seasons.map((season) => (
        <RailItem key={seasonKey(season)} artwork="poster">
          <SeasonCard
            title={title}
            season={season}
            partial={gaps?.partial.find((p) => p.number === season.number)}
          />
        </RailItem>
      ))}
      {gaps &&
        missing.map((season) => (
          <RailItem key={`missing-${season.number}`} artwork="poster">
            <CatalogSeasonCard
              show={{
                ref: gaps.ref,
                name: title.name,
                poster: title.images.poster,
              }}
              season={season}
              libraryId={gaps.libraryId}
              first={gaps.first}
            />
          </RailItem>
        ))}
    </Rail>
  )
}

/**
 * A season's poster, or the show's when it has none, with how many
 * episodes are left to watch in its corner, or a check once none are,
 * which marks it unwatched again. As on a poster, hovering or focusing it
 * shows the icons that mark it watched or a favorite and its "⋯" menu,
 * which touch screens always show.
 */
function SeasonCard({
  title,
  season,
  partial,
}: {
  title: Title
  season: Season
  /** What the server says of the season when only part of it is here. */
  partial?: CatalogSeasonEntry
}) {
  const watched = useSeasonWatched(title, season, undefined)
  const favorite = useSeasonFavorite(title, season)
  const name = tr("title.seasonOf", {
    show: title.name,
    season: seasonName(season.number),
  })
  // Marked unwatched, the counts catch up once the server answers; until
  // then every episode is left.
  const counted = season.itemCount - season.watchedCount
  const left = counted > 0 ? counted : season.itemCount
  return (
    <div className="group/card relative">
      <Link
        to="/titles/$titleId/seasons/$season"
        params={seasonParams(title, season)}
        title={name}
        className={cardClass}
      >
        <PosterArt
          name={name}
          toneKey={title.id}
          poster={art(season.poster ?? title.images.poster)}
          scrim
        >
          <CardScrim />
        </PosterArt>
        <CardText
          primary={seasonName(season.number)}
          secondary={
            partial
              ? tr("title.seasons.partial", {
                  here: partial.availability.episodesHere,
                  count: partial.availability.episodesAired,
                })
              : tr("title.episodeCount", { count: season.itemCount })
          }
        />
      </Link>
      {/* The buttons can't sit in the link, so this box lies over the
          poster to put them on it: the count or the check at the top, the
          icons at the bottom, clear of each other. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        {watched.on ? (
          <UnwatchBadge
            name={name}
            watched={watched}
            touch
            className="pointer-events-auto absolute top-1.5 right-1.5"
          />
        ) : (
          <span
            role="img"
            aria-label={tr("title.seasons.left", { count: left })}
            className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums shadow-sm"
          >
            {left}
          </span>
        )}
        <CardActions
          name={name}
          watched={watched}
          favorite={favorite}
          menu={
            <ActionsMenu
              target={{ kind: "season", title, season }}
              look="card"
            />
          }
          touch
          className="pointer-events-auto absolute right-1 bottom-1"
        />
      </div>
    </div>
  )
}
