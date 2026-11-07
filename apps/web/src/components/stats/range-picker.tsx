import { STATS_RANGES, type StatsRange } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"

import { chipClass, chipRow } from "@/components/chips"
import { RANGE_NAMES } from "@/lib/stats"

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
    <div role="group" aria-label="Period" className={cn(chipRow, className)}>
      {STATS_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={range === value}
          onClick={() => onChange(range)}
          className={chipClass(range === value)}
        >
          {RANGE_NAMES.get(range)}
        </button>
      ))}
    </div>
  )
}
