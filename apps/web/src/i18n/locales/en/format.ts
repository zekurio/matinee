import { defineMessages, plural } from "../../catalog"

export default defineMessages("format", {
  // Formatting helpers in lib/format.ts.
  "format.justNow": "just now",
  "format.minutes": "{minutes}m",
  "format.hours": "{hours}h",
  "format.hoursMinutes": "{hours}h {minutes}m",
  "format.seconds": plural({ one: "{count} second", other: "{count} seconds" }),
  "format.minutesLong": plural({
    one: "{count} minute",
    other: "{count} minutes",
  }),
  "format.hoursLong": plural({ one: "{count} hour", other: "{count} hours" }),
  "format.daysLong": plural({ one: "{count} day", other: "{count} days" }),
})
