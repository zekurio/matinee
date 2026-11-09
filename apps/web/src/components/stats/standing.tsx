import type {
  LeaderboardBoard,
  StatsRange,
  WatchStats,
} from "@matinee/contracts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { useQuery } from "@tanstack/react-query"
import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"
import { browserTimeZone, rangeName } from "@/lib/stats"

import { ActivityHeatmap } from "./activity-heatmap"
import { BoardPlaces, formatMetric, Place } from "./leaderboard-view"
import { StatsSection, statsRows } from "./stat-blocks"

const TIME_ZONE = browserTimeZone()

/**
 * Where the signed-in user stands on each board of the leaderboard for
 * the range: their place between the people just above and below them,
 * as the apps show it on the profile. A board's name opens it whole.
 * Boards they aren't on are left out.
 */
export function StandingSection({ range }: { range: StatsRange }) {
  const board = useQuery(
    orpc.stats.leaderboard.queryOptions({
      input: { range, timeZone: TIME_ZONE },
    }),
  )
  const [open, setOpen] = useState<LeaderboardBoard | null>(null)
  const standings = (board.data?.boards ?? []).flatMap((entry) => {
    const at = entry.entries.findIndex((place) => place.self)
    if (at < 0) return []
    return [
      {
        board: entry,
        places: entry.entries.slice(Math.max(0, at - 1), at + 2),
      },
    ]
  })
  if (standings.length === 0) return null
  return (
    <StatsSection title={tr("stats.standing.title")}>
      <ul className={statsRows}>
        {standings.map(({ board: { metric }, board: whole, places }) => (
          <li key={metric} className="flex flex-col gap-1.5 px-4 py-3">
            <button
              type="button"
              onClick={() => setOpen(whole)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-0.5 self-start rounded px-1 text-sm outline-none focus-visible:ring-2"
            >
              {tr(`stats.leaderboard.metric.${metric}`)}
              <ChevronRightIcon aria-hidden className="size-3.5" />
            </button>
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
      {open && (
        <BoardDialog board={open} range={range} onClose={() => setOpen(null)} />
      )}
    </StatsSection>
  )
}

/** A whole board, as the leaderboard shows it, over the profile. */
function BoardDialog({
  board,
  range,
  onClose,
}: {
  board: LeaderboardBoard
  range: StatsRange
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 p-6 sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg leading-7 font-semibold">
            {tr(`stats.leaderboard.metric.${board.metric}`)}
          </DialogTitle>
          <DialogDescription>{rangeName(range)}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 overflow-y-auto px-6">
          <BoardPlaces board={board} />
        </div>
      </DialogContent>
    </Dialog>
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
