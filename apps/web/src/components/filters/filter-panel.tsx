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
  PopoverHeader,
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
import { SearchIcon, XIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react"

import {
  FilterButton,
  FilterButtonFace,
} from "@/components/library/list-controls"
import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"

import type { Bounds, Range } from "./ranges"

/*
 * The filter panel Discover's browse and the libraries share: the Filter
 * button with how many are on, and what it opens, a popover from `sm` up
 * and a drawer from the bottom on phones. Each page fills it with its own
 * fields, built from the parts below. Each change applies at once; a
 * range applies when its handle is let go.
 */

export function FilterPanel({
  active,
  onClear,
  open,
  onOpenChange,
  compact = false,
  children,
}: {
  /** How many filters are on. */
  active: number
  onClear: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The icon the phone bar has room for. */
  compact?: boolean
  children: ReactNode
}) {
  const phone = usePhone()
  const fields = <div className="flex flex-col gap-6">{children}</div>
  const clear = active > 0 && (
    <Button variant="ghost" onClick={onClear}>
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
            {tr("filters.title")}
          </DrawerTitle>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
            {fields}
          </div>
          <div className="border-foreground/10 flex items-center justify-between gap-2 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {clear || <span />}
            <DrawerClose render={<Button className="h-11 px-5" />}>
              {tr("filters.done")}
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
        className="max-h-[min(44rem,var(--available-height))] w-[26rem] gap-0 p-0"
      >
        {/* A title bar as the app's other popovers have, which stays put
            while the fields scroll. */}
        <PopoverHeader className="px-4">
          <PopoverTitle className="font-semibold">
            {tr("filters.title")}
          </PopoverTitle>
          {clear}
        </PopoverHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
          {fields}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A chip in the panel, smaller than a page's chips. */
function smallChip(on: boolean) {
  return cn(
    "focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none select-none focus-visible:ring-2 [@media(pointer:coarse)]:h-10",
    on
      ? "bg-foreground text-background border-transparent"
      : "text-foreground/80 hover:text-foreground border-foreground/15 hover:border-foreground/30",
  )
}

/** How many titles a chip or an item stands for, after its name. */
function Count({ value, on }: { value: number | undefined; on: boolean }) {
  if (value === undefined) return null
  return (
    <span
      className={cn(
        "tabular-nums",
        on ? "text-background/70" : "text-muted-foreground",
      )}
    >
      {formatCount(value)}
    </span>
  )
}

/** A filter's heading, a line about it, and its control. */
export function Section({
  label,
  hint,
  value,
  small = false,
  children,
}: {
  label: string
  hint?: string
  /** What it's set to, at the heading's end. */
  value?: string
  /** A part of a filter, under the filter's own heading. */
  small?: boolean
  children: (labelId: string) => ReactNode
}) {
  const id = useId()
  return (
    <section className={cn("flex flex-col", small ? "gap-2" : "gap-2.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={id}
            className={
              // Smaller than the title, as the app's popover forms label
              // their fields.
              small
                ? "text-muted-foreground text-xs font-medium"
                : "text-[13px] font-medium"
            }
          >
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

/** A choice in a chip group or a select, with how many titles it has, where known. */
export type Choice<T> = { value: T; label: string; count?: number }

/**
 * Any number of choices, each a chip that turns on and off. Past
 * `limit` choices, a field finds the rest by name, and only the first
 * `limit` that match show, with those that are on.
 */
export function ToggleChips({
  labelId,
  choices,
  value,
  onChange,
  limit,
  find,
}: {
  labelId: string
  choices: Choice<string>[]
  value: readonly string[]
  onChange: (value: string[]) => void
  limit?: number
  /** The find field's placeholder and what it says when nothing matches. */
  find?: { placeholder: string; empty: string }
}) {
  const [query, setQuery] = useState("")
  const finding = limit !== undefined && choices.length > limit
  const needle = query.trim().toLocaleLowerCase()
  const matching = choices.filter((choice) =>
    choice.label.toLocaleLowerCase().includes(needle),
  )
  const shown = finding
    ? [
        ...choices.filter(
          (choice) =>
            value.includes(choice.value) &&
            !matching.slice(0, limit).includes(choice),
        ),
        ...matching.slice(0, limit),
      ]
    : choices
  return (
    <div className="flex flex-col gap-2.5">
      {finding && find && (
        <label className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-8 items-center gap-2 rounded-md border bg-transparent px-2.5 focus-within:ring-3 [@media(pointer:coarse)]:h-10">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Escape empties the field before it closes the panel.
              if (event.key === "Escape" && query) {
                event.stopPropagation()
                setQuery("")
              }
            }}
            placeholder={find.placeholder}
            aria-label={find.placeholder}
            className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
        </label>
      )}
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-wrap gap-1.5"
      >
        {shown.map((choice) => {
          const on = value.includes(choice.value)
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on
                    ? value.filter((other) => other !== choice.value)
                    : [...value, choice.value],
                )
              }
              className={smallChip(on)}
            >
              {choice.label}
              <Count value={choice.count} on={on} />
            </button>
          )
        })}
        {shown.length === 0 && find && (
          <p className="text-muted-foreground text-[13px] leading-8">
            {find.empty}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * One of a few values, or none: "Any" first, then each, as a radio
 * group the arrow keys move through.
 */
export function ChoiceChips<T extends string | number>({
  labelId,
  choices,
  value,
  onChange,
}: {
  labelId: string
  choices: Choice<T>[]
  value: T | null
  onChange: (value: T | null) => void
}) {
  const all: Choice<T | null>[] = [
    { value: null, label: tr("filters.any") },
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
          <Count value={choice.count} on={index === selected} />
        </button>
      ))}
    </div>
  )
}

/**
 * Two handles on a range, each open at its end. What it says follows the
 * handles as they move; the list changes once they're let go, or with
 * each key press.
 */
export function RangeField({
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
              index === 0 ? tr("filters.lowest") : tr("filters.highest")
            }
            thumbValueText={(handle, index) =>
              (index === 0 && handle <= range.min) ||
              (index === 1 && handle >= range.max)
                ? tr("filters.any")
                : format(handle)
            }
          />
        </div>
      )}
    </Section>
  )
}

/** One of many values, or none, as a select: "Any …" first, then each. */
export function OptionSelect({
  labelId,
  any,
  choices,
  value,
  onChange,
}: {
  labelId: string
  /** What the select says with none picked, like "Any language". */
  any: string
  choices: Choice<string>[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const items: Choice<string>[] = [{ value: "", label: any }, ...choices]
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
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className="text-muted-foreground pl-3 text-xs tabular-nums">
                {formatCount(item.count)}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
