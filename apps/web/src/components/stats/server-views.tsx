import type { ServerStats, StatsRange } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { CalendarDays, Sparkles, Users } from "lucide"
import { Match, Show, Switch } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { formatCount } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { browserTimeZone, rangePhrase } from "@/lib/stats"

import { WatchingNow } from "./now-playing"
import { Clients, Methods, TranscodingSections, Viewers } from "./server-panels"
import { ActivitySection } from "./standing"
import { StatsEmpty, statsGrid } from "./stat-blocks"
import {
  GenresSection,
  hasPlays,
  TopTitlesSection,
  watchFigures,
  WatchOverview,
  WatchStatsSkeleton,
} from "./watch-stats"

const TIME_ZONE = browserTimeZone()

type RangeProps = {
  range: StatsRange
  onRange: (range: StatsRange) => void
}

/**
 * Everyone's statistics for the range, once they load and have plays.
 * Activity and Playback share the query, so switching between them is
 * instant. The children get the statistics as an accessor, so a new range
 * updates what they drew rather than drawing it again.
 */
function WithServerStats(
  props: RangeProps & { children: (stats: () => ServerStats) => JSX.Element },
) {
  const stats = useQuery(() => ({
    ...orpc.stats.server.queryOptions({
      input: { range: props.range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  }))
  return (
    <Switch
      fallback={
        <p class="text-muted-foreground text-sm">{errorMessage(stats.error)}</p>
      }
    >
      <Match when={stats.isPending}>
        <WatchStatsSkeleton />
      </Match>
      <Match when={stats.isSuccess && stats.data}>
        {(data) => (
          <Show
            when={hasPlays(data())}
            fallback={<NoPlays range={props.range} onRange={props.onRange} />}
          >
            {props.children(data)}
          </Show>
        )}
      </Match>
    </Switch>
  )
}

/** No plays in the range: the first-run state for all time, else a nudge. */
function NoPlays(props: RangeProps) {
  return (
    <Show
      when={props.range !== "all"}
      fallback={<StatsEmpty icon={Sparkles} title={tr("stats.server.empty")} />}
    >
      <StatsEmpty
        compact
        icon={CalendarDays}
        title={tr("stats.server.noPlays", { period: rangePhrase(props.range) })}
        action={
          <Button variant="outline" onClick={() => props.onRange("all")}>
            {tr("stats.showAllTime")}
          </Button>
        }
      />
    </Show>
  )
}

/** Who is watching now, how much everyone watched, and what. */
export function ActivityView(props: RangeProps) {
  return (
    <div class="flex flex-col gap-10">
      <WatchingNow />
      <WithServerStats range={props.range} onRange={props.onRange}>
        {(stats) => (
          <div class="flex flex-col gap-4">
            <WatchOverview
              stats={stats()}
              figures={[
                {
                  label: tr("stats.figure.people", { count: stats().viewers }),
                  value: formatCount(stats().viewers),
                  icon: Users,
                },
                ...watchFigures(stats()),
              ]}
            />
            <div class={statsGrid}>
              <TopTitlesSection stats={stats()} />
              <GenresSection stats={stats()} />
              <div class="flex flex-col gap-4">
                <Viewers stats={stats()} />
                <ActivitySection stats={stats()} />
              </div>
            </div>
          </div>
        )}
      </WithServerStats>
    </div>
  )
}

/** How the server played what people watched, and what it converted. */
export function PlaybackView(props: RangeProps) {
  return (
    <WithServerStats range={props.range} onRange={props.onRange}>
      {(stats) => (
        <div class={statsGrid}>
          <Methods methods={stats().methods} />
          <Clients stats={stats()} />
          <Show
            when={
              stats().transcoding.videoTranscodes > 0 ||
              stats().transcoding.audioConversions > 0
            }
            fallback={
              <p class="text-muted-foreground text-13px">
                {tr("stats.server.nothingTranscoded")}
              </p>
            }
          >
            <TranscodingSections stats={stats()} />
          </Show>
        </div>
      )}
    </WithServerStats>
  )
}
