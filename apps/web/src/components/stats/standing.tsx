import type { StatsRange, WatchStats } from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"
import { browserTimeZone } from "@/lib/stats"

import { ActivityHeatmap } from "./activity-heatmap"
import { formatMetric, Place } from "./leaderboard-view"
import { StatsSection, statsRows } from "./stat-blocks"

const TIME_ZONE = browserTimeZone()

/**
 * Where the signed-in user stands on each board of the leaderboard for
 * the range: their place between the people just above and below them,
 * as the apps show it on the profile. Boards they aren't on are left out.
 */
export function StandingSection({ range }: { range: StatsRange }) {
  const board = useQuery(
    orpc.stats.leaderboard.queryOptions({
      input: { range, timeZone: TIME_ZONE },
    }),
  )
  const standings = (board.data?.boards ?? []).flatMap((entry) => {
    const at = entry.entries.findIndex((place) => place.self)
    if (at < 0) return []
    return [
      {
        metric: entry.metric,
        places: entry.entries.slice(Math.max(0, at - 1), at + 2),
      },
    ]
  })
  if (standings.length === 0) return null
  return (
    <StatsSection title={tr("stats.standing.title")}>
      <ul className={statsRows}>
        {standings.map(({ metric, places }) => (
          <li key={metric} className="flex flex-col gap-1.5 px-4 py-3">
            <span className="text-muted-foreground text-sm">
              {tr(`stats.leaderboard.metric.${metric}`)}
            </span>
            <ol className="-mx-2 flex flex-col">
              {places.map((place) => (
                <Place
                  key={place.user.id}
                  entry={place}
                  format={(value) => formatMetric(metric, value)}
                  apart={false}
                />
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </StatsSection>
  )
}

/** When in the week and the day watching starts, as squares. */
export function ActivitySection({ stats }: { stats: WatchStats }) {
  return (
    <StatsSection title={tr("stats.heatmap.title")}>
      <ActivityHeatmap activity={stats.activity} />
    </StatsSection>
  )
}
