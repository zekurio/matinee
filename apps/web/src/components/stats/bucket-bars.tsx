import type { StatsUnit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { ReactNode } from "react"

import { bucketAxisLabel } from "@/lib/stats"

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/**
 * The smallest round number at or above `value`, for the top of a scale:
 * 1, 1.5, 2, 2.5, 3, 4, 5, 6, or 8 times a power of ten. A whole number
 * gets a whole number back.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = NICE_STEPS.find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}

type Tick = {
  align: "start" | "center" | "end"
  /** Shown on phones too, not only from `sm` up. */
  narrow: boolean
}

/** Up to this many buckets, each one gets a label. */
const LABEL_EACH_UP_TO = 7

/**
 * The buckets that get a date label: each one when there are few, else
 * five spread out, three of them on phones.
 */
export function axisTicks(count: number): Map<number, Tick> {
  if (count <= LABEL_EACH_UP_TO) {
    return new Map(
      Array.from({ length: count }, (_, index) => [
        index,
        { align: "center", narrow: true },
      ]),
    )
  }
  const last = count - 1
  return new Map<number, Tick>([
    [0, { align: "start", narrow: true }],
    [Math.round(last / 4), { align: "center", narrow: false }],
    [Math.round(last / 2), { align: "center", narrow: true }],
    [Math.round((last * 3) / 4), { align: "center", narrow: false }],
    [last, { align: "end", narrow: true }],
  ])
}

/** Each bar takes this much of its bucket's width; the rest is the gap. */
const BAR_WIDTH = "w-2/3"

/**
 * The plot of a bucket chart: one bar per bucket on a baseline, a dashed
 * line at the top of the scale with its value beside it, and dates under
 * the bars. The caller draws each bar, in `bars`, as a share of `top`.
 */
export function BucketBars<Bucket extends { start: string }>({
  label,
  buckets,
  unit,
  top,
  active,
  onActive,
  describe,
  bars,
  axis = true,
  className,
}: {
  label: string
  buckets: Bucket[]
  unit: StatsUnit
  /** The value at the top of the scale, written out: "30m". */
  top: string
  active: number | null
  onActive: (index: number | null) => void
  /** What a screen reader hears for a bucket. */
  describe: (bucket: Bucket) => string
  /** Each bucket's bar, in the order of `buckets`; nothing for an empty one. */
  bars: ReactNode[]
  /**
   * The scale's value and dashed line, and the dates under the bars. Off,
   * only the bars on their baseline, filling the plot's box, as the apps
   * draw a chart.
   */
  axis?: boolean
  className?: string
}) {
  const ticks = axisTicks(buckets.length)

  const plot = (
    <ol
      aria-label={label}
      onPointerLeave={() => onActive(null)}
      className={cn(
        "border-foreground/15 relative flex border-b",
        axis ? "h-36" : "h-full",
      )}
    >
      {buckets.map((bucket, index) => (
        <li
          key={bucket.start}
          onPointerEnter={() => onActive(index)}
          onPointerDown={() => onActive(index)}
          className="flex h-full min-w-0 flex-1 justify-center"
        >
          <span className="sr-only">{describe(bucket)}</span>
          <span
            aria-hidden
            className={cn(
              "flex h-full flex-col justify-end transition-opacity duration-150 motion-reduce:transition-none",
              BAR_WIDTH,
              active !== null && active !== index && "opacity-40",
            )}
          >
            {bars[index]}
          </span>
        </li>
      ))}
    </ol>
  )
  if (!axis) return <div className={className}>{plot}</div>

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2",
        className,
      )}
    >
      <span
        aria-hidden
        className="text-muted-foreground -translate-y-1/2 self-start text-[11px] leading-none tabular-nums"
      >
        {top}
      </span>
      <div className="relative">
        <span
          aria-hidden
          className="border-foreground/10 absolute inset-x-0 top-0 border-t border-dashed"
        />
        {plot}
      </div>
      <div
        aria-hidden
        className="text-muted-foreground col-start-2 flex h-4 text-[11px] leading-4 tabular-nums"
      >
        {buckets.map((bucket, index) => {
          const tick = ticks.get(index)
          return (
            <span
              key={bucket.start}
              className="flex min-w-0 flex-1 justify-center"
            >
              <span className={cn("relative", BAR_WIDTH)}>
                {tick && (
                  <span
                    className={cn(
                      "absolute top-0 whitespace-nowrap",
                      tick.align === "start" && "left-0",
                      tick.align === "center" && "left-1/2 -translate-x-1/2",
                      tick.align === "end" && "right-0",
                      !tick.narrow && "hidden sm:block",
                    )}
                  >
                    {bucketAxisLabel(bucket.start, unit)}
                  </span>
                )}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
