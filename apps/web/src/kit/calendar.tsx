import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import {
  Calendar as CalendarRoot,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
} from "@ui-sdk/solid/calendar"
import type { VariantProps } from "class-variance-authority"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide"
import { type ComponentProps, omit, Show } from "solid-js"

import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"

type CalendarProps = Omit<ComponentProps<typeof CalendarRoot>, "class"> & {
  class?: string
  /** The month as a heading, or as month and year selects to jump with. */
  captionLayout?: "label" | "dropdown"
  buttonVariant?: VariantProps<typeof buttonVariants>["variant"]
}

const navButton =
  "size-(--cell-size) rounded-(--cell-radius) p-0 select-none hover:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 rtl:[&>svg]:rotate-180"

/**
 * A month grid to pick dates from, as ISO strings like `"2026-10-16"`.
 * Month and weekday names, day labels and the first day of the week come
 * from the language the app set in `uiText()`, through `Intl`.
 */
function Calendar(props: CalendarProps) {
  const text = uiText()
  return (
    <CalendarRoot
      {...omit(props, "class", "captionLayout", "buttonVariant", "children")}
      locale={props.locale ?? text.locale}
      monthFormat={
        props.monthFormat ??
        (props.captionLayout === "dropdown" ? "short" : "long")
      }
      showOutsideDays={props.showOutsideDays ?? true}
      data-slot="calendar"
      class={cn(
        "group/calendar bg-background w-fit p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        props.class,
      )}
    >
      <div class="flex flex-col gap-4">
        <div class="relative flex h-(--cell-size) w-full items-center justify-between gap-1">
          <CalendarPrevious
            aria-label={text.previousMonth}
            class={cn(
              buttonVariants({ variant: props.buttonVariant ?? "ghost" }),
              navButton,
            )}
          >
            <Icon icon={ChevronLeft} />
          </CalendarPrevious>
          <Show
            when={props.captionLayout === "dropdown"}
            fallback={
              <CalendarHeading class="text-sm font-medium select-none" />
            }
          >
            <div class="flex h-(--cell-size) items-center justify-center gap-1.5 text-sm font-medium">
              {/* Still names the grid for screen readers. */}
              <CalendarHeading class="sr-only" />
              <CalendarMonthSelect render={captionSelect} />
              <CalendarYearSelect render={captionSelect} />
            </div>
          </Show>
          <CalendarNext
            aria-label={text.nextMonth}
            class={cn(
              buttonVariants({ variant: props.buttonVariant ?? "ghost" }),
              navButton,
            )}
          >
            <Icon icon={ChevronRight} />
          </CalendarNext>
        </div>
        <CalendarGrid class="w-full border-collapse">
          <CalendarWeekdays class="[&>tr]:flex">
            {(index) => (
              <CalendarWeekday
                index={index}
                class="text-13px text-muted-foreground flex-1 rounded-(--cell-radius) font-normal select-none"
              />
            )}
          </CalendarWeekdays>
          <CalendarWeeks class="[&>tr]:mt-2 [&>tr]:flex [&>tr]:w-full [&>tr>td]:flex-1">
            {(cell) => <CalendarDayButton value={cell.date} />}
          </CalendarWeeks>
        </CalendarGrid>
      </div>
    </CalendarRoot>
  )
}

/**
 * A native select of the months or years, laid over its own label so it
 * reads like the heading with a chevron, and opens the system's list.
 */
const captionSelect: ComponentProps<typeof CalendarMonthSelect>["render"] = (
  select,
  state,
) => (
  <span class="has-focus-visible:ring-ring/50 relative flex h-8 items-center gap-1 rounded-(--cell-radius) pr-1 pl-2 has-focus-visible:ring-3">
    <span aria-hidden="true" class="select-none">
      {state.options.find((option) => option.value === state.value)?.label ??
        state.value}
    </span>
    <Icon icon={ChevronDown} class="text-muted-foreground size-3.5" />
    <select
      {...select}
      class="[&>option]:bg-popover [&>option]:text-popover-foreground absolute inset-0 cursor-pointer appearance-none opacity-0"
    />
  </span>
)

/** A day in the grid: a square that fills for the picked day or range ends. */
function CalendarDayButton(
  props: Omit<ComponentProps<typeof CalendarDay>, "class"> & { class?: string },
) {
  return (
    <CalendarDay
      {...omit(props, "class")}
      class={cn(
        "relative isolate z-10 flex aspect-square w-full min-w-(--cell-size) cursor-default items-center justify-center rounded-(--cell-radius) text-sm leading-none font-normal outline-none select-none not-data-disabled:hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 data-today:bg-muted data-outside:text-muted-foreground data-disabled:text-muted-foreground data-disabled:opacity-50 data-unavailable:line-through data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary data-range-middle:rounded-none data-range-middle:bg-muted data-range-middle:text-foreground data-range-middle:hover:bg-muted",
        props.class,
      )}
    />
  )
}

export { Calendar, CalendarDayButton }
export type { CalendarProps }
