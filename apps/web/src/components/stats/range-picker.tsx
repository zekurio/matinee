import { STATS_RANGES, type StatsRange } from "@matinee/contracts"
import { For } from "solid-js"

import { chipClass } from "@/components/chips"
import { tr } from "@/i18n"
import { rangeName } from "@/lib/stats"

// Phones scroll the row sideways, out to the screen edge; wider screens wrap it.
const chipRow =
  "-mx-4 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"

/** Chips for how far back statistics look. */
export function RangePicker(props: {
  value: StatsRange
  onChange: (range: StatsRange) => void
  class?: string
}) {
  return (
    <div
      role="group"
      aria-label={tr("stats.range.label")}
      class={[chipRow, props.class]}
    >
      <For each={STATS_RANGES}>
        {(range) => (
          <button
            type="button"
            aria-pressed={range === props.value ? "true" : "false"}
            onClick={() => props.onChange(range)}
            class={chipClass(range === props.value)}
          >
            {rangeName(range)}
          </button>
        )}
      </For>
    </div>
  )
}
