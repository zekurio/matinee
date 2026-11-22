import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { ArrowUpDownIcon, ListFilterIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"

/** Sort and filters, given to both layouts. */
export type ListControlsProps = {
  sorts: { value: string; label: string }[]
  sort: string
  setSort: (value: string) => void
  /**
   * The Filter button and its panel; `compact` is the icon phones have
   * room for. Only the layout that shows renders it, so one panel opens.
   */
  filter?: (compact: boolean) => ReactNode
}

/** Filter and sort beside the title, from `sm` up. */
export function HeaderControls(props: ListControlsProps) {
  const phone = usePhone()
  return (
    <>
      {!phone && props.filter?.(false)}
      <SortSelect
        options={props.sorts}
        value={props.sort}
        onChange={props.setSort}
      />
    </>
  )
}

/** Phones: filters and the sort at the end of the title's row. */
export function PhoneControls(props: ListControlsProps) {
  const phone = usePhone()
  return (
    <>
      {phone && props.filter?.(true)}
      <SortMenu
        options={props.sorts}
        value={props.sort}
        onChange={props.setSort}
      />
    </>
  )
}

/**
 * The button that opens a list's filters, with how many are on: "Filter"
 * and a count from `sm` up, and on phones (`compact`) an icon with the
 * count at its corner. Give it as a trigger's `render`, with
 * {@link FilterButtonFace} inside.
 */
export function FilterButton({
  compact = false,
  active,
  ...props
}: ComponentProps<typeof Button> & { compact?: boolean; active: number }) {
  return compact ? (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        active > 0
          ? tr("library.filtersOn", { count: active })
          : tr("library.filters")
      }
      className="data-popup-open:bg-foreground/10 relative [@media(pointer:coarse)]:size-11"
      {...props}
    />
  ) : (
    <Button
      variant="outline"
      className="data-popup-open:border-ring h-10 font-normal md:h-9"
      {...props}
    />
  )
}

/** What {@link FilterButton} shows: the icon, the word, and the count. */
export function FilterButtonFace({
  compact = false,
  active,
}: {
  compact?: boolean
  active: number
}) {
  return (
    <>
      <ListFilterIcon className={compact ? "size-5" : undefined} />
      {!compact && tr("library.filter")}
      {active > 0 &&
        (compact ? (
          <span
            aria-hidden
            className="bg-primary text-primary-foreground text-10px absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 leading-4 font-semibold tabular-nums"
          >
            {active}
          </span>
        ) : (
          <span className="bg-foreground text-background rounded-full px-1.5 text-xs leading-5 tabular-nums">
            {active}
          </span>
        ))}
    </>
  )
}

/** The sort as an icon button with a menu, for phones. */
export function SortMenu<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const current = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              current
                ? tr("library.sortCurrent", { sort: current.label })
                : tr("library.sort")
            }
            className="data-popup-open:bg-foreground/10 [@media(pointer:coarse)]:size-11"
          />
        }
      >
        <ArrowUpDownIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuRadioGroup
          aria-label={tr("library.sortBy")}
          value={value}
          onValueChange={(next) => {
            const option = options.find((o) => o.value === next)
            if (option) onChange(option.value)
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              className="[@media(pointer:coarse)]:min-h-11"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The sort as a select with "Sort:" before it, from `sm` up. */
export function SortSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        aria-label={tr("library.sort")}
        className="min-w-44 shrink-0 justify-between gap-1"
      >
        <span className="text-muted-foreground">
          {tr("library.sortPrefix")}
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
