import type { StatsBucket, StatsUnit } from "@matinee/contracts"
import { createMemo, Show } from "solid-js"

import { tr } from "@/i18n"
import { formatWatchTime } from "@/lib/format"
import { bucketName } from "@/lib/stats"

import { BucketBars, niceCeiling } from "./bucket-bars"

/** The chart's heading: "Watch time per day". */
function watchChartTitle(unit: StatsUnit): string {
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
export function WatchChart(props: {
  buckets: StatsBucket[]
  unit: StatsUnit
  active: number | null
  onActive: (index: number | null) => void
  class?: string
}) {
  const top = createMemo(() =>
    scaleTop(
      Math.max(0, ...props.buckets.map((bucket) => bucket.watchSeconds)),
    ),
  )
  return (
    <BucketBars
      label={watchChartTitle(props.unit)}
      buckets={props.buckets}
      unit={props.unit}
      top={formatWatchTime(top())}
      active={props.active}
      onActive={props.onActive}
      axis={false}
      class={props.class}
      describe={(bucket) =>
        tr("stats.chart.point", {
          date: bucketName(bucket.start, props.unit),
          value: formatWatchTime(bucket.watchSeconds),
        })
      }
      renderBar={(bucket) => (
        <Show when={bucket.watchSeconds > 0}>
          <span
            class="bg-primary min-h-0.5 w-full rounded-t-[2px]"
            style={{ height: `${(bucket.watchSeconds / top()) * 100}%` }}
          />
        </Show>
      )}
    />
  )
}
