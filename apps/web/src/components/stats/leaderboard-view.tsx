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
import { formatWatchTime, plural } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { browserTimeZone, rangePhrase } from "@/lib/stats"

import { StatsEmpty, StatsSection, statsGrid } from "./stat-blocks"
import { WatchStatsSkeleton } from "./watch-stats"

const TIME_ZONE = browserTimeZone()
// Places the server sends per board before the viewer's own.
const TOP = 10

type MetricInfo = {
  title: string
  format: (value: number) => string
  /** Said when nobody has a value, after "Nobody". */
  empty: string
}

const METRICS = new Map<LeaderboardMetric, MetricInfo>([
  [
    "watchTime",
    {
      title: "Watch time",
      format: formatWatchTime,
      empty: "has watched anything",
    },
  ],
  [
    "plays",
    {
      title: "Plays",
      format: (value) => plural(value, "play"),
      empty: "has played anything",
    },
  ],
  [
    "currentStreak",
    {
      title: "Current streak",
      format: (value) => plural(value, "day"),
      empty: "is on a streak right now",
    },
  ],
  [
    "longestStreak",
    {
      title: "Longest streak",
      format: (value) => plural(value, "day"),
      empty: "has a streak",
    },
  ],
  [
    "movies",
    {
      title: "Movies finished",
      format: (value) => plural(value, "movie"),
      empty: "has finished a movie",
    },
  ],
  [
    "episodes",
    {
      title: "Episodes finished",
      format: (value) => plural(value, "episode"),
      empty: "has finished an episode",
    },
  ],
])

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
      Share my statistics
    </Button>
  )
  if (boards.every((entry) => entry.entries.length === 0)) {
    return range === "all" ? (
      <StatsEmpty
        icon={TrophyIcon}
        title="The leaderboard fills in as people watch"
        description="Only people who share their statistics show up."
        action={sharing ? undefined : join}
      />
    ) : (
      <StatsEmpty
        compact
        icon={TrophyIcon}
        title={`Nobody played anything ${rangePhrase(range)}`}
        action={
          <Button variant="outline" onClick={() => onRange("all")}>
            Show all time
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
          Only you see yourself here.
          <button
            type="button"
            onClick={() => openSettings("account")}
            className="text-foreground focus-visible:ring-ring rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2"
          >
            Share your statistics
          </button>
          to take part.
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
  const info = METRICS.get(board.metric)
  if (!info) return null
  return (
    <StatsSection title={info.title}>
      {board.entries.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          {`Nobody ${info.empty} yet.`}
        </p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {board.entries.map((entry, index) => (
            <Place
              key={entry.user.id}
              entry={entry}
              format={info.format}
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
        <span className="sr-only">Place </span>
        {entry.rank}
      </span>
      <UserAvatar user={user} className="size-6 shrink-0 text-[11px]" />
      <Link
        to="/profiles/$username"
        params={{ username: user.username }}
        className="min-w-0 flex-1 truncate text-[13px] underline-offset-2 hover:underline"
      >
        {user.displayName ?? user.username}
        {entry.self && (
          <span className="text-muted-foreground font-normal"> (you)</span>
        )}
      </Link>
      <span className="shrink-0 text-[13px] font-medium tabular-nums">
        {format(entry.value)}
      </span>
    </li>
  )
}
