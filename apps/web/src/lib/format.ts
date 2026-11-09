import { perLocale, tr } from "@/i18n"

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

/** "512 B", "1.5 GB", "12 GB". */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < sizeUnits.length - 1) {
    value /= 1000
    unit++
  }
  const rounded = value >= 10 ? Math.round(value) : value
  return sizes()[unit]?.format(rounded) ?? String(rounded)
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

export function formatRelative(date: Date): string {
  const seconds = (date.getTime() - Date.now()) / 1000
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return relative().format(Math.round(seconds / size), unit)
    }
  }
  return tr("format.justNow")
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

/** "45 seconds", "3 minutes", "12 hours", "2 days". */
export function formatSpan(seconds: number): string {
  if (seconds < 60) {
    return tr("format.seconds", { count: Math.max(1, Math.round(seconds)) })
  }
  if (seconds < 3600) {
    return tr("format.minutesLong", { count: Math.round(seconds / 60) })
  }
  if (seconds < 86_400) {
    return tr("format.hoursLong", { count: Math.round(seconds / 3600) })
  }
  return tr("format.daysLong", { count: Math.round(seconds / 86_400) })
}

const months = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }),
)

/** "Nov 2025". */
export function formatMonth(date: Date): string {
  return months().format(date)
}
