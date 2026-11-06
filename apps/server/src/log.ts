/* oxlint-disable no-console -- the logger is the one place that writes to the console */

type Level = "debug" | "info" | "warn" | "error"

function write(level: Level, message: string, cause?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`
  const out =
    level === "error" || level === "warn" ? console.error : console.log
  if (cause === undefined) out(line)
  else out(line, cause)
}

/** Each call takes a message and, optionally, the error behind it. */
export const log = {
  debug: (message: string, cause?: unknown) => write("debug", message, cause),
  info: (message: string, cause?: unknown) => write("info", message, cause),
  warn: (message: string, cause?: unknown) => write("warn", message, cause),
  error: (message: string, cause?: unknown) => write("error", message, cause),
}
