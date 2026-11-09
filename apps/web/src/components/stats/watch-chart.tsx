import type { StatsBucket, StatsUnit } from "@matinee/contracts"

import { tr } from "@/i18n"
import { formatWatchTime } from "@/lib/format"
import { bucketName } from "@/lib/stats"

import { BucketBars, niceCeiling } from "./bucket-bars"

/** The chart's heading: "Watch time per day". */
export function watchChartTitle(unit: StatsUnit): string {
  return tr(`stats.chart.title.${unit}`)
}

/** The top of the scale: whole minutes up to an hour, then hours. */
function scaleTop(seconds: number): number {
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 60) return niceCeiling(Math.max(minutes, 1)) * 60
  return niceCeiling(minutes / 60) * 3600
}

/**
 * Watch time per day, week, or month as bars on a baseline, filling its
 * box, as the apps draw it. The bar pointed at goes to `onActive`, for
 * the card around it to read out.
 */
export function WatchChart({
  buckets,
  unit,
  active,
  onActive,
  className,
}: {
  buckets: StatsBucket[]
  unit: StatsUnit
  active: number | null
  onActive: (index: number | null) => void
  className?: string
}) {
  const top = scaleTop(
    Math.max(0, ...buckets.map((bucket) => bucket.watchSeconds)),
  )
  return (
    <BucketBars
      label={watchChartTitle(unit)}
      buckets={buckets}
      unit={unit}
      top={formatWatchTime(top)}
      active={active}
      onActive={onActive}
      axis={false}
      className={className}
      describe={(bucket) =>
        tr("stats.chart.point", {
          date: bucketName(bucket.start, unit),
          value: formatWatchTime(bucket.watchSeconds),
        })
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
  )
}
