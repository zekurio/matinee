import { STATS_RANGES, type StatsRange } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"

import { chipClass, chipRow } from "@/components/chips"
import { tr } from "@/i18n"
import { rangeName } from "@/lib/stats"

/** Chips for how far back statistics look. */
export function RangePicker({
  value,
  onChange,
  className,
}: {
  value: StatsRange
  onChange: (range: StatsRange) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={tr("stats.range.label")}
      className={cn(chipRow, className)}
    >
      {STATS_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={range === value}
          onClick={() => onChange(range)}
          className={chipClass(range === value)}
        >
          {rangeName(range)}
        </button>
      ))}
    </div>
  )
}
