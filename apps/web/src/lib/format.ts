const sizeUnits = ["B", "KB", "MB", "GB", "TB"]

export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < sizeUnits.length - 1) {
    value /= 1000
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${sizeUnits[unit]}`
}

// The interface is English, so dates are too. Mixing locales reads as a bug.
const LOCALE = "en"

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" })
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
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return "just now"
}

/** "Nov 5", or "Nov 5, 2025" outside the current year. */
export function formatShortDate(date: Date): string {
  const thisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: thisYear ? undefined : "numeric",
  })
}

/** "1h 52m", or "24m" under an hour. */
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * Time spent watching: "45m", "12h 30m", or "142h" from 100 hours up,
 * where minutes stop mattering.
 */
export function formatWatchTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h >= 100 || m === 0) return `${h.toLocaleString(LOCALE)}h`
  return `${h}h ${m}m`
}

const counts = new Intl.NumberFormat(LOCALE)

export function formatCount(n: number): string {
  return counts.format(n)
}

/** "1 play", "12 plays". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${formatCount(n)} ${n === 1 ? word : many}`
}

/** "45 seconds", "3 minutes", "12 hours", "2 days". */
export function formatSpan(seconds: number): string {
  if (seconds < 60) return plural(Math.max(1, Math.round(seconds)), "second")
  if (seconds < 3600) return plural(Math.round(seconds / 60), "minute")
  if (seconds < 86_400) return plural(Math.round(seconds / 3600), "hour")
  return plural(Math.round(seconds / 86_400), "day")
}

/** "Nov 2025". */
export function formatMonth(date: Date): string {
  return date.toLocaleDateString(LOCALE, { month: "short", year: "numeric" })
}
