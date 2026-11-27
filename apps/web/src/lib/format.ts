import { type MessageKey, perLocale, tr } from "@/i18n"

/*
 * Dates, numbers, and durations in the interface's language, so they read
 * like the text around them. Mixing locales reads as a bug.
 */

const sizeUnits = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"]

const sizes = perLocale((locale) =>
  sizeUnits.map(
    (unit, index) =>
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit,
        unitDisplay: "short",
        // Bytes are whole; the rest keep a decimal below ten.
        maximumFractionDigits: index === 0 ? 0 : 1,
      }),
  ),
)

/** "512 byte", "1.5 GB", "12 GB". */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < sizeUnits.length - 1) {
    value /= 1000
    unit++
  }
  let rounded = roundSize(value, unit)
  // Rounding can reach the next unit's 1000: 999.6 kB is "1 MB", not "1,000 kB".
  if (rounded >= 1000 && unit < sizeUnits.length - 1) {
    unit++
    rounded = roundSize(rounded / 1000, unit)
  }
  return sizes()[unit]?.format(rounded) ?? String(rounded)
}

/** Rounds as the unit's formatter shows it: whole, or one decimal under ten. */
function roundSize(value: number, unit: number): number {
  if (unit === 0) return Math.round(value)
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
}

const relative = perLocale(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
)
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

/**
 * "5 minutes ago" or "in 2 hours", for something that happened. Under a
 * minute either way is "just now", since the server's clock and this one
 * can disagree by a few seconds.
 */
export function formatRelative(date: Date): string {
  return relativeSpan(secondsUntil(date)) ?? tr("format.justNow")
}

/**
 * "in 5 minutes", for something due, like a task's next run. Under a
 * minute either way is "soon": a run a few seconds overdue is about to
 * start, not one that just happened.
 */
export function formatUpcoming(date: Date): string {
  return relativeSpan(secondsUntil(date)) ?? tr("format.soon")
}

function secondsUntil(date: Date): number {
  return (date.getTime() - Date.now()) / 1000
}

/** The span in its largest whole unit, or null under a minute. */
function relativeSpan(seconds: number): string | null {
  for (const [index, [unit, size]] of steps.entries()) {
    if (Math.abs(seconds) >= size) {
      const count = Math.round(seconds / size)
      // Rounding can reach a whole larger unit: 59.6 minutes is an hour.
      const larger = steps[index - 1]
      if (larger && Math.abs(count) * size >= larger[1]) {
        return relativeSpan(Math.sign(seconds) * larger[1])
      }
      return relative().format(count, unit)
    }
  }
  return null
}

const dates = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
)

/** "1h 52m", or "24m" under an hour. */
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return tr("format.minutes", { minutes: rest })
  if (rest === 0) return tr("format.hours", { hours })
  return tr("format.hoursMinutes", { hours, minutes: rest })
}

export function formatDate(date: Date): string {
  return dates().format(date)
}

/** "Jan 3 – Mar 1, 2020", with what the two days share said once. */
export function formatDateRange(start: Date, end: Date): string {
  return dates().formatRange(start, end)
}

const dateTimes = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
)

/** "Jun 4, 2026, 3:15 PM", for a moment that matters to the hour. */
export function formatDateTime(date: Date): string {
  return dateTimes().format(date)
}

/**
 * Time spent watching: "45m", "12h 30m", or "142h" from 100 hours up,
 * where minutes stop mattering.
 */
export function formatWatchTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return tr("format.minutes", { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours >= 100 || rest === 0) return tr("format.hours", { hours })
  return tr("format.hoursMinutes", { hours, minutes: rest })
}

const counts = perLocale((locale) => new Intl.NumberFormat(locale))

export function formatCount(n: number): string {
  return counts().format(n)
}

export type SpanUnit = "seconds" | "minutes" | "hours" | "days"

/** A span as a whole count of one unit: 2 minutes. */
export type Span = { unit: SpanUnit; count: number }

/**
 * A span as a count of its largest unit, rounded: 90 seconds is 2 minutes,
 * 59.6 seconds is 1 minute, and anything under a second is 1 second.
 */
export function spanParts(seconds: number): Span {
  // Each count is checked after rounding, since 59.6 seconds rounds to a
  // count of 60, which is a minute.
  if (seconds < 60) {
    const count = Math.max(1, Math.round(seconds))
    if (count < 60) return { unit: "seconds", count }
    return spanParts(60)
  }
  if (seconds < 3600) {
    const count = Math.round(seconds / 60)
    if (count < 60) return { unit: "minutes", count }
    return spanParts(3600)
  }
  if (seconds < 86_400) {
    const count = Math.round(seconds / 3600)
    if (count < 24) return { unit: "hours", count }
    return spanParts(86_400)
  }
  return { unit: "days", count: Math.round(seconds / 86_400) }
}

const spanKeys = {
  seconds: "format.seconds",
  minutes: "format.minutesLong",
  hours: "format.hoursLong",
  days: "format.daysLong",
} as const satisfies Record<SpanUnit, MessageKey>

/** "45 seconds", "3 minutes", "12 hours", "2 days". */
export function formatSpan(seconds: number): string {
  const { unit, count } = spanParts(seconds)
  return tr(spanKeys[unit], { count })
}

const months = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }),
)

/** "Nov 2025". */
export function formatMonth(date: Date): string {
  return months().format(date)
}

const days = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
)

/**
 * "14 Aug" or "Aug 14", as the language has it, with the year only when
 * it isn't this one: "Aug 14, 2027".
 */
export function formatDay(date: Date): string {
  return date.getFullYear() === new Date().getFullYear()
    ? days().format(date)
    : formatDate(date)
}

/**
 * A calendar day the server sent as `2026-08-14`, at local midnight, so
 * it doesn't move a day in time zones west of UTC.
 */
export function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const percents = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
)

/** "64 %" or "64%", for a share from 0 to 1. */
export function formatPercent(share: number): string {
  return percents().format(share)
}

const scores = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

/** A user score on 0 to 10 with one decimal: "8.3" or "8,3". */
export function formatScore(score: number): string {
  return scores().format(score)
}

const regions = perLocale(
  (locale) => new Intl.DisplayNames(locale, { type: "region" }),
)

/** A country's name for its ISO 3166-1 code, or the code if unknown. */
export function formatRegion(code: string): string {
  try {
    return regions().of(code) ?? code
  } catch {
    return code
  }
}
