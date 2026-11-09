import type { Facet, TitleFacets } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { cn } from "@matinee/ui/lib/utils"
import {
  ArrowUpDownIcon,
  ListFilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { chipClass, chipRow } from "@/components/chips"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"

import type { Sort, SortOption } from "./list-params"

/** Which genre and studio a list is narrowed to, and how to change them. */
export type FilterState = {
  genre: string | undefined
  studio: string | undefined
  setGenre: (value: string | undefined) => void
  setStudio: (value: string | undefined) => void
  clear: () => void
}

/** Genre and studio filters, with the choices, for lists that have them. */
export type FilterControls = FilterState & { facets: TitleFacets }

/** Search and sort, given to both layouts. */
export type ListControlsProps = {
  search: string
  setSearch: (value: string) => void
  /** The search field's label and placeholder. */
  label: string
  sorts: SortOption[]
  sort: Sort
  setSort: (value: Sort) => void
  filters?: FilterControls
}

/** Filter, sort, and search beside the title, from `sm` up. */
export function HeaderControls(props: ListControlsProps) {
  return (
    <>
      {props.filters && <FilterMenu {...props.filters} />}
      <SortSelect
        options={props.sorts}
        value={props.sort}
        onChange={props.setSort}
      />
      <SearchBox
        value={props.search}
        onChange={props.setSearch}
        label={props.label}
      />
    </>
  )
}

/**
 * Phones: a search, filters, and the sort at the end of the title's row.
 * The open search takes over the row; the search spotlight looks in every
 * library.
 */
export function PhoneControls(props: ListControlsProps) {
  return (
    <>
      <PhoneFilter
        value={props.search}
        onChange={props.setSearch}
        label={props.label}
      />
      {props.filters && <FilterMenu {...props.filters} compact />}
      <SortMenu
        options={props.sorts}
        value={props.sort}
        onChange={props.setSort}
      />
    </>
  )
}

/**
 * The filters in use, as chips under the header that take them off again.
 * Nothing when none is on.
 */
export function ActiveFilters({
  genre,
  studio,
  setGenre,
  setStudio,
  clear,
}: FilterState) {
  const active: { key: string; label: string; remove: () => void }[] = []
  if (genre) {
    active.push({
      key: "genre",
      label: genre,
      remove: () => setGenre(undefined),
    })
  }
  if (studio) {
    active.push({
      key: "studio",
      label: studio,
      remove: () => setStudio(undefined),
    })
  }
  if (active.length === 0) return null
  return (
    <div
      role="group"
      aria-label={tr("library.filters")}
      className={cn(chipRow, "mb-4")}
    >
      {active.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={filter.remove}
          aria-label={tr("library.removeFilter", { name: filter.label })}
          className={chipClass(true, "gap-1.5 pr-2.5")}
        >
          {filter.label}
          <XIcon aria-hidden className="size-3.5" />
        </button>
      ))}
      {active.length > 1 && (
        <button type="button" onClick={clear} className={chipClass(false)}>
          {tr("library.clearAll")}
        </button>
      )}
    </div>
  )
}

/**
 * Genre and studio, each a submenu of what the list holds with how many
 * titles have it. `compact` is the icon-only button phones get.
 */
function FilterMenu({
  facets,
  genre,
  studio,
  setGenre,
  setStudio,
  clear,
  compact = false,
}: FilterControls & { compact?: boolean }) {
  const active = (genre ? 1 : 0) + (studio ? 1 : 0)
  if (facets.genres.length === 0 && facets.studios.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                active > 0
                  ? tr("library.filtersOn", { count: active })
                  : tr("library.filters")
              }
              className="data-popup-open:bg-foreground/10 relative [@media(pointer:coarse)]:size-11"
            />
          ) : (
            <Button
              variant="outline"
              className="data-popup-open:border-ring h-10 font-normal md:h-9"
            />
          )
        }
      >
        <ListFilterIcon className={compact ? "size-5" : undefined} />
        {!compact && tr("library.filter")}
        {active > 0 &&
          (compact ? (
            <span
              aria-hidden
              className="bg-primary absolute top-2 right-2 size-2 rounded-full"
            />
          ) : (
            <span className="bg-foreground text-background rounded-full px-1.5 text-xs leading-5 tabular-nums">
              {active}
            </span>
          ))}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <FacetMenu
          label={tr("library.genre")}
          any={tr("library.anyGenre")}
          facets={facets.genres}
          value={genre}
          onChange={setGenre}
        />
        <FacetMenu
          label={tr("library.studio")}
          any={tr("library.anyStudio")}
          facets={facets.studios}
          value={studio}
          onChange={setStudio}
        />
        {active > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clear}>
              <XIcon />
              {tr("library.clearFilters")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One filter as a submenu: "any", then each name with its title count. */
function FacetMenu({
  label,
  any,
  facets,
  value,
  onChange,
}: {
  label: string
  any: string
  facets: Facet[]
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  if (facets.length === 0) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="[@media(pointer:coarse)]:min-h-11">
        {label}
        <span className="text-muted-foreground ml-auto max-w-32 truncate pl-4">
          {value ?? tr("library.any")}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[min(24rem,var(--available-height))] min-w-56">
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(next: string) => onChange(next || undefined)}
        >
          <DropdownMenuRadioItem
            value=""
            closeOnClick
            className="[@media(pointer:coarse)]:min-h-11"
          >
            {any}
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {facets.map((facet) => (
            <DropdownMenuRadioItem
              key={facet.name}
              value={facet.name}
              closeOnClick
              className="[@media(pointer:coarse)]:min-h-11"
            >
              <span className="min-w-0 flex-1 truncate">{facet.name}</span>
              <span className="text-muted-foreground pl-3 text-xs tabular-nums">
                {formatCount(facet.titleCount)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/**
 * A button that opens a field over the title's row. `data-filter-open` tells
 * `PageHeader` to give it the row. Closing it clears the filter.
 */
function PhoneFilter({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const [opened, setOpened] = useState(false)
  const container = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // A filter restored from the URL comes back open.
  const open = opened || value !== ""

  const show = () => {
    // Mount and focus the field within the tap, or iOS won't raise the
    // keyboard.
    flushSync(() => setOpened(true))
    input.current?.focus()
  }
  const close = () => {
    onChange("")
    setOpened(false)
  }

  // Dragging the page puts the keyboard away, as in a native list.
  useEffect(() => {
    if (!open) return
    const dismiss = (event: TouchEvent) => {
      const field = input.current
      if (!field || document.activeElement !== field) return
      if (
        event.target instanceof Node &&
        container.current?.contains(event.target)
      ) {
        return
      }
      field.blur()
    }
    document.addEventListener("touchmove", dismiss, { passive: true })
    return () => document.removeEventListener("touchmove", dismiss)
  }, [open])

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={show}
        className="[@media(pointer:coarse)]:size-11"
      >
        <SearchIcon className="size-5" />
      </Button>
    )
  }

  return (
    <search
      ref={container}
      data-filter-open
      className="motion-safe:animate-in motion-safe:fade-in-0 flex min-w-0 flex-1 items-center gap-1"
    >
      <label className="border-foreground/10 bg-foreground/5 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border pr-1 pl-3.5">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              if (value) onChange("")
              else close()
            }
          }}
          // 16px keeps iOS from zooming in on focus.
          className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <button
            type="button"
            aria-label={tr("library.clearFilter")}
            onClick={() => {
              onChange("")
              input.current?.focus()
            }}
            className="focus-visible:ring-ring grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
          >
            <span className="bg-foreground/30 text-background grid size-5 place-items-center rounded-full">
              <XIcon className="size-3 stroke-3" />
            </span>
          </button>
        )}
      </label>
      <Button
        variant="ghost"
        size="icon"
        aria-label={tr("library.closeFilter")}
        onClick={close}
        className="[@media(pointer:coarse)]:size-11"
      >
        <XIcon className="size-5" />
      </Button>
    </search>
  )
}

function SortMenu({
  options,
  value,
  onChange,
}: {
  options: SortOption[]
  value: Sort
  onChange: (value: Sort) => void
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>{tr("library.sortBy")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="relative w-72">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        placeholder={label}
        aria-label={label}
        className="px-8 [&::-webkit-search-cancel-button]:appearance-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("")
        }}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tr("library.clearSearch")}
          className="absolute top-1/2 right-1 -translate-y-1/2 [@media(pointer:coarse)]:size-11"
          onClick={() => onChange("")}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}

function SortSelect({
  options,
  value,
  onChange,
}: {
  options: SortOption[]
  value: Sort
  onChange: (value: Sort) => void
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
