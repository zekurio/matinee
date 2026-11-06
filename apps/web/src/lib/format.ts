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

export function formatDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
