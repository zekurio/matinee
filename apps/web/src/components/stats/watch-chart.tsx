import type { StatsBucket, StatsUnit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useState } from "react"

import { formatWatchTime } from "@/lib/format"
import { bucketName } from "@/lib/stats"

import { BucketBars, niceCeiling } from "./bucket-bars"

const UNIT_WORDS = new Map<StatsUnit, string>([
  ["day", "day"],
  ["week", "week"],
  ["month", "month"],
])

/** The chart's heading: "Watch time per day". */
export function watchChartTitle(unit: StatsUnit): string {
  return `Watch time per ${UNIT_WORDS.get(unit) ?? unit}`
}

/** The top of the scale: whole minutes up to an hour, then hours. */
function scaleTop(seconds: number): number {
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 60) return niceCeiling(Math.max(minutes, 1)) * 60
  return niceCeiling(minutes / 60) * 3600
}

/**
 * Watch time per day, week, or month as bars. Pointing at a bar reads it
 * out above the chart; otherwise the readout names the busiest one.
 */
export function WatchChart({
  buckets,
  unit,
  className,
}: {
  buckets: StatsBucket[]
  unit: StatsUnit
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const top = scaleTop(
    Math.max(0, ...buckets.map((bucket) => bucket.watchSeconds)),
  )
  const busiest = buckets.reduce<StatsBucket | null>(
    (best, bucket) =>
      bucket.watchSeconds > (best?.watchSeconds ?? 0) ? bucket : best,
    null,
  )
  const shown = active === null ? null : buckets[active]

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="text-muted-foreground min-h-5 truncate text-xs leading-5 tabular-nums">
        {shown ? (
          <>
            <span className="text-foreground font-medium">
              {bucketName(shown.start, unit)}
            </span>
            {` · ${formatWatchTime(shown.watchSeconds)}`}
          </>
        ) : busiest ? (
          <>
            {"Busiest · "}
            <span className="text-foreground font-medium">
              {bucketName(busiest.start, unit)}
            </span>
            {` · ${formatWatchTime(busiest.watchSeconds)}`}
          </>
        ) : null}
      </figcaption>
      <BucketBars
        label={watchChartTitle(unit)}
        buckets={buckets}
        unit={unit}
        top={formatWatchTime(top)}
        active={active}
        onActive={setActive}
        describe={(bucket) =>
          `${bucketName(bucket.start, unit)}: ${formatWatchTime(bucket.watchSeconds)}`
        }
        bars={buckets.map(
          (bucket) =>
            bucket.watchSeconds > 0 && (
              <span
                key={bucket.start}
                className="bg-primary min-h-0.5 w-full rounded-t-[2px]"
                style={{ height: `${(bucket.watchSeconds / top) * 100}%` }}
              />
            ),
        )}
      />
    </figure>
  )
}
