import type { WatchStats } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { FilmIcon, PlayIcon, TvIcon, TvMinimalPlayIcon } from "lucide-react"
import { useState } from "react"

import { Picture, tone } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatCount, formatWatchTime } from "@/lib/format"
import { art } from "@/lib/media"
import { bucketName, rangeName } from "@/lib/stats"

import {
  percent,
  RankedBars,
  ShareBar,
  type StatFigure,
  StatFigures,
  StatsSection,
  statsCard,
  statsRows,
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
 * The range's watch time as a card, as the apps show it: the total, big,
 * over the bars. Pointing at a bar reads that day, week, or month out in
 * the total's place. Beside the figures on wide screens, the card takes
 * their height and the bars fill what's left of it.
 */
export function WatchOverview({
  stats,
  figures,
}: {
  stats: WatchStats
  figures: StatFigure[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const shown = active === null ? null : stats.buckets[active]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className={cn(statsCard, "flex min-w-0 flex-col gap-4 p-4")}>
        <div>
          <p className="text-muted-foreground text-sm leading-6">
            {shown
              ? bucketName(shown.start, stats.unit)
              : `${tr("stats.figure.watchTime")} · ${rangeName(stats.range)}`}
          </p>
          <p className="text-4xl leading-tight font-bold tracking-tight tabular-nums">
            {formatWatchTime(shown?.watchSeconds ?? stats.totals.watchSeconds)}
          </p>
        </div>
        <WatchChart
          buckets={stats.buckets}
          unit={stats.unit}
          active={active}
          onActive={setActive}
          className="min-h-36 flex-1 lg:min-h-20"
        />
      </section>
      <StatFigures figures={figures} />
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
      <ol className={statsRows}>
        {titles.map((entry, index) => {
          const poster = art(entry.title.images.poster)
          return (
            <li key={entry.title.id}>
              <Link
                to="/titles/$titleId"
                params={{ titleId: entry.title.id }}
                className="hover:bg-foreground/[0.04] focus-visible:ring-ring flex items-center gap-3.5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              >
                {/* The first three stand out, as on the apps. */}
                <span
                  className={cn(
                    "w-6 shrink-0 text-base font-semibold tabular-nums",
                    index < 3 ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-[4px] border",
                    tone(entry.title.id),
                  )}
                >
                  {poster && <Picture sources={[poster]} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] leading-6">
                    {entry.title.name}
                  </span>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatWatchTime(entry.watchSeconds)}
                  </span>
                  <span className="mt-2">
                    <ShareBar value={entry.watchSeconds} scale={total} />
                  </span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                  {percent(entry.watchSeconds, total)}
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
