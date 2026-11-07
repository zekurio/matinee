import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/format"

export default {
  "format.justNow": "gerade eben",
  "format.minutes": "{minutes} Min.",
  "format.hours": "{hours} Std.",
  "format.hoursMinutes": "{hours} Std. {minutes} Min.",
  "format.seconds": plural({
    one: "{count} Sekunde",
    other: "{count} Sekunden",
  }),
  "format.minutesLong": plural({
    one: "{count} Minute",
    other: "{count} Minuten",
  }),
  "format.hoursLong": plural({
    one: "{count} Stunde",
    other: "{count} Stunden",
  }),
  "format.daysLong": plural({ one: "{count} Tag", other: "{count} Tage" }),
} satisfies TranslationOf<typeof source>
