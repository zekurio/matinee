import type { Season, Title } from "@matinee/contracts"
import { Link } from "@tanstack/react-router"

import {
  cardClass,
  CardText,
  PosterArt,
  WatchedBadge,
} from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { art, seasonName } from "@/lib/media"

import { seasonKey, seasonParams } from "./seasons"

/**
 * A show's seasons by their posters, each opening the season's page. On a
 * season's page, `current` leaves that season out.
 */
export function SeasonsRail({
  title,
  current,
}: {
  title: Title
  current?: Season
}) {
  const seasons = current
    ? title.seasons.filter((s) => seasonKey(s) !== seasonKey(current))
    : title.seasons
  if (seasons.length === 0) return null
  return (
    <Rail title={current ? tr("title.seasons.more") : tr("title.seasons")}>
      {seasons.map((season) => (
        <RailItem key={seasonKey(season)} artwork="poster">
          <SeasonCard title={title} season={season} />
        </RailItem>
      ))}
    </Rail>
  )
}

/**
 * A season's poster, or the show's when it has none, with how many
 * episodes are left to watch in its corner, or a check once none are.
 */
function SeasonCard({ title, season }: { title: Title; season: Season }) {
  const left = season.itemCount - season.watchedCount
  return (
    <Link
      to="/titles/$titleId/seasons/$season"
      params={seasonParams(title, season)}
      className={cardClass}
    >
      <PosterArt
        name={tr("title.seasonOf", {
          show: title.name,
          season: seasonName(season.number),
        })}
        toneKey={title.id}
        poster={art(season.poster ?? title.images.poster)}
      >
        {left === 0 ? (
          <WatchedBadge className="absolute top-1.5 right-1.5" />
        ) : (
          <span
            role="img"
            aria-label={tr("title.seasons.left", { count: left })}
            className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums shadow-sm"
          >
            {left}
          </span>
        )}
      </PosterArt>
      <CardText
        primary={seasonName(season.number)}
        secondary={tr("title.episodeCount", { count: season.itemCount })}
      />
    </Link>
  )
}
