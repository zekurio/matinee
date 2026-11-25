import { StatsRange } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { createFileRoute } from "@tanstack/solid-router"
import { createMemo, createSignal, For, Match, Switch } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { LeaderboardView } from "@/components/stats/leaderboard-view"
import { LibraryView } from "@/components/stats/library-view"
import { RangePicker } from "@/components/stats/range-picker"
import { ActivityView, PlaybackView } from "@/components/stats/server-views"
import { tr } from "@/i18n"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { can } from "@/lib/permissions"

const STATS_VIEWS = ["activity", "playback", "library", "leaderboard"] as const
const StatsView = t.enum(STATS_VIEWS)
type StatsView = t.infer<typeof StatsView>

/** The views only admins see. */
const ADMIN_VIEWS = new Set<StatsView>(["activity", "playback"])

/** 30 days is the default period, so the URL leaves it out. */
const StatsSearch = t.object({
  view: StatsView.optional().catch(undefined),
  range: StatsRange.exclude(["30d"]).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/stats")({
  validateSearch: StatsSearch,
  component: StatsPage,
})

function StatsPage() {
  const context = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const admin = () => can(context().user, "serverStats.read")
  const range = (): StatsRange => search().range ?? "30d"
  const options = createMemo(() =>
    STATS_VIEWS.filter((view) => admin() || !ADMIN_VIEWS.has(view)).map(
      (view) => ({ value: view, label: tr(`stats.view.${view}`) }),
    ),
  )
  // Admins start on what's happening; everyone else on the leaderboard.
  const view = (): StatsView => {
    const wanted = search().view
    if (wanted && options().some((option) => option.value === wanted)) {
      return wanted
    }
    return admin() ? "activity" : "leaderboard"
  }
  // The select shows a pick at once, before the navigation lands it in the
  // address, and follows the address on Back and Forward.
  const [picked, setPicked] = createSignal(() => view())
  const label = () =>
    options().find((option) => option.value === picked())?.label ?? ""

  useDocumentTitle(() => tr("stats.title"))

  const setRange = (next: StatsRange) =>
    void navigate({
      search: (prev) => ({ ...prev, range: next === "30d" ? undefined : next }),
      replace: true,
      resetScroll: false,
    })

  return (
    <div class={[pageGutter, "sm:pt-8"]}>
      {/* Phones keep the header as the page's bar, which stays put while
          the page scrolls, so it can't sit in a row of its own. */}
      <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 max-sm:contents">
        <PageHeader title={tr("stats.title")} class="mb-0 md:mb-0" />
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3 max-sm:mb-6">
          <Select
            value={picked()}
            onValueChange={(next) => {
              if (!next) return
              setPicked(next)
              void navigate({
                search: (prev) => ({ ...prev, view: next }),
                resetScroll: false,
              })
            }}
          >
            <SelectTrigger
              aria-label={tr("stats.title")}
              class="min-w-44 shrink-0 justify-between gap-1"
            >
              <SelectValue>{label()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <For each={options()} keyed={(option) => option.value}>
                {(option) => (
                  <SelectItem value={option().value} label={option().label}>
                    {option().label}
                  </SelectItem>
                )}
              </For>
            </SelectContent>
          </Select>
          <RangePicker value={range()} onChange={setRange} />
        </div>
      </div>
      <Switch>
        <Match when={view() === "activity"}>
          <ActivityView range={range()} onRange={setRange} />
        </Match>
        <Match when={view() === "playback"}>
          <PlaybackView range={range()} onRange={setRange} />
        </Match>
        <Match when={view() === "library"}>
          <LibraryView range={range()} admin={admin()} />
        </Match>
        <Match when={view() === "leaderboard"}>
          <LeaderboardView range={range()} onRange={setRange} />
        </Match>
      </Switch>
    </div>
  )
}
