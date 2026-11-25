import type { BrowsedTitles, TitleKind } from "@matinee/contracts"
import { For, Show } from "solid-js"

import { chipClass, chipRow } from "@/components/chips"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"

/** How many movies and shows there are, as `titles.browse` counts them. */
export type KindCounts = BrowsedTitles["kinds"]

const options: (TitleKind | undefined)[] = [undefined, "movie", "show"]

/**
 * Chips for movies, shows, or both, with how many there are of each.
 * Nothing when there's only one kind to pick.
 */
export function KindPicker(props: {
  counts: KindCounts
  value: TitleKind | undefined
  onChange: (kind: TitleKind | undefined) => void
  class?: string
}) {
  return (
    <Show when={props.counts.movie > 0 && props.counts.show > 0}>
      <div
        role="group"
        aria-label={tr("browse.kind")}
        class={[chipRow, props.class]}
      >
        <For each={options}>
          {(option) => {
            const active = () => option === props.value
            const count = () =>
              option === undefined
                ? props.counts.movie + props.counts.show
                : props.counts[option]
            return (
              <button
                type="button"
                aria-pressed={active() ? "true" : "false"}
                onClick={() => props.onChange(option)}
                class={chipClass(active(), "gap-1.5")}
              >
                {tr(`browse.kind.${option ?? "all"}`)}
                <span
                  class={[
                    "tabular-nums",
                    active() ? "text-background/70" : "text-muted-foreground",
                  ]}
                >
                  {formatCount(count())}
                </span>
              </button>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

/** How many of `titles` are movies and how many shows. */
export function kindCounts(titles: { kind: TitleKind }[]): KindCounts {
  const counts: KindCounts = { movie: 0, show: 0 }
  for (const title of titles) counts[title.kind] += 1
  return counts
}
