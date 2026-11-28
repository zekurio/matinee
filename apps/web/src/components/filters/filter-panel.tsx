import type { JSX } from "@solidjs/web"
import { ListFilter, Search, X } from "lucide"
import {
  createContext,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onSettled,
  type ParentProps,
  Show,
  useContext,
} from "solid-js"

import { chipClass } from "@/components/chips"
import type { Bounds, Range } from "@/components/filters/ranges"
import { FilterButtonFace } from "@/components/library/list-controls"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@/kit/drawer"
import { Icon } from "@/kit/icon"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Slider } from "@/kit/slider"
import { formatCount } from "@/lib/format"

// These two looks never change, so they are worked out once.
const compactTriggerClass = buttonVariants({
  variant: "ghost",
  size: "icon",
  class: "relative [@media(pointer:coarse)]:size-12",
})
const drawerCloseClass = buttonVariants({ class: "h-11 px-5" })

/**
 * Lets a part of the panel forget what it holds, like a typed search, when
 * the popover closes, since the popover keeps its content between opens.
 */
const OnPanelClosed = createContext<(reset: () => void) => void>(() => {})

export function FilterPanel(
  props: ParentProps<{
    active: number
    onClear: () => void
    compact: boolean
    /** Controls whether it's open, where the page needs to know. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** The phone drawer's closing button, which shows the list. */
    done?: string
    /**
     * The desktop trigger: a chip among a page's quick filters, or the
     * outline button a page's own toolbar gives it.
     */
    trigger?: "chip" | "button"
    /** Which edge of the trigger the popover lines up with. */
    align?: "start" | "end"
  }>,
) {
  const label = () =>
    props.active > 0
      ? tr("library.filtersOn", { count: props.active })
      : tr("library.filters")
  // The popover's content is built once, while the page is idle a while
  // after it painted, so a click on Filter only shows it.
  const [prebuilt, setPrebuilt] = createSignal(false)
  const resets = new Set<() => void>()
  let scroller: HTMLDivElement | undefined
  onSettled(() => {
    let idle = 0
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window)
        idle = requestIdleCallback(() => setPrebuilt(true))
      else setPrebuilt(true)
    }, 2000)
    return () => {
      clearTimeout(timer)
      if (idle) cancelIdleCallback(idle)
    }
  })
  const clear = () => (
    <Show when={props.active > 0}>
      <Button variant="ghost" onClick={() => props.onClear()}>
        <Icon icon={X} />
        {tr("library.clearFilters")}
      </Button>
    </Show>
  )

  return (
    <Show
      when={!props.compact}
      fallback={
        <Drawer open={props.open} onOpenChange={props.onOpenChange}>
          <DrawerTrigger aria-label={label()} class={compactTriggerClass}>
            <Icon
              icon={ListFilter}
              class="size-5 [@media(pointer:coarse)]:size-6"
            />
            <FilterButtonFace compact active={props.active} />
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHandle />
            <DrawerTitle class="px-5 pt-3 pb-1 text-lg leading-7 font-semibold tracking-tight">
              {tr("filters.title")}
            </DrawerTitle>
            <div class="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
              {props.children}
            </div>
            <div class="border-foreground/10 flex shrink-0 items-center justify-between gap-2 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div>{clear()}</div>
              <DrawerClose class={drawerCloseClass}>
                {props.done ?? tr("filters.done")}
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      }
    >
      <Popover
        open={props.open}
        onOpenChange={props.onOpenChange}
        onOpenChangeComplete={(open) => {
          if (open) return
          if (scroller) scroller.scrollTop = 0
          for (const reset of resets) reset()
        }}
      >
        <PopoverTrigger
          aria-label={label()}
          class={
            props.trigger === "button"
              ? buttonVariants({
                  variant: "outline",
                  class: "data-popup-open:border-ring h-10 font-normal md:h-9",
                })
              : chipClass(props.active > 0)
          }
        >
          <Icon icon={ListFilter} class="size-4" />
          <FilterButtonFace
            active={props.active}
            badge={props.trigger === "button"}
          />
        </PopoverTrigger>
        <PopoverContent
          align={props.align ?? "start"}
          sideOffset={6}
          keepMounted={prebuilt()}
          // Kept out of `main`, so the closed copy's chips aren't found
          // among the page's own when something looks for them there.
          container={document.body}
          class="max-h-[min(44rem,var(--available-height))] w-104 max-w-(--available-width) gap-0 p-0"
        >
          <PopoverHeader class="min-h-14 px-4">
            <PopoverTitle class="font-semibold">
              {tr("filters.title")}
            </PopoverTitle>
            {clear()}
          </PopoverHeader>
          <div
            ref={(el) => (scroller = el)}
            class="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pt-3 pb-4"
          >
            <OnPanelClosed
              value={(reset) => {
                resets.add(reset)
                onSettled(() => () => resets.delete(reset))
              }}
            >
              {props.children}
            </OnPanelClosed>
          </div>
        </PopoverContent>
      </Popover>
    </Show>
  )
}

export function Section(props: {
  label: string
  hint?: string
  value?: string
  children: (labelId: string) => JSX.Element
}) {
  const id = createUniqueId()
  return (
    <section class="flex shrink-0 flex-col gap-2.5">
      <div class="flex items-baseline justify-between gap-3">
        <div class="min-w-0">
          <h3 id={id} class="text-13px font-medium">
            {props.label}
          </h3>
          <Show when={props.hint}>
            <p class="text-muted-foreground text-13px leading-5">
              {props.hint}
            </p>
          </Show>
        </div>
        <Show when={props.value}>
          <span class="text-muted-foreground text-13px text-right">
            {props.value}
          </span>
        </Show>
      </div>
      {props.children(id)}
    </section>
  )
}

export type Choice<T> = { value: T; label: string; count?: number }

function Count(props: { value?: number; active?: boolean }) {
  return (
    <Show when={props.value !== undefined}>
      <span
        class={[props.active ? "text-background/70" : "text-muted-foreground"]}
      >
        {formatCount(props.value ?? 0)}
      </span>
    </Show>
  )
}

export function ToggleChips(props: {
  labelId: string
  choices: Choice<string>[]
  value: readonly string[]
  onChange: (value: string[]) => void
  find?: { limit: number; placeholder: string; empty: string }
}) {
  const [query, setQuery] = createSignal("")
  useContext(OnPanelClosed)(() => setQuery(""))
  const finding = () =>
    props.find && props.choices.length > props.find.limit
      ? props.find
      : undefined
  const shown = createMemo(() => {
    const find = finding()
    if (!find) return props.choices
    const needle = query().trim().toLowerCase()
    const matches = props.choices
      .filter((choice) => choice.label.toLowerCase().includes(needle))
      .slice(0, find.limit)
    return [
      ...props.choices.filter(
        (choice) =>
          props.value.includes(choice.value) && !matches.includes(choice),
      ),
      ...matches,
    ]
  })

  return (
    <>
      <Show when={finding()}>
        {(find) => (
          <label class="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-8 items-center gap-2 rounded-md border px-2.5 focus-within:ring-3 [@media(pointer:coarse)]:h-10">
            <Icon
              icon={Search}
              class="text-muted-foreground size-3.5 shrink-0"
            />
            <input
              type="search"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query()) {
                  event.stopPropagation()
                  setQuery("")
                }
              }}
              placeholder={find().placeholder}
              aria-label={find().placeholder}
              class="placeholder:text-muted-foreground text-13px h-full min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        )}
      </Show>
      <div
        role="group"
        aria-labelledby={props.labelId}
        class="flex flex-wrap gap-1.5"
      >
        <For each={shown()} keyed={(choice) => choice.value}>
          {(choice) => {
            const active = () => props.value.includes(choice().value)
            return (
              <button
                type="button"
                aria-pressed={active() ? "true" : "false"}
                class={chipClass(active())}
                onClick={() => {
                  const name = choice().value
                  props.onChange(
                    active()
                      ? props.value.filter((other) => other !== name)
                      : [...props.value, name],
                  )
                }}
              >
                {choice().label}
                <Count value={choice().count} active={active()} />
              </button>
            )
          }}
        </For>
        <Show when={shown().length === 0 && finding()}>
          {(find) => (
            <p class="text-muted-foreground text-13px leading-8">
              {find().empty}
            </p>
          )}
        </Show>
      </div>
    </>
  )
}

export function ChoiceChips<T extends string>(props: {
  labelId: string
  choices: Choice<T>[]
  value: T | null
  onChange: (value: T | null) => void
  /** The word for leaving it unset, where "Any" isn't the right one. */
  anyLabel?: string
}) {
  const name = createUniqueId()
  const all = (): Choice<T | null>[] => [
    { value: null, label: props.anyLabel ?? tr("filters.any") },
    ...props.choices,
  ]
  return (
    <div
      role="radiogroup"
      aria-labelledby={props.labelId}
      class="flex flex-wrap gap-1.5"
    >
      <For each={all()} keyed={(choice) => choice.value}>
        {(choice) => {
          const active = () => choice().value === props.value
          return (
            <label
              class={chipClass(
                active(),
                "focus-within:ring-ring focus-within:ring-2",
              )}
            >
              <input
                type="radio"
                name={name}
                checked={active()}
                class="sr-only"
                onChange={() => props.onChange(choice().value)}
              />
              {choice().label}
              <Count value={choice().count} active={active()} />
            </label>
          )
        }}
      </For>
    </div>
  )
}

export function RangeField(props: {
  label: string
  hint?: string
  range: Range
  value: Bounds
  words: (bounds: Bounds) => string
  format: (value: number) => string
  onCommit: (bounds: Bounds) => void
}) {
  const low = createMemo(() => props.value[0] ?? props.range.min)
  const high = createMemo(() => props.value[1] ?? props.range.max)
  const [moving, setMoving] = createSignal(() => [low(), high()])
  const bounds = (values: readonly number[]): Bounds => {
    const [min = props.range.min, max = props.range.max] = values
    return [
      min <= props.range.min ? null : min,
      max >= props.range.max ? null : max,
    ]
  }
  return (
    <Section
      label={props.label}
      hint={props.hint}
      value={props.words(bounds(moving()))}
    >
      {(labelId) => (
        <div class="px-1.5 py-2">
          <Slider
            aria-labelledby={labelId}
            min={props.range.min}
            max={props.range.max}
            step={props.range.step}
            value={moving()}
            onValueChange={(next) => {
              if (Array.isArray(next)) setMoving(next)
            }}
            onValueCommit={(next) => {
              if (Array.isArray(next)) props.onCommit(bounds(next))
            }}
            thumbLabel={(index) =>
              index === 0 ? tr("filters.lowest") : tr("filters.highest")
            }
            format={props.format}
          />
        </div>
      )}
    </Section>
  )
}

export function OptionSelect(props: {
  labelId: string
  any: string
  choices: Choice<string>[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const items = createMemo(() => [
    { value: "", label: props.any },
    ...props.choices,
  ])
  const selected = () =>
    items().find((item) => item.value === props.value)?.label ?? props.any
  return (
    <Select
      value={props.value ?? ""}
      onValueChange={(value) => props.onChange(value || null)}
    >
      <SelectTrigger aria-labelledby={props.labelId} class="w-full">
        <SelectValue>{selected()}</SelectValue>
      </SelectTrigger>
      <SelectContent class="max-h-[min(22rem,var(--available-height))]">
        <For each={items()} keyed={(item) => item.value}>
          {(item) => (
            <SelectItem value={item().value} label={item().label}>
              <span class="min-w-0 flex-1 truncate">{item().label}</span>
              <Count value={item().count} />
            </SelectItem>
          )}
        </For>
      </SelectContent>
    </Select>
  )
}
