import type { ActivityCell } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { createMemo, For } from "solid-js"

import { tr } from "@/i18n"
import { formatWatchTime } from "@/lib/format"
import { hourName, WEEKDAYS, weekdayName } from "@/lib/stats"

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const AXIS_HOURS = [0, 6, 12, 18]

/**
 * Watch time by weekday and the hour playback started: a square per hour,
 * darker for more.
 */
export function ActivityHeatmap(props: {
  activity: ActivityCell[]
  class?: string
}) {
  const seconds = createMemo(
    () =>
      new Map(
        props.activity.map((cell) => [
          `${cell.weekday}:${cell.hour}`,
          cell.watchSeconds,
        ]),
      ),
  )
  const max = createMemo(() =>
    Math.max(1, ...props.activity.map((cell) => cell.watchSeconds)),
  )
  const summary = createMemo(() => {
    const peak = props.activity.reduce<ActivityCell | null>(
      (best, cell) =>
        cell.watchSeconds > (best?.watchSeconds ?? 0) ? cell : best,
      null,
    )
    return peak
      ? tr("stats.heatmap.peak", {
          weekday: weekdayName(peak.weekday, "long"),
          hour: hourName(peak.hour),
        })
      : tr("stats.heatmap.empty")
  })

  return (
    <figure class={cn("flex flex-col gap-2", props.class)}>
      <div
        role="img"
        aria-label={summary()}
        class="grid max-w-md grid-cols-[1.75rem_minmax(0,1fr)] gap-y-[3px]"
      >
        <For each={WEEKDAYS}>
          {(weekday) => {
            const day = weekdayName(weekday, "short")
            return (
              <>
                <span
                  aria-hidden="true"
                  class="text-muted-foreground text-10px self-center leading-none"
                >
                  {day}
                </span>
                <div
                  aria-hidden="true"
                  class="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]"
                >
                  <For each={HOURS}>
                    {(hour) => {
                      const value = () =>
                        seconds().get(`${weekday}:${hour}`) ?? 0
                      return (
                        <span
                          title={tr("stats.heatmap.cell", {
                            day,
                            hour: hourName(hour),
                            time: formatWatchTime(value()),
                          })}
                          style={{
                            opacity:
                              value() > 0 ? 0.3 + 0.7 * (value() / max()) : 1,
                          }}
                          class={[
                            "aspect-square rounded-[2px]",
                            value() > 0 ? "bg-primary" : "bg-foreground/[0.06]",
                          ]}
                        />
                      )
                    }}
                  </For>
                </div>
              </>
            )
          }}
        </For>
        <span />
        <div
          aria-hidden="true"
          class="text-muted-foreground text-10px mt-1 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]"
        >
          <For each={AXIS_HOURS}>
            {(hour) => (
              <span
                style={{ "grid-column-start": hour + 1 }}
                class="col-span-6 whitespace-nowrap"
              >
                {hourName(hour)}
              </span>
            )}
          </For>
        </div>
      </div>
      <figcaption class="text-muted-foreground text-xs">{summary()}</figcaption>
    </figure>
  )
}
