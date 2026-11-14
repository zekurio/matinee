import type { CatalogFilters, TitleKind } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Slider } from "@matinee/ui/components/slider"
import { cn } from "@matinee/ui/lib/utils"
import { XIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react"

import {
  type ActiveFilter,
  FilterButton,
  FilterButtonFace,
} from "@/components/library/list-controls"
import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"
import {
  formatCount,
  formatRegion,
  formatRuntime,
  formatScore,
} from "@/lib/format"

import { type BrowseOptions, filterCount, NO_FILTERS } from "./browse-params"

/*
 * A browse's filters: genres, release year, user score, votes, age
 * rating, original language and runtime, all from what the server
 * offers. A popover under the Filter button from `sm` up, a drawer from
 * the bottom on phones. Each change applies at once; a range applies
 * when its handle is let go.
 */

type Range = BrowseOptions["years"]
type Bounds = [number | null, number | null]

type RangeKeys = {
  between:
    | "discover.browse.between"
    | "discover.browse.chip.scoreBetween"
    | "discover.browse.chip.runtimeBetween"
  low:
    | "discover.browse.atLeast"
    | "discover.browse.from"
    | "discover.browse.chip.scoreAtLeast"
    | "discover.browse.chip.runtimeAtLeast"
  high:
    | "discover.browse.upTo"
    | "discover.browse.chip.scoreUpTo"
    | "discover.browse.chip.runtimeUpTo"
}

const PANEL: RangeKeys = {
  between: "discover.browse.between",
  low: "discover.browse.atLeast",
  high: "discover.browse.upTo",
}

/** A range's two ends as words: "1980 to 1989", "At least 7.5", "Any year". */
function rangeWords(
  [low, high]: Bounds,
  format: (value: number) => string,
  any: string,
  keys: RangeKeys = PANEL,
): string {
  if (low !== null && high !== null && low === high) return format(low)
  if (low !== null && high !== null)
    return tr(keys.between, { low: format(low), high: format(high) })
  if (low !== null) return tr(keys.low, { value: format(low) })
  if (high !== null) return tr(keys.high, { value: format(high) })
  return any
}

function yearWords(bounds: Bounds): string {
  return rangeWords(bounds, String, tr("discover.browse.anyYear"), {
    ...PANEL,
    low: "discover.browse.from",
  })
}

function scoreWords(bounds: Bounds, keys?: RangeKeys): string {
  return rangeWords(bounds, formatScore, tr("discover.browse.anyScore"), keys)
}

function runtimeWords(bounds: Bounds, keys?: RangeKeys): string {
  return rangeWords(
    bounds,
    (minutes) => formatRuntime(minutes) ?? "0",
    tr("discover.browse.anyLength"),
    keys,
  )
}

/**
 * The filters in use as chips, each taking its own off. A range is one
 * chip; so is each genre.
 */
export function activeFilters(
  filters: CatalogFilters,
  options: BrowseOptions,
  change: (patch: Partial<CatalogFilters>) => void,
): ActiveFilter[] {
  const active: ActiveFilter[] = []
  for (const id of filters.genres) {
    const genre = options.genres.find((entry) => entry.id === id)
    if (!genre) continue
    active.push({
      key: `genre:${id}`,
      label: genre.name,
      remove: () =>
        change({ genres: filters.genres.filter((other) => other !== id) }),
    })
  }
  if (filters.yearFrom !== null || filters.yearTo !== null) {
    active.push({
      key: "years",
      label: yearWords([filters.yearFrom, filters.yearTo]),
      remove: () => change({ yearFrom: null, yearTo: null }),
    })
  }
  if (filters.scoreMin !== null || filters.scoreMax !== null) {
    active.push({
      key: "score",
      label: scoreWords([filters.scoreMin, filters.scoreMax], {
        between: "discover.browse.chip.scoreBetween",
        low: "discover.browse.chip.scoreAtLeast",
        high: "discover.browse.chip.scoreUpTo",
      }),
      remove: () => change({ scoreMin: null, scoreMax: null }),
    })
  }
  if (filters.votesMin !== null) {
    active.push({
      key: "votes",
      label: tr("discover.browse.chip.votes", { count: filters.votesMin }),
      remove: () => change({ votesMin: null }),
    })
  }
  if (filters.rating !== null) {
    active.push({
      key: "rating",
      label: tr("discover.browse.chip.rating", { rating: filters.rating }),
      remove: () => change({ rating: null }),
    })
  }
  if (filters.language !== null) {
    const language = options.languages.find(
      (entry) => entry.id === filters.language,
    )
    active.push({
      key: "language",
      label: language?.name ?? filters.language,
      remove: () => change({ language: null }),
    })
  }
  if (filters.runtimeMin !== null || filters.runtimeMax !== null) {
    active.push({
      key: "runtime",
      label: runtimeWords([filters.runtimeMin, filters.runtimeMax], {
        between: "discover.browse.chip.runtimeBetween",
        low: "discover.browse.chip.runtimeAtLeast",
        high: "discover.browse.chip.runtimeUpTo",
      }),
      remove: () => change({ runtimeMin: null, runtimeMax: null }),
    })
  }
  return active
}

/**
 * The Filter button and what it opens: a popover from `sm` up, a drawer
 * on phones (`compact`, the icon the phone bar has room for).
 */
export function BrowseFilterPanel({
  kind,
  options,
  filters,
  change,
  open,
  onOpenChange,
  compact = false,
}: {
  kind: TitleKind
  options: BrowseOptions
  filters: CatalogFilters
  change: (patch: Partial<CatalogFilters>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}) {
  const phone = usePhone()
  const active = filterCount(filters)
  const fields = (
    <FilterFields
      kind={kind}
      options={options}
      filters={filters}
      change={change}
    />
  )
  const clear = active > 0 && (
    <Button variant="ghost" onClick={() => change(NO_FILTERS)}>
      <XIcon />
      {tr("library.clearFilters")}
    </Button>
  )
  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger
          render={<FilterButton compact={compact} active={active} />}
        >
          <FilterButtonFace compact={compact} active={active} />
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHandle />
          <DrawerTitle className="px-5 pt-3 pb-1 text-lg leading-7 font-semibold tracking-tight">
            {tr("discover.browse.filters")}
          </DrawerTitle>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
            {fields}
          </div>
          <div className="border-foreground/10 flex items-center justify-between gap-2 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {clear || <span />}
            <DrawerClose render={<Button className="h-11 px-5" />}>
              {tr("discover.browse.done")}
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<FilterButton compact={compact} active={active} />}
      >
        <FilterButtonFace compact={compact} active={active} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="max-h-[min(44rem,var(--available-height))] w-[26rem] gap-0 overflow-y-auto overscroll-contain p-0"
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 pt-2">
          <PopoverTitle className="text-sm font-semibold">
            {tr("discover.browse.filters")}
          </PopoverTitle>
          {clear}
        </div>
        <div className="px-4 pb-4">{fields}</div>
      </PopoverContent>
    </Popover>
  )
}

function FilterFields({
  kind,
  options,
  filters,
  change,
}: {
  kind: TitleKind
  options: BrowseOptions
  filters: CatalogFilters
  change: (patch: Partial<CatalogFilters>) => void
}) {
  const ratings = options.ratings
  return (
    <div className="flex flex-col gap-6">
      {options.genres.length > 0 && (
        <Section label={tr("discover.browse.genres")}>
          {(labelId) => (
            <div
              role="group"
              aria-labelledby={labelId}
              className="flex flex-wrap gap-1.5"
            >
              {options.genres.map((genre) => {
                const on = filters.genres.includes(genre.id)
                return (
                  <button
                    key={genre.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      change({
                        genres: on
                          ? filters.genres.filter((id) => id !== genre.id)
                          : [...filters.genres, genre.id],
                      })
                    }
                    className={smallChip(on)}
                  >
                    {genre.name}
                  </button>
                )
              })}
            </div>
          )}
        </Section>
      )}
      <RangeField
        label={tr("discover.browse.years")}
        range={options.years}
        value={[filters.yearFrom, filters.yearTo]}
        words={yearWords}
        format={String}
        onCommit={([yearFrom, yearTo]) => change({ yearFrom, yearTo })}
      />
      <RangeField
        label={tr("discover.browse.score")}
        hint={tr("discover.browse.scoreHint")}
        range={options.scores}
        value={[filters.scoreMin, filters.scoreMax]}
        words={(bounds) => scoreWords(bounds)}
        format={formatScore}
        onCommit={([scoreMin, scoreMax]) => change({ scoreMin, scoreMax })}
      />
      {options.votes.length > 0 && (
        <Section label={tr("discover.browse.votes")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={options.votes.map((count) => ({
                value: count,
                label: tr("discover.browse.votesStep", {
                  count: formatCount(count),
                }),
              }))}
              value={filters.votesMin}
              onChange={(votesMin) => change({ votesMin })}
            />
          )}
        </Section>
      )}
      {ratings && (
        <Section
          label={tr("discover.browse.rating")}
          hint={tr("discover.browse.ratingHint", {
            country: formatRegion(ratings.country),
          })}
        >
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={ratings.ratings.map((rating) => ({
                value: rating,
                label: rating,
              }))}
              value={filters.rating}
              onChange={(rating) => change({ rating })}
            />
          )}
        </Section>
      )}
      {options.languages.length > 0 && (
        <Section label={tr("discover.browse.language")}>
          {(labelId) => (
            <LanguageSelect
              labelId={labelId}
              options={options}
              value={filters.language}
              onChange={(language) => change({ language })}
            />
          )}
        </Section>
      )}
      <RangeField
        label={tr("discover.browse.runtime")}
        hint={tr(`discover.browse.runtimeHint.${kind}`)}
        range={options.runtime}
        value={[filters.runtimeMin, filters.runtimeMax]}
        words={(bounds) => runtimeWords(bounds)}
        format={(minutes) =>
          minutes >= options.runtime.max
            ? tr("discover.browse.highest")
            : (formatRuntime(minutes) ?? "0")
        }
        onCommit={([runtimeMin, runtimeMax]) =>
          change({ runtimeMin, runtimeMax })
        }
      />
    </div>
  )
}

/** A chip in the panel, smaller than a page's chips. */
function smallChip(on: boolean) {
  return cn(
    "focus-visible:ring-ring inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium outline-none select-none focus-visible:ring-2 [@media(pointer:coarse)]:h-10",
    on
      ? "bg-foreground text-background border-transparent"
      : "text-foreground/80 hover:text-foreground border-foreground/15 hover:border-foreground/30",
  )
}

/** A filter's heading, a line about it, and its control. */
function Section({
  label,
  hint,
  value,
  children,
}: {
  label: string
  hint?: string
  /** What it's set to, at the heading's end. */
  value?: string
  children: (labelId: string) => ReactNode
}) {
  const id = useId()
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold">
            {label}
          </h3>
          {hint && (
            <p className="text-muted-foreground text-[13px] leading-5">
              {hint}
            </p>
          )}
        </div>
        {value && (
          <span className="text-muted-foreground shrink-0 text-[13px] tabular-nums">
            {value}
          </span>
        )}
      </div>
      {children(id)}
    </section>
  )
}

/**
 * One of a few values, or none: "Any" first, then each, as a radio
 * group the arrow keys move through.
 */
function ChoiceChips<T extends string | number>({
  labelId,
  choices,
  value,
  onChange,
}: {
  labelId: string
  choices: { value: T; label: string }[]
  value: T | null
  onChange: (value: T | null) => void
}) {
  const all: { value: T | null; label: string }[] = [
    { value: null, label: tr("discover.browse.any") },
    ...choices,
  ]
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selected = Math.max(
    0,
    all.findIndex((choice) => choice.value === value),
  )
  const move = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + all.length) % all.length
    const choice = all[next]
    if (choice) onChange(choice.value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex flex-wrap gap-1.5"
    >
      {all.map((choice, index) => (
        <button
          key={String(choice.value)}
          ref={(element) => {
            refs.current[index] = element
          }}
          type="button"
          role="radio"
          aria-checked={index === selected}
          tabIndex={index === selected ? 0 : -1}
          onClick={() => onChange(choice.value)}
          onKeyDown={(event) => move(event, index)}
          className={smallChip(index === selected)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Two handles on a range, each open at its end. What it says follows the
 * handles as they move; the browse changes once they're let go, or with
 * each key press.
 */
function RangeField({
  label,
  hint,
  range,
  value,
  words,
  format,
  onCommit,
}: {
  label: string
  hint?: string
  range: Range
  value: Bounds
  words: (bounds: Bounds) => string
  /** One handle's value, for screen readers. */
  format: (value: number) => string
  onCommit: (bounds: Bounds) => void
}) {
  const closed = (bounds: Bounds): [number, number] => [
    bounds[0] ?? range.min,
    bounds[1] ?? range.max,
  ]
  const [moving, setMoving] = useState(() => closed(value))
  // A chip or "Clear" changes the range from outside. Not a `key`: the
  // handle being moved by keyboard would lose focus on every step.
  const [seen, setSeen] = useState(value)
  if (seen[0] !== value[0] || seen[1] !== value[1]) {
    setSeen(value)
    setMoving(closed(value))
  }
  const open = ([low, high]: [number, number]): Bounds => [
    low <= range.min ? null : low,
    high >= range.max ? null : high,
  ]
  const pair = (next: number | readonly number[]): [number, number] | null =>
    Array.isArray(next) && next.length === 2
      ? [next[0] ?? range.min, next[1] ?? range.max]
      : null
  return (
    <Section label={label} hint={hint} value={words(open(moving))}>
      {(labelId) => (
        <div className="px-1.5 py-2">
          <Slider
            aria-labelledby={labelId}
            min={range.min}
            max={range.max}
            step={range.step}
            value={moving}
            onValueChange={(next) => {
              const both = pair(next)
              if (both) setMoving(both)
            }}
            onValueCommitted={(next) => {
              const both = pair(next)
              if (both) onCommit(open(both))
            }}
            thumbLabel={(index) =>
              index === 0
                ? tr("discover.browse.lowest")
                : tr("discover.browse.highest")
            }
            thumbValueText={(handle, index) =>
              (index === 0 && handle <= range.min) ||
              (index === 1 && handle >= range.max)
                ? tr("discover.browse.any")
                : format(handle)
            }
          />
        </div>
      )}
    </Section>
  )
}

function LanguageSelect({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string
  options: BrowseOptions
  value: string | null
  onChange: (value: string | null) => void
}) {
  const items = [
    { value: "", label: tr("discover.browse.anyLanguage") },
    ...options.languages.map((entry) => ({
      value: entry.id,
      label: entry.name,
    })),
  ]
  return (
    <Select
      items={items}
      value={value ?? ""}
      onValueChange={(next) => onChange(next || null)}
    >
      <SelectTrigger aria-labelledby={labelId} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[min(22rem,var(--available-height))]">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
