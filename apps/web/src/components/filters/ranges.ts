import { tr } from "@/i18n"
import { formatRuntime, formatScore } from "@/lib/format"

/*
 * Ranges as the filter panel and its chips word them, and as the URL
 * holds them. Shared by Discover's browse and the libraries.
 */

/** A span a range's handles move in, by `step`. */
export type Range = { min: number; max: number; step: number }
/** A range's two ends; null leaves that side open. */
export type Bounds = [number | null, number | null]

export type RangeKeys = {
  between:
    | "filters.between"
    | "filters.chip.scoreBetween"
    | "filters.chip.runtimeBetween"
  low:
    | "filters.atLeast"
    | "filters.from"
    | "filters.chip.scoreAtLeast"
    | "filters.chip.runtimeAtLeast"
  high: "filters.upTo" | "filters.chip.scoreUpTo" | "filters.chip.runtimeUpTo"
}

const PANEL: RangeKeys = {
  between: "filters.between",
  low: "filters.atLeast",
  high: "filters.upTo",
}

/** What the chips say for a score and a runtime. */
export const SCORE_CHIP: RangeKeys = {
  between: "filters.chip.scoreBetween",
  low: "filters.chip.scoreAtLeast",
  high: "filters.chip.scoreUpTo",
}
export const RUNTIME_CHIP: RangeKeys = {
  between: "filters.chip.runtimeBetween",
  low: "filters.chip.runtimeAtLeast",
  high: "filters.chip.runtimeUpTo",
}

/** A range's two ends as words: "1980 to 1989", "At least 7.5", "Any year". */
function rangeWords(
  [low, high]: Bounds,
  format: (value: number) => string,
  any: string,
  keys: RangeKeys = PANEL,
): string {
  if (low !== null && high !== null && low === high) return format(low)
  if (low !== null && high !== null)
    return tr(keys.between, { low: format(low), high: format(high) })
  if (low !== null) return tr(keys.low, { value: format(low) })
  if (high !== null) return tr(keys.high, { value: format(high) })
  return any
}

export function yearWords(bounds: Bounds): string {
  return rangeWords(bounds, String, tr("filters.anyYear"), {
    ...PANEL,
    low: "filters.from",
  })
}

export function scoreWords(bounds: Bounds, keys?: RangeKeys): string {
  return rangeWords(bounds, formatScore, tr("filters.anyScore"), keys)
}

export function runtimeWords(bounds: Bounds, keys?: RangeKeys): string {
  return rangeWords(
    bounds,
    (minutes) => formatRuntime(minutes) ?? "0",
    tr("filters.anyLength"),
    keys,
  )
}

/**
 * Two bounds from the URL on `range`'s steps, low first, each null at its
 * end of the range, where it leaves that side open. One outside the range
 * is ignored.
 */
export function span(
  low: number | undefined,
  high: number | undefined,
  range: Range,
): Bounds {
  const fit = (value: number | undefined) => {
    if (value === undefined || !(value >= range.min && value <= range.max))
      return null
    return Math.min(
      range.max,
      range.min + Math.round((value - range.min) / range.step) * range.step,
    )
  }
  let a = fit(low)
  let b = fit(high)
  if (a !== null && b !== null && a > b) [a, b] = [b, a]
  return [a === range.min ? null : a, b === range.max ? null : b]
}

/**
 * Text that reads as a number goes into the URL as one, so it comes out
 * as `?rating=12` rather than quoted.
 */
export function plain(value: string): string | number {
  return String(Number(value)) === value ? Number(value) : value
}
