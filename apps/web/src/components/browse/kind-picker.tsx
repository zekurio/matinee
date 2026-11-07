import type { BrowsedTitles, TitleKind } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"

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
export function KindPicker({
  counts,
  value,
  onChange,
  className,
}: {
  counts: KindCounts
  value: TitleKind | undefined
  onChange: (kind: TitleKind | undefined) => void
  className?: string
}) {
  if (counts.movie === 0 || counts.show === 0) return null
  return (
    <div
      role="group"
      aria-label={tr("browse.kind")}
      className={cn(chipRow, className)}
    >
      {options.map((option) => {
        const active = option === value
        const count =
          option === undefined ? counts.movie + counts.show : counts[option]
        return (
          <button
            key={option ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={chipClass(active, "gap-1.5")}
          >
            {tr(`browse.kind.${option ?? "all"}`)}
            <span
              className={cn(
                "tabular-nums",
                active ? "text-background/70" : "text-muted-foreground",
              )}
            >
              {formatCount(count)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** How many of `titles` are movies and how many shows. */
export function kindCounts(titles: { kind: TitleKind }[]): KindCounts {
  const counts: KindCounts = { movie: 0, show: 0 }
  for (const title of titles) counts[title.kind] += 1
  return counts
}
