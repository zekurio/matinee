import { StatsRange } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { createFileRoute } from "@tanstack/react-router"

import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { LeaderboardView } from "@/components/stats/leaderboard-view"
import { LibraryView } from "@/components/stats/library-view"
import { RangePicker } from "@/components/stats/range-picker"
import { ActivityView, PlaybackView } from "@/components/stats/server-views"
import { tr } from "@/i18n"

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
  const { user } = Route.useRouteContext()
  const { view: wanted, range = "30d" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const admin = user.role === "admin"
  const options = STATS_VIEWS.filter(
    (view) => admin || !ADMIN_VIEWS.has(view),
  ).map((view) => ({ value: view, label: tr(`stats.view.${view}`) }))
  // Admins start on what's happening; everyone else on the leaderboard.
  const view: StatsView =
    wanted && options.some((option) => option.value === wanted)
      ? wanted
      : admin
        ? "activity"
        : "leaderboard"

  useDocumentTitle(tr("stats.title"))

  const setRange = (next: StatsRange) =>
    void navigate({
      search: (prev) => ({ ...prev, range: next === "30d" ? undefined : next }),
      replace: true,
      resetScroll: false,
    })

  return (
    <>
      {/* Phones keep the header as the page's bar, which stays put while
          the page scrolls, so it can't sit in a row of its own. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 max-sm:contents">
        <PageHeader title={tr("stats.title")} className="mb-0 md:mb-0" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 max-sm:mb-6">
          <Select
            items={options}
            value={view}
            onValueChange={(next) =>
              next &&
              void navigate({
                search: (prev) => ({ ...prev, view: next }),
                resetScroll: false,
              })
            }
          >
            <SelectTrigger
              aria-label={tr("stats.title")}
              className="min-w-44 shrink-0 justify-between gap-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>
      {view === "activity" ? (
        <ActivityView range={range} onRange={setRange} />
      ) : view === "playback" ? (
        <PlaybackView range={range} onRange={setRange} />
      ) : view === "library" ? (
        <LibraryView range={range} admin={admin} />
      ) : (
        <LeaderboardView range={range} onRange={setRange} />
      )}
    </>
  )
}
