import type { LibraryGrowthBucket, StatsUnit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { createMemo, createSignal, For, Show } from "solid-js"

import { perLocale, tr } from "@/i18n"
import { formatBytes, formatCount } from "@/lib/format"
import { bucketAxisLabel, bucketName } from "@/lib/stats"

import { axisTicks, niceCeiling } from "./bucket-bars"

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** What arrived in a bucket: "15 movies and 31 episodes, 233 GB". */
function arrivals(
  bucket: Pick<LibraryGrowthBucket, "movies" | "episodes" | "sizeBytes">,
): string {
  const parts = [
    bucket.movies > 0 ? tr("stats.movies", { count: bucket.movies }) : null,
    bucket.episodes > 0
      ? tr("stats.episodes", { count: bucket.episodes })
      : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return tr("stats.growth.nothing")
  return tr("stats.growth.arrived", {
    items: lists().format(parts),
    size: formatBytes(bucket.sizeBytes),
  })
}

/**
 * The libraries at a bucket's end, then what arrived in it:
 * "1,204 files, 3.1 TB · 3 episodes, 4 GB added".
 */
function describe(bucket: LibraryGrowthBucket): string {
  const held = tr("stats.growth.held", {
    count: bucket.totalFiles,
    size: formatBytes(bucket.totalSizeBytes),
  })
  if (bucket.movies + bucket.episodes === 0) return held
  return tr("stats.growth.heldAdded", { held, arrived: arrivals(bucket) })
}

/** How far across the plot bucket `index` of `count` sits, in percent. */
function xAt(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100
}

/** The first date label hangs right of its point and the last one left. */
function tickAlign(index: number, count: number) {
  if (count > 1 && index === 0) return "start"
  if (count > 1 && index === count - 1) return "end"
  return "center"
}

/**
 * Files in the libraries at the end of each day, week, or month, as a
 * line. Pointing at the plot reads out the nearest bucket in place of
 * what arrived in the whole range.
 */
export function GrowthChart(props: {
  buckets: LibraryGrowthBucket[]
  unit: StatsUnit
  class?: string
}) {
  const [active, setActive] = createSignal<number | null>(null)
  const count = () => props.buckets.length

  // Worked out once per answer; pointing moves only the marker and the caption.
  const chart = createMemo(() => {
    const buckets = props.buckets
    const top = niceCeiling(
      Math.max(0, ...buckets.map((bucket) => bucket.totalFiles)),
    )
    const added = buckets.reduce(
      (sum, bucket) => ({
        movies: sum.movies + bucket.movies,
        episodes: sum.episodes + bucket.episodes,
        sizeBytes: sum.sizeBytes + bucket.sizeBytes,
      }),
      { movies: 0, episodes: 0, sizeBytes: 0 },
    )
    // `y` counts up from the baseline, in percent of the plot's height.
    const points = buckets.map((bucket, index) => ({
      x: xAt(index, buckets.length),
      y: (bucket.totalFiles / top) * 100,
    }))
    const first = points[0]
    // A single bucket still gets a line, flat across the plot.
    const drawn =
      points.length === 1 && first
        ? [
            { x: 0, y: first.y },
            { x: 100, y: first.y },
          ]
        : points
    const segments = drawn.map((point) => `${point.x} ${100 - point.y}`)
    return {
      top,
      summary: arrivals(added),
      points,
      line: `M${segments.join(" L")}`,
      area: `M${drawn[0]?.x ?? 0} 100 L${segments.join(" L")} L${drawn.at(-1)?.x ?? 100} 100 Z`,
      ticks: [...axisTicks(buckets.length)],
    }
  })

  const shown = () => {
    const index = active()
    return index === null ? undefined : props.buckets[index]
  }
  const caption = () => {
    const bucket = shown()
    return bucket
      ? { name: bucketName(bucket.start, props.unit), text: describe(bucket) }
      : { name: tr("stats.growth.total"), text: chart().summary }
  }
  const marker = () => {
    const index = active()
    return index === null ? undefined : chart().points[index]
  }

  function pointAt(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (count() === 0 || rect.width === 0) return
    const index = Math.round(
      ((event.clientX - rect.left) / rect.width) * (count() - 1),
    )
    setActive(Math.min(count() - 1, Math.max(0, index)))
  }

  return (
    <figure class={cn("flex min-w-0 flex-col gap-2", props.class)}>
      <figcaption class="text-muted-foreground min-h-5 truncate text-xs leading-5 tabular-nums">
        <span class="text-foreground font-medium">{caption().name}</span>
        {` · ${caption().text}`}
      </figcaption>
      <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2">
        <span
          aria-hidden="true"
          class="text-muted-foreground text-11px -translate-y-1/2 self-start leading-none tabular-nums"
        >
          {formatCount(chart().top)}
        </span>
        <div
          onPointerMove={pointAt}
          onPointerDown={pointAt}
          onPointerLeave={() => setActive(null)}
          class="border-foreground/15 relative h-36 touch-pan-y border-b"
        >
          <span
            aria-hidden="true"
            class="border-foreground/10 absolute inset-x-0 top-0 border-t border-dashed"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            class="absolute inset-0 size-full overflow-visible"
          >
            <path d={chart().area} class="fill-primary/10" />
            <path
              d={chart().line}
              fill="none"
              stroke-width={2}
              stroke-linejoin="round"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
              class="stroke-primary"
            />
          </svg>
          <Show when={marker()}>
            {(point) => (
              <>
                <span
                  aria-hidden="true"
                  class="bg-foreground/20 absolute inset-y-0 w-px -translate-x-1/2"
                  style={{ left: `${point().x}%` }}
                />
                <span
                  aria-hidden="true"
                  class="bg-primary ring-background absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2"
                  style={{ left: `${point().x}%`, bottom: `${point().y}%` }}
                />
              </>
            )}
          </Show>
          <ol aria-label={tr("stats.growth.label")} class="sr-only">
            <For each={props.buckets} keyed={(bucket) => bucket.start}>
              {(bucket) => (
                <li>
                  {tr("stats.chart.point", {
                    date: bucketName(bucket().start, props.unit),
                    value: describe(bucket()),
                  })}
                </li>
              )}
            </For>
          </ol>
        </div>
        <div
          aria-hidden="true"
          class="text-muted-foreground text-11px relative col-start-2 h-4 leading-4 tabular-nums"
        >
          <For each={chart().ticks}>
            {([index, tick]) => (
              <Show when={props.buckets[index]}>
                {(bucket) => {
                  const align = () => tickAlign(index, count())
                  return (
                    <span
                      class={[
                        "absolute top-0 whitespace-nowrap",
                        {
                          "left-0": align() === "start",
                          "right-0": align() === "end",
                          "-translate-x-1/2": align() === "center",
                          "hidden sm:block": !tick.narrow,
                        },
                      ]}
                      style={
                        align() === "center"
                          ? { left: `${xAt(index, count())}%` }
                          : undefined
                      }
                    >
                      {bucketAxisLabel(bucket().start, props.unit)}
                    </span>
                  )
                }}
              </Show>
            )}
          </For>
        </div>
      </div>
    </figure>
  )
}
