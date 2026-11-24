import type { Library } from "@matinee/contracts"
import { ArrowUpDown, ChevronDown } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { chipClass } from "@/components/chips"
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

// The sort trigger's look doesn't depend on its label, so it is worked out
// once at module load rather than on each mount.
const sortTriggerClass = buttonVariants({
  variant: "ghost",
  size: "icon",
  class:
    "[@media(pointer:coarse)]:max-sm:size-11 sm:h-8 sm:w-auto sm:gap-2 sm:px-2 sm:text-13px",
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
        <Icon icon={ArrowUpDown} class="size-5 sm:size-4" />
        <span class="max-sm:hidden">{label()}</span>
        <Icon icon={ChevronDown} class="size-3.5 max-sm:hidden" />
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

export function LibraryMenu(props: {
  libraries: Library[]
  value?: string
  onChange: (value?: string) => void
}) {
  const all = tr("browse.library.all")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tr("browse.library")}
        class={chipClass(!!props.value)}
      >
        <span class="max-w-36 truncate">
          {props.libraries.find((library) => library.id === props.value)
            ?.name ?? all}
        </span>
        <Icon icon={ChevronDown} class="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-max min-w-48">
        <DropdownMenuRadioGroup
          value={props.value ?? ""}
          onValueChange={(value) => props.onChange(value || undefined)}
        >
          <DropdownMenuRadioItem value="" closeOnSelect>
            {all}
          </DropdownMenuRadioItem>
          <For each={props.libraries} keyed={(library) => library.id}>
            {(library) => (
              <DropdownMenuRadioItem value={library().id} closeOnSelect>
                {library().name}
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterButtonFace(props: { active: number; compact?: boolean }) {
  return (
    <>
      <Show when={!props.compact}>{tr("library.filter")}</Show>
      <Show when={props.active > 0}>
        <span
          aria-hidden="true"
          class={
            props.compact
              ? "bg-primary text-primary-foreground text-10px absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 leading-4 font-semibold tabular-nums"
              : "text-background/70 tabular-nums"
          }
        >
          {props.active}
        </span>
      </Show>
    </>
  )
}
