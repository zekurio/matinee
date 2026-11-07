import type { ActivityCell } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Fragment } from "react"

import { formatWatchTime } from "@/lib/format"
import { hourName, WEEKDAYS } from "@/lib/stats"

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const AXIS_HOURS = [0, 6, 12, 18]

/**
 * Watch time by weekday and the hour playback started: a square per hour,
 * darker for more.
 */
export function ActivityHeatmap({
  activity,
  className,
}: {
  activity: ActivityCell[]
  className?: string
}) {
  const seconds = new Map(
    activity.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.watchSeconds]),
  )
  const max = Math.max(1, ...activity.map((cell) => cell.watchSeconds))
  const peak = activity.reduce<ActivityCell | null>(
    (best, cell) =>
      cell.watchSeconds > (best?.watchSeconds ?? 0) ? cell : best,
    null,
  )
  const summary = peak
    ? `Most often on ${WEEKDAYS[peak.weekday - 1]}s around ${hourName(peak.hour)}.`
    : "No watching yet."

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        role="img"
        aria-label={summary}
        className="grid max-w-md grid-cols-[1.75rem_minmax(0,1fr)] gap-y-[3px]"
      >
        {WEEKDAYS.map((day, index) => (
          <Fragment key={day}>
            <span
              aria-hidden
              className="text-muted-foreground self-center text-[10px] leading-none"
            >
              {day.slice(0, 3)}
            </span>
            <div
              aria-hidden
              className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]"
            >
              {HOURS.map((hour) => {
                const value = seconds.get(`${index + 1}:${hour}`) ?? 0
                return (
                  <span
                    key={hour}
                    title={`${day.slice(0, 3)}, ${hourName(hour)}: ${formatWatchTime(value)}`}
                    style={{
                      opacity: value > 0 ? 0.3 + 0.7 * (value / max) : 1,
                    }}
                    className={cn(
                      "aspect-square rounded-[2px]",
                      value > 0 ? "bg-primary" : "bg-foreground/[0.06]",
                    )}
                  />
                )
              })}
            </div>
          </Fragment>
        ))}
        <span />
        <div
          aria-hidden
          className="text-muted-foreground mt-1 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] text-[10px]"
        >
          {AXIS_HOURS.map((hour) => (
            <span
              key={hour}
              style={{ gridColumnStart: hour + 1 }}
              className="col-span-6 whitespace-nowrap"
            >
              {hourName(hour)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {summary}
      </figcaption>
    </figure>
  )
}
