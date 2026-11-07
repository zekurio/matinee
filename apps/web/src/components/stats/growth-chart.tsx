import type { LibraryGrowthBucket, StatsUnit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { type PointerEvent, useState } from "react"

import { formatBytes, formatCount, plural } from "@/lib/format"
import { bucketAxisLabel, bucketName } from "@/lib/stats"

import { axisTicks, niceCeiling } from "./bucket-bars"

/** What arrived in a bucket: "15 movies and 31 episodes, 233 GB". */
function arrivals(
  bucket: Pick<LibraryGrowthBucket, "movies" | "episodes" | "sizeBytes">,
): string {
  const parts = [
    bucket.movies > 0 ? plural(bucket.movies, "movie") : null,
    bucket.episodes > 0 ? plural(bucket.episodes, "episode") : null,
  ].filter(Boolean)
  if (parts.length === 0) return "Nothing arrived"
  return `${parts.join(" and ")}, ${formatBytes(bucket.sizeBytes)}`
}

/**
 * The libraries at a bucket's end, then what arrived in it:
 * "1,204 files, 3.1 TB · 3 episodes, 4 GB added".
 */
function describe(bucket: LibraryGrowthBucket): string {
  const held = `${plural(bucket.totalFiles, "file")}, ${formatBytes(bucket.totalSizeBytes)}`
  if (bucket.movies + bucket.episodes === 0) return held
  return `${held} · ${arrivals(bucket)} added`
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
export function GrowthChart({
  buckets,
  unit,
  className,
}: {
  buckets: LibraryGrowthBucket[]
  unit: StatsUnit
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const count = buckets.length
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
    x: xAt(index, count),
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
  const line = `M${segments.join(" L")}`
  const area = `M${drawn[0]?.x ?? 0} 100 L${segments.join(" L")} L${drawn.at(-1)?.x ?? 100} 100 Z`

  const shown = active === null ? null : buckets[active]
  const marker = active === null ? null : points[active]

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (count === 0 || rect.width === 0) return
    const index = Math.round(
      ((event.clientX - rect.left) / rect.width) * (count - 1),
    )
    setActive(Math.min(count - 1, Math.max(0, index)))
  }

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="text-muted-foreground min-h-5 truncate text-xs leading-5 tabular-nums">
        <span className="text-foreground font-medium">
          {shown ? bucketName(shown.start, unit) : "In total"}
        </span>
        {` · ${shown ? describe(shown) : arrivals(added)}`}
      </figcaption>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2">
        <span
          aria-hidden
          className="text-muted-foreground -translate-y-1/2 self-start text-[11px] leading-none tabular-nums"
        >
          {formatCount(top)}
        </span>
        <div
          onPointerMove={pointAt}
          onPointerDown={pointAt}
          onPointerLeave={() => setActive(null)}
          className="border-foreground/15 relative h-36 touch-pan-y border-b"
        >
          <span
            aria-hidden
            className="border-foreground/10 absolute inset-x-0 top-0 border-t border-dashed"
          />
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <path d={area} className="fill-primary/10" />
            <path
              d={line}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-primary"
            />
          </svg>
          {marker && (
            <>
              <span
                aria-hidden
                className="bg-foreground/20 absolute inset-y-0 w-px -translate-x-1/2"
                style={{ left: `${marker.x}%` }}
              />
              <span
                aria-hidden
                className="bg-primary ring-background absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2"
                style={{ left: `${marker.x}%`, bottom: `${marker.y}%` }}
              />
            </>
          )}
          <ol aria-label="Files in the libraries" className="sr-only">
            {buckets.map((bucket) => (
              <li key={bucket.start}>
                {`${bucketName(bucket.start, unit)}: ${describe(bucket)}`}
              </li>
            ))}
          </ol>
        </div>
        <div
          aria-hidden
          className="text-muted-foreground relative col-start-2 h-4 text-[11px] leading-4 tabular-nums"
        >
          {[...axisTicks(count)].map(([index, tick]) => {
            const bucket = buckets[index]
            if (!bucket) return null
            const align = tickAlign(index, count)
            return (
              <span
                key={bucket.start}
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  align === "start" && "left-0",
                  align === "end" && "right-0",
                  align === "center" && "-translate-x-1/2",
                  !tick.narrow && "hidden sm:block",
                )}
                style={
                  align === "center"
                    ? { left: `${xAt(index, count)}%` }
                    : undefined
                }
              >
                {bucketAxisLabel(bucket.start, unit)}
              </span>
            )
          })}
        </div>
      </div>
    </figure>
  )
}
