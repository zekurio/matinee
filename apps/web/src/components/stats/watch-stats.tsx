import type { WatchStats } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"

import { Picture, tone } from "@/components/media-item"
import { formatCount, formatWatchTime } from "@/lib/format"
import { art } from "@/lib/media"

import {
  percent,
  RankedBars,
  type StatFigure,
  StatFigures,
  StatsSection,
} from "./stat-blocks"
import { WatchChart, watchChartTitle } from "./watch-chart"

/** Whether the range has anything worth a chart. */
export function hasPlays(stats: WatchStats): boolean {
  return stats.totals.plays > 0
}

/** Figures for the range's watch time and what was finished. */
export function watchFigures(stats: WatchStats): StatFigure[] {
  const { totals } = stats
  return [
    { label: "Watch time", value: formatWatchTime(totals.watchSeconds) },
    { label: "Plays", value: formatCount(totals.plays) },
    { label: "Movies finished", value: formatCount(totals.movies) },
    { label: "Episodes finished", value: formatCount(totals.episodes) },
    { label: "Shows watched", value: formatCount(totals.shows) },
  ]
}

/** The headline figures, then the watch time chart under them. */
export function WatchOverview({
  stats,
  figures,
}: {
  stats: WatchStats
  figures: StatFigure[]
}) {
  return (
    <div className="flex flex-col gap-10">
      <StatFigures figures={figures} />
      <StatsSection title={watchChartTitle(stats.unit)}>
        <WatchChart buckets={stats.buckets} unit={stats.unit} />
      </StatsSection>
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
    <StatsSection title="Most watched">
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
    <StatsSection title="Genres">
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <Skeleton className="h-6 w-14" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-44 rounded-md" />
    </div>
  )
}
