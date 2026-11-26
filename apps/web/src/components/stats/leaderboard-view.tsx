import type {
  Leaderboard,
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardMetric,
  StatsRange,
} from "@matinee/contracts"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import { Lock, Trophy } from "lucide"
import { For, Match, Show, Switch } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { formatWatchTime } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { browserTimeZone, rangePhrase } from "@/lib/stats"

import { StatsEmpty, StatsSection, StatsGrid } from "./stat-blocks"
import { WatchStatsSkeleton } from "./watch-stats"

const TIME_ZONE = browserTimeZone()
// Places the server sends per board before the viewer's own.
const TOP = 10

/** A metric's value as its board shows it: "4h 10m", "12 plays". */
export function formatMetric(metric: LeaderboardMetric, value: number): string {
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
export function LeaderboardView(props: {
  range: StatsRange
  onRange: (range: StatsRange) => void
}) {
  const board = useQuery(() => ({
    ...orpc.stats.leaderboard.queryOptions({
      input: { range: props.range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  }))
  return (
    <Switch
      fallback={
        <p class="text-muted-foreground text-sm">{errorMessage(board.error)}</p>
      }
    >
      <Match when={board.isPending}>
        <WatchStatsSkeleton />
      </Match>
      <Match when={board.isSuccess && board.data}>
        {(data) => (
          <Boards result={data()} range={props.range} onRange={props.onRange} />
        )}
      </Match>
    </Switch>
  )
}

function Boards(props: {
  result: Leaderboard
  range: StatsRange
  onRange: (range: StatsRange) => void
}) {
  const openSettings = useOpenSettings()
  const join = () => (
    <Button variant="outline" onClick={() => openSettings("account")}>
      {tr("stats.leaderboard.join")}
    </Button>
  )
  const empty = () =>
    props.result.boards.every((entry) => entry.entries.length === 0)
  return (
    <Show
      when={!empty()}
      fallback={
        <Show
          when={props.range === "all"}
          fallback={
            <StatsEmpty
              compact
              icon={Trophy}
              title={tr("stats.leaderboard.noPlays", {
                period: rangePhrase(props.range),
              })}
              action={
                <Button variant="outline" onClick={() => props.onRange("all")}>
                  {tr("stats.showAllTime")}
                </Button>
              }
            />
          }
        >
          <StatsEmpty
            icon={Trophy}
            title={tr("stats.leaderboard.empty")}
            description={tr("stats.leaderboard.emptyHint")}
            action={props.result.sharing ? undefined : join()}
          />
        </Show>
      }
    >
      <div class="flex flex-col gap-6">
        <Show when={!props.result.sharing}>
          <p class="text-muted-foreground text-13px flex flex-wrap items-center gap-x-2 gap-y-1">
            <Icon icon={Lock} class="size-3.5 shrink-0" />
            {/* One run of text, so the message's own spaces and commas hold. */}
            <span>
              {trRich("stats.leaderboard.onlyYou", {
                share: (
                  <button
                    type="button"
                    onClick={() => openSettings("account")}
                    class="text-foreground focus-visible:ring-ring rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                  >
                    {tr("stats.leaderboard.share")}
                  </button>
                ),
              })}
            </span>
          </p>
        </Show>
        <StatsGrid>
          <For each={props.result.boards} keyed={(entry) => entry.metric}>
            {(entry) => <Board board={entry()} />}
          </For>
        </StatsGrid>
      </div>
    </Show>
  )
}

function Board(props: { board: LeaderboardBoard }) {
  return (
    <StatsSection title={tr(`stats.leaderboard.metric.${props.board.metric}`)}>
      <Show
        when={props.board.entries.length > 0}
        fallback={
          <p class="text-muted-foreground text-13px">
            {tr(`stats.leaderboard.none.${props.board.metric}`)}
          </p>
        }
      >
        <BoardPlaces board={props.board} />
      </Show>
    </StatsSection>
  )
}

/**
 * A board's places: the top ones, then the viewer's neighborhood, set off
 * unless it carries straight on from them.
 */
export function BoardPlaces(props: { board: LeaderboardBoard }) {
  return (
    <ol class="-mx-2 flex flex-col">
      <For each={props.board.entries} keyed={(entry) => entry.user.id}>
        {(entry, index) => (
          <Place
            entry={entry()}
            format={(value) => formatMetric(props.board.metric, value)}
            apart={
              index() === TOP &&
              entry().rank > (props.board.entries[TOP - 1]?.rank ?? 0) + 1
            }
          />
        )}
      </For>
    </ol>
  )
}

export function Place(props: {
  entry: LeaderboardEntry
  format: (value: number) => string
  apart: boolean
}) {
  return (
    <li
      class={[
        "flex items-center gap-2.5 rounded-md px-2 py-1",
        { "bg-primary/10": props.entry.self, "mt-1.5": props.apart },
      ]}
    >
      <span
        class={[
          "text-11px grid size-5 shrink-0 place-items-center rounded-full font-semibold tabular-nums",
          PODIUM.get(props.entry.rank) ?? "text-muted-foreground",
        ]}
      >
        <span class="sr-only">
          {tr("stats.leaderboard.place", { rank: props.entry.rank })}
        </span>
        <span aria-hidden="true">{props.entry.rank}</span>
      </span>
      <UserAvatar user={props.entry.user} class="text-11px size-6 shrink-0" />
      <Link
        to="/profiles/$username"
        params={{ username: props.entry.user.username }}
        class="text-13px min-w-0 flex-1 truncate underline-offset-2 hover:underline"
      >
        {props.entry.user.displayName ?? props.entry.user.username}
        <Show when={props.entry.self}>
          <span class="text-muted-foreground font-normal">
            {" "}
            {tr("stats.leaderboard.you")}
          </span>
        </Show>
      </Link>
      <span class="text-13px shrink-0 font-medium tabular-nums">
        {props.format(props.entry.value)}
      </span>
    </li>
  )
}
