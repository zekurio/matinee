import type {
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardMetric,
  StatsRange,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { LockIcon, TrophyIcon } from "lucide-react"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { formatWatchTime } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { browserTimeZone, rangePhrase } from "@/lib/stats"

import { StatsEmpty, StatsSection, statsGrid } from "./stat-blocks"
import { WatchStatsSkeleton } from "./watch-stats"

const TIME_ZONE = browserTimeZone()
// Places the server sends per board before the viewer's own.
const TOP = 10

/** A metric's value as its board shows it: "4h 10m", "12 plays". */
function formatMetric(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case "watchTime":
      return formatWatchTime(value)
    case "plays":
      return tr("stats.plays", { count: value })
    case "currentStreak":
    case "longestStreak":
      return tr("stats.days", { count: value })
    case "movies":
      return tr("stats.movies", { count: value })
    case "episodes":
      return tr("stats.episodes", { count: value })
  }
}

// The podium: first in the accent, then fading.
const PODIUM = new Map([
  [1, "bg-primary text-primary-foreground"],
  [2, "bg-primary/60 text-primary-foreground"],
  [3, "bg-primary/30 text-foreground"],
])

/** People who share their statistics, ranked on each metric. */
export function LeaderboardView({
  range,
  onRange,
}: {
  range: StatsRange
  onRange: (range: StatsRange) => void
}) {
  const openSettings = useOpenSettings()
  const board = useQuery({
    ...orpc.stats.leaderboard.queryOptions({
      input: { range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  })
  if (board.isPending) return <WatchStatsSkeleton />
  if (!board.data) {
    return (
      <p className="text-muted-foreground text-sm">
        {errorMessage(board.error)}
      </p>
    )
  }
  const { boards, sharing } = board.data
  const join = (
    <Button variant="outline" onClick={() => openSettings("account")}>
      {tr("stats.leaderboard.join")}
    </Button>
  )
  if (boards.every((entry) => entry.entries.length === 0)) {
    return range === "all" ? (
      <StatsEmpty
        icon={TrophyIcon}
        title={tr("stats.leaderboard.empty")}
        description={tr("stats.leaderboard.emptyHint")}
        action={sharing ? undefined : join}
      />
    ) : (
      <StatsEmpty
        compact
        icon={TrophyIcon}
        title={tr("stats.leaderboard.noPlays", { period: rangePhrase(range) })}
        action={
          <Button variant="outline" onClick={() => onRange("all")}>
            {tr("stats.showAllTime")}
          </Button>
        }
      />
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {!sharing && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <LockIcon aria-hidden className="size-3.5 shrink-0" />
          {/* One run of text, so the message's own spaces and commas hold. */}
          <span>
            {trRich("stats.leaderboard.onlyYou", {
              share: (
                <button
                  type="button"
                  onClick={() => openSettings("account")}
                  className="text-foreground focus-visible:ring-ring rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                >
                  {tr("stats.leaderboard.share")}
                </button>
              ),
            })}
          </span>
        </p>
      )}
      <div className={statsGrid}>
        {boards.map((entry) => (
          <Board key={entry.metric} board={entry} />
        ))}
      </div>
    </div>
  )
}

function Board({ board }: { board: LeaderboardBoard }) {
  const { metric } = board
  return (
    <StatsSection title={tr(`stats.leaderboard.metric.${metric}`)}>
      {board.entries.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          {tr(`stats.leaderboard.none.${metric}`)}
        </p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {board.entries.map((entry, index) => (
            <Place
              key={entry.user.id}
              entry={entry}
              format={(value) => formatMetric(metric, value)}
              // The viewer's own place, sent after the top ones.
              apart={index === TOP}
            />
          ))}
        </ol>
      )}
    </StatsSection>
  )
}

function Place({
  entry,
  format,
  apart,
}: {
  entry: LeaderboardEntry
  format: (value: number) => string
  apart: boolean
}) {
  const { user } = entry
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1",
        entry.self && "bg-primary/10",
        apart && "mt-1.5",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
          PODIUM.get(entry.rank) ?? "text-muted-foreground",
        )}
      >
        <span className="sr-only">
          {tr("stats.leaderboard.place", { rank: entry.rank })}
        </span>
        <span aria-hidden>{entry.rank}</span>
      </span>
      <UserAvatar user={user} className="size-6 shrink-0 text-[11px]" />
      <Link
        to="/profiles/$username"
        params={{ username: user.username }}
        className="min-w-0 flex-1 truncate text-[13px] underline-offset-2 hover:underline"
      >
        {user.displayName ?? user.username}
        {entry.self && (
          <span className="text-muted-foreground font-normal">
            {" "}
            {tr("stats.leaderboard.you")}
          </span>
        )}
      </Link>
      <span className="shrink-0 text-[13px] font-medium tabular-nums">
        {format(entry.value)}
      </span>
    </li>
  )
}
