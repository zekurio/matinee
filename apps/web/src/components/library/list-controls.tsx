import { ArrowUpDown } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"

// The sort trigger's look doesn't depend on its label, so it is worked out
// once at module load rather than on each mount.
const sortTriggerClass = buttonVariants({
  variant: "ghost",
  size: "icon",
  class: "data-popup-open:bg-foreground/10 [@media(pointer:coarse)]:size-12",
})

export function SortMenu(props: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const label = createMemo(
    () => props.options.find((option) => option.value === props.value)?.label,
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tr("library.sortCurrent", { sort: label() ?? "" })}
        class={sortTriggerClass}
      >
        <Icon
          icon={ArrowUpDown}
          class="size-5 [@media(pointer:coarse)]:size-6"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-max min-w-48">
        <DropdownMenuRadioGroup
          aria-label={tr("library.sortBy")}
          value={props.value}
          onValueChange={(value) => props.onChange(value)}
        >
          <For each={props.options} keyed={(option) => option.value}>
            {(option) => (
              <DropdownMenuRadioItem
                value={option().value}
                closeOnSelect
                class="[@media(pointer:coarse)]:min-h-11"
              >
                {option().label}
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The sort as a select with its words in place, from `sm` up. */
export function SortSelect<T extends string>(props: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const label = () =>
    props.options.find((option) => option.value === props.value)?.label
  return (
    <Select
      value={props.value}
      onValueChange={(next) => {
        const choice = props.options.find((option) => option.value === next)
        if (choice) props.onChange(choice.value)
      }}
    >
      <SelectTrigger
        aria-label={tr("library.sort")}
        class="min-w-44 shrink-0 justify-between gap-1"
      >
        <span class="text-muted-foreground">{tr("library.sortPrefix")}</span>
        <SelectValue>{label()}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <For each={props.options} keyed={(option) => option.value}>
          {(option) => (
            <SelectItem value={option().value} label={option().label}>
              {option().label}
            </SelectItem>
          )}
        </For>
      </SelectContent>
    </Select>
  )
}

export function FilterButtonFace(props: {
  active: number
  compact?: boolean
  /** The count as a badge, for a trigger that isn't itself a filled chip. */
  badge?: boolean
}) {
  return (
    <>
      <Show when={!props.compact}>{tr("library.filter")}</Show>
      <Show when={props.active > 0}>
        <span
          aria-hidden="true"
          class={
            props.compact
              ? "bg-primary text-primary-foreground text-11px absolute top-1.5 right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 leading-4 font-semibold"
              : props.badge
                ? "bg-foreground text-background rounded-full px-1.5 text-xs leading-5"
                : "text-background/70"
          }
        >
          {props.active}
        </span>
      </Show>
    </>
  )
}
