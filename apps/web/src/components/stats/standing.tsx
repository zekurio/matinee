import type {
  LeaderboardBoard,
  StatsRange,
  WatchStats,
} from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import { ChevronRight } from "lucide"
import { createMemo, createSignal, For, Show } from "solid-js"

import { tr } from "@/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
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
export function StandingSection(props: { range: StatsRange }) {
  const board = useQuery(() =>
    orpc.stats.leaderboard.queryOptions({
      input: { range: props.range, timeZone: TIME_ZONE },
    }),
  )
  const [open, setOpen] = createSignal<LeaderboardBoard | null>(null)
  const standings = createMemo(() =>
    (board.isSuccess ? board.data.boards : []).flatMap((entry) => {
      const at = entry.entries.findIndex((place) => place.self)
      if (at < 0) return []
      return [
        {
          board: entry,
          places: entry.entries.slice(Math.max(0, at - 1), at + 2),
        },
      ]
    }),
  )
  return (
    <Show when={standings().length > 0}>
      <StatsSection title={tr("stats.standing.title")}>
        <ul class={statsRows}>
          <For each={standings()} keyed={(standing) => standing.board.metric}>
            {(standing) => (
              <li class="flex flex-col gap-1.5 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(standing().board)}
                  class="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-0.5 self-start rounded px-1 text-sm outline-none focus-visible:ring-2"
                >
                  {tr(`stats.leaderboard.metric.${standing().board.metric}`)}
                  <Icon icon={ChevronRight} class="size-3.5" />
                </button>
                <ol class="-mx-2 flex flex-col">
                  <For
                    each={standing().places}
                    keyed={(place) => place.user.id}
                  >
                    {(place) => (
                      <Place
                        entry={place()}
                        format={(value) =>
                          formatMetric(standing().board.metric, value)
                        }
                        apart={false}
                      />
                    )}
                  </For>
                </ol>
              </li>
            )}
          </For>
        </ul>
        <Show when={open()}>
          {(whole) => (
            <BoardDialog
              board={whole()}
              range={props.range}
              onClose={() => setOpen(null)}
            />
          )}
        </Show>
      </StatsSection>
    </Show>
  )
}

/** A whole board, as the leaderboard shows it, over the profile. */
function BoardDialog(props: {
  board: LeaderboardBoard
  range: StatsRange
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 p-6 sm:max-w-md">
        <DialogHeader class="pr-8">
          <DialogTitle class="text-lg leading-7 font-semibold">
            {tr(`stats.leaderboard.metric.${props.board.metric}`)}
          </DialogTitle>
          <DialogDescription>{rangeName(props.range)}</DialogDescription>
        </DialogHeader>
        <div class="-mx-6 min-h-0 overflow-y-auto px-6">
          <BoardPlaces board={props.board} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** When in the week and the day watching starts, as squares. */
export function ActivitySection(props: { stats: WatchStats }) {
  return (
    <StatsSection title={tr("stats.heatmap.title")}>
      <ActivityHeatmap activity={props.stats.activity} />
    </StatsSection>
  )
}
