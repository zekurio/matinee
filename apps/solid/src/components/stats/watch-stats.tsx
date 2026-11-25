import type { WatchStats } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/solid-router"
import { Film, Play, Tv, TvMinimalPlay } from "lucide"
import { createSignal, For, Show } from "solid-js"

import { Picture, tone } from "@/components/picture"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import { formatCount, formatWatchTime } from "@/lib/format"
import { art } from "@/lib/media"
import { bucketName, rangeName } from "@/lib/stats"

import {
  RankedBars,
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
      icon: Play,
    },
    {
      label: tr("stats.figure.moviesFinished"),
      value: formatCount(totals.movies),
      icon: Film,
    },
    {
      label: tr("stats.figure.episodesFinished"),
      value: formatCount(totals.episodes),
      icon: Tv,
    },
    {
      label: tr("stats.figure.showsWatched"),
      value: formatCount(totals.shows),
      icon: TvMinimalPlay,
    },
  ]
}

/**
 * The range's watch time as a card, as the apps show it: the total, big,
 * over the bars. Pointing at a bar reads that day, week, or month out in
 * the total's place. Beside the figures on wide screens, the card takes
 * their height and the bars fill what's left of it.
 */
export function WatchOverview(props: {
  stats: WatchStats
  figures: StatFigure[]
}) {
  const [active, setActive] = createSignal<number | null>(null)
  const shown = () => {
    const index = active()
    return index === null ? undefined : props.stats.buckets[index]
  }
  const heading = () => {
    const bucket = shown()
    return bucket
      ? bucketName(bucket.start, props.stats.unit)
      : `${tr("stats.figure.watchTime")} · ${rangeName(props.stats.range)}`
  }
  return (
    // The page's grid of cards: the card two columns wide, the figures in
    // the third, so both line up with the cards below.
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <section
        class={cn(statsCard, "flex min-w-0 flex-col gap-4 p-4 md:col-span-2")}
      >
        <div>
          <p class="text-muted-foreground text-sm leading-6">{heading()}</p>
          <p class="text-4xl leading-tight font-bold tracking-tight tabular-nums">
            {formatWatchTime(
              shown()?.watchSeconds ?? props.stats.totals.watchSeconds,
            )}
          </p>
        </div>
        <WatchChart
          buckets={props.stats.buckets}
          unit={props.stats.unit}
          active={active()}
          onActive={setActive}
          class="min-h-36 flex-1 xl:min-h-20"
        />
      </section>
      <StatFigures
        figures={props.figures}
        class="md:col-span-2 xl:col-span-1"
      />
    </div>
  )
}

/**
 * The most watched titles, ranked, with a small poster each, how often
 * they were played, and their watch time at the end.
 */
export function TopTitlesSection(props: { stats: WatchStats }) {
  return (
    <Show when={props.stats.titles.length > 0}>
      <StatsSection title={tr("stats.watch.top")}>
        <ol class={statsRows}>
          <For each={props.stats.titles} keyed={(entry) => entry.title.id}>
            {(entry, index) => (
              <li>
                <Link
                  to="/titles/$titleId"
                  params={{ titleId: entry().title.id }}
                  class="hover:bg-foreground/[0.04] focus-visible:ring-ring flex items-center gap-3.5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  {/* The first three stand out, as on the apps. */}
                  <span
                    class={[
                      "w-6 shrink-0 text-base font-semibold tabular-nums",
                      index() < 3 ? "text-foreground" : "text-muted-foreground",
                    ]}
                  >
                    {index() + 1}
                  </span>
                  <span
                    class={[
                      "relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-[4px] border",
                      tone(entry().title.id),
                    ]}
                  >
                    <Show when={art(entry().title.images.poster)}>
                      {(poster) => <Picture sources={[poster()]} />}
                    </Show>
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="text-15px truncate leading-6">
                      {entry().title.name}
                    </span>
                    <span class="text-muted-foreground text-sm tabular-nums">
                      {tr("stats.plays", { count: entry().plays })}
                    </span>
                  </span>
                  <span class="text-15px shrink-0 font-semibold tabular-nums">
                    {formatWatchTime(entry().watchSeconds)}
                  </span>
                </Link>
              </li>
            )}
          </For>
        </ol>
      </StatsSection>
    </Show>
  )
}

/**
 * Watch time per genre. A title can have several genres, so their times
 * add up to more than the whole.
 */
export function GenresSection(props: { stats: WatchStats }) {
  return (
    <Show when={props.stats.genres.length > 0}>
      <StatsSection title={tr("stats.watch.genres")}>
        <RankedBars
          rows={props.stats.genres.map((genre) => ({
            key: genre.name,
            label: genre.name,
            value: genre.watchSeconds,
            detail: formatWatchTime(genre.watchSeconds),
          }))}
        />
      </StatsSection>
    </Show>
  )
}

export function WatchStatsSkeleton() {
  return (
    <div class="flex flex-col gap-10">
      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton class="h-64 rounded-xl" />
        <Skeleton class="h-48 rounded-xl" />
      </div>
    </div>
  )
}
