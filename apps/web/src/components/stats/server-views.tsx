import type { ServerStats, StatsRange } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CalendarDaysIcon, SparklesIcon } from "lucide-react"
import type { ReactNode } from "react"

import { formatCount, formatWatchTime } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { browserTimeZone, rangePhrase } from "@/lib/stats"

import { WatchingNow } from "./now-playing"
import { Clients, Methods, TranscodingSections, Viewers } from "./server-panels"
import { StatsEmpty, statsGrid } from "./stat-blocks"
import {
  GenresSection,
  hasPlays,
  TopTitlesSection,
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
 * instant.
 */
function WithServerStats({
  range,
  onRange,
  children,
}: RangeProps & { children: (stats: ServerStats) => ReactNode }) {
  const stats = useQuery({
    ...orpc.stats.server.queryOptions({
      input: { range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  })
  if (stats.isPending) return <WatchStatsSkeleton />
  if (!stats.data) {
    return (
      <p className="text-muted-foreground text-sm">
        {errorMessage(stats.error)}
      </p>
    )
  }
  if (hasPlays(stats.data)) return children(stats.data)
  return <NoPlays range={range} onRange={onRange} />
}

/** No plays in the range: the first-run state for all time, else a nudge. */
export function NoPlays({ range, onRange }: RangeProps) {
  if (range === "all") {
    return (
      <StatsEmpty
        icon={SparklesIcon}
        title="Statistics fill in as people watch"
      />
    )
  }
  return (
    <StatsEmpty
      compact
      icon={CalendarDaysIcon}
      title={`No plays ${rangePhrase(range)}`}
      action={
        <Button variant="outline" onClick={() => onRange("all")}>
          Show all time
        </Button>
      }
    />
  )
}

/** Who is watching now, how much everyone watched, and what. */
export function ActivityView(props: RangeProps) {
  return (
    <div className="flex flex-col gap-10">
      <WatchingNow />
      <WithServerStats {...props}>
        {(stats) => (
          <div className="flex flex-col gap-10">
            <WatchOverview
              stats={stats}
              figures={[
                {
                  label: "Watch time",
                  value: formatWatchTime(stats.totals.watchSeconds),
                },
                { label: "Plays", value: formatCount(stats.totals.plays) },
                {
                  label: stats.viewers === 1 ? "Person" : "People",
                  value: formatCount(stats.viewers),
                },
                {
                  label: "Movies finished",
                  value: formatCount(stats.totals.movies),
                },
                {
                  label: "Episodes finished",
                  value: formatCount(stats.totals.episodes),
                },
                {
                  label: "Shows watched",
                  value: formatCount(stats.totals.shows),
                },
              ]}
            />
            <div className={statsGrid}>
              <TopTitlesSection stats={stats} />
              <GenresSection stats={stats} />
              <Viewers stats={stats} />
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
    <WithServerStats {...props}>
      {(stats) => {
        const { transcoding } = stats
        const converted =
          transcoding.videoTranscodes > 0 || transcoding.audioConversions > 0
        return (
          <div className={statsGrid}>
            <Methods methods={stats.methods} />
            <Clients stats={stats} />
            {converted ? (
              <TranscodingSections stats={stats} />
            ) : (
              <p className="text-muted-foreground text-[13px]">
                Nothing was transcoded in this period.
              </p>
            )}
          </div>
        )
      }}
    </WithServerStats>
  )
}
