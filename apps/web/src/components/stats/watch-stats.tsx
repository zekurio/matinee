import type { WatchStats } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { FilmIcon, PlayIcon, TvIcon, TvMinimalPlayIcon } from "lucide-react"

import { Picture, tone } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatCount, formatWatchTime } from "@/lib/format"
import { art } from "@/lib/media"
import { rangeName } from "@/lib/stats"

import {
  percent,
  RankedBars,
  type StatFigure,
  StatFigures,
  StatsSection,
  statsCard,
} from "./stat-blocks"
import { WatchChart } from "./watch-chart"

/** Whether the range has anything worth a chart. */
export function hasPlays(stats: WatchStats): boolean {
  return stats.totals.plays > 0
}

/** Figures for the range's plays and what was finished; the watch time has its card. */
export function watchFigures(stats: WatchStats): StatFigure[] {
  const { totals } = stats
  return [
    {
      label: tr("stats.figure.plays"),
      value: formatCount(totals.plays),
      icon: PlayIcon,
    },
    {
      label: tr("stats.figure.moviesFinished"),
      value: formatCount(totals.movies),
      icon: FilmIcon,
    },
    {
      label: tr("stats.figure.episodesFinished"),
      value: formatCount(totals.episodes),
      icon: TvIcon,
    },
    {
      label: tr("stats.figure.showsWatched"),
      value: formatCount(totals.shows),
      icon: TvMinimalPlayIcon,
    },
  ]
}

/**
 * The range's watch time as a card, the total big over the chart, with the
 * other figures as rows beside it on wide screens and under it on narrow.
 */
export function WatchOverview({
  stats,
  figures,
}: {
  stats: WatchStats
  figures: StatFigure[]
}) {
  return (
    // Side by side, the figures stretch to the card's height, a row each.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className={cn(statsCard, "flex min-w-0 flex-col gap-4 p-4")}>
        <div>
          <p className="text-muted-foreground text-sm leading-6">
            {`${tr("stats.figure.watchTime")} · ${rangeName(stats.range)}`}
          </p>
          <p className="text-4xl leading-tight font-bold tracking-tight tabular-nums">
            {formatWatchTime(stats.totals.watchSeconds)}
          </p>
        </div>
        <WatchChart buckets={stats.buckets} unit={stats.unit} />
      </section>
      <StatFigures figures={figures} className="self-stretch" />
    </div>
  )
}

/**
 * The most watched titles, ranked, with a small poster each. A bar is the
 * title's part of all the watch time in the range.
 */
export function TopTitlesSection({ stats }: { stats: WatchStats }) {
  const { titles } = stats
  if (titles.length === 0) return null
  const total = Math.max(1, stats.totals.watchSeconds)
  return (
    <StatsSection title={tr("stats.watch.top")}>
      <ol className="-mx-1.5 flex flex-col">
        {titles.map((entry, index) => {
          const poster = art(entry.title.images.poster)
          return (
            <li key={entry.title.id}>
              <Link
                to="/titles/$titleId"
                params={{ titleId: entry.title.id }}
                className="hover:bg-foreground/[0.05] focus-visible:ring-ring flex items-center gap-2.5 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2"
              >
                <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "relative aspect-[2/3] w-7 shrink-0 overflow-hidden rounded-[3px] border",
                    tone(entry.title.id),
                  )}
                >
                  {poster && <Picture sources={[poster]} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
                    <span className="truncate">{entry.title.name}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {`${formatWatchTime(entry.watchSeconds)} · `}
                      <span className="text-foreground font-medium">
                        {percent(entry.watchSeconds, total)}
                      </span>
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="bg-foreground/[0.07] h-[3px] rounded-full"
                  >
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{
                        width: `${Math.max((entry.watchSeconds / total) * 100, 1)}%`,
                      }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </StatsSection>
  )
}

/**
 * Watch time per genre, each bar against all the watch time. A title can
 * have several genres, so the bars add up to more than the whole and carry
 * no percent.
 */
export function GenresSection({ stats }: { stats: WatchStats }) {
  if (stats.genres.length === 0) return null
  return (
    <StatsSection title={tr("stats.watch.genres")}>
      <RankedBars
        total={stats.totals.watchSeconds}
        rows={stats.genres.map((genre) => ({
          key: genre.name,
          label: genre.name,
          value: genre.watchSeconds,
          detail: formatWatchTime(genre.watchSeconds),
        }))}
      />
    </StatsSection>
  )
}

export function WatchStatsSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}
