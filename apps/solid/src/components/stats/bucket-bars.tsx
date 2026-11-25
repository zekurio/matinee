import type { StatsUnit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { createMemo, For, Show } from "solid-js"

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
 * the bars. The caller draws each bar, in `renderBar`, as a share of `top`.
 */
export function BucketBars<Bucket extends { start: string }>(props: {
  label: string
  buckets: Bucket[]
  unit: StatsUnit
  /** The value at the top of the scale, written out: "30m". */
  top: string
  active: number | null
  onActive: (index: number | null) => void
  /** What a screen reader hears for a bucket. */
  describe: (bucket: Bucket) => string
  /** A bucket's bar; nothing for an empty one. */
  renderBar: (bucket: Bucket) => JSX.Element
  /**
   * The scale's value and dashed line, and the dates under the bars. Off,
   * only the bars on their baseline, filling the plot's box, as the apps
   * draw a chart.
   */
  axis?: boolean
  class?: string
}) {
  const axis = () => props.axis ?? true
  const ticks = createMemo(() => axisTicks(props.buckets.length))

  // Pointing at a bar changes only the dimming, so each bar reads
  // `active` in its class and nothing else is drawn again.
  const plot = () => (
    <ol
      aria-label={props.label}
      onPointerLeave={() => props.onActive(null)}
      class={[
        "border-foreground/15 relative flex border-b",
        axis() ? "h-36" : "h-full",
      ]}
    >
      <For each={props.buckets} keyed={(bucket) => bucket.start}>
        {(bucket, index) => (
          <li
            onPointerEnter={() => props.onActive(index())}
            onPointerDown={() => props.onActive(index())}
            class="flex h-full min-w-0 flex-1 justify-center"
          >
            <span class="sr-only">{props.describe(bucket())}</span>
            <span
              aria-hidden="true"
              class={[
                "flex h-full flex-col justify-end transition-opacity duration-150 motion-reduce:transition-none",
                BAR_WIDTH,
                {
                  "opacity-40":
                    props.active !== null && props.active !== index(),
                },
              ]}
            >
              {props.renderBar(bucket())}
            </span>
          </li>
        )}
      </For>
    </ol>
  )

  return (
    <Show when={axis()} fallback={<div class={props.class}>{plot()}</div>}>
      <div
        class={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2",
          props.class,
        )}
      >
        <span
          aria-hidden="true"
          class="text-muted-foreground text-11px -translate-y-1/2 self-start leading-none tabular-nums"
        >
          {props.top}
        </span>
        <div class="relative">
          <span
            aria-hidden="true"
            class="border-foreground/10 absolute inset-x-0 top-0 border-t border-dashed"
          />
          {plot()}
        </div>
        <div
          aria-hidden="true"
          class="text-muted-foreground text-11px col-start-2 flex h-4 leading-4 tabular-nums"
        >
          <For each={props.buckets} keyed={(bucket) => bucket.start}>
            {(bucket, index) => (
              <span class="flex min-w-0 flex-1 justify-center">
                <span class={["relative", BAR_WIDTH]}>
                  <Show when={ticks().get(index())}>
                    {(tick) => (
                      <span
                        class={[
                          "absolute top-0 whitespace-nowrap",
                          {
                            "left-0": tick().align === "start",
                            "left-1/2 -translate-x-1/2":
                              tick().align === "center",
                            "right-0": tick().align === "end",
                            "hidden sm:block": !tick().narrow,
                          },
                        ]}
                      >
                        {bucketAxisLabel(bucket().start, props.unit)}
                      </span>
                    )}
                  </Show>
                </span>
              </span>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
