"use client"

import { Button, buttonVariants } from "@matinee/ui/components/button"
import { uiText, type UiText } from "@matinee/ui/lib/ui-text"
import { cn } from "cn"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  useDayPicker,
  type Chevron,
  type DayButton,
  type Root,
  type WeekNumber,
} from "react-day-picker"

declare global {
  namespace Intl {
    interface Locale {
      /** Chrome and Safari; the older `weekInfo` getter in some versions. */
      getWeekInfo?(): { firstDay: number }
      readonly weekInfo?: { firstDay: number }
    }
  }
}

type DayModifiers = { today?: boolean; selected?: boolean }

/**
 * Month and weekday names, day labels, and the first day of the week in
 * the language the app set in `uiText()`, from `Intl` rather than a
 * date-fns locale, so a new language needs nothing here.
 */
function calendarText(text: UiText) {
  const { locale } = text
  const monthYear = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  })
  const month = new Intl.DateTimeFormat(locale, { month: "short" })
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" })
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: "long" })
  const full = new Intl.DateTimeFormat(locale, { dateStyle: "full" })
  const dayLabel = (date: Date, modifiers: DayModifiers, picked: boolean) => {
    let label = full.format(date)
    if (modifiers.today) label = text.today(label)
    if (picked && modifiers.selected) label = text.selected(label)
    return label
  }
  let firstDay: number | undefined
  try {
    const info = new Intl.Locale(locale)
    firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay
  } catch {
    firstDay = undefined
  }
  return {
    // `Intl` counts Monday as 1 and Sunday as 7; DayPicker Sunday as 0.
    weekStartsOn:
      firstDay === undefined ? undefined : WEEK_STARTS[firstDay % 7],
    formatters: {
      formatCaption: (date: Date) => monthYear.format(date),
      formatMonthDropdown: (date: Date) => month.format(date),
      formatWeekdayName: (date: Date) => weekday.format(date),
    },
    labels: {
      labelNext: () => text.nextMonth,
      labelPrevious: () => text.previousMonth,
      labelGrid: (date: Date) => monthYear.format(date),
      labelWeekday: (date: Date) => weekdayLong.format(date),
      labelDayButton: (date: Date, modifiers: DayModifiers) =>
        dayLabel(date, modifiers, true),
      labelGridcell: (date: Date, modifiers?: DayModifiers) =>
        dayLabel(date, modifiers ?? {}, false),
    },
  }
}

const WEEK_STARTS = [0, 1, 2, 3, 4, 5, 6] as const

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  labels,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const text = calendarText(uiText())

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      weekStartsOn={text.weekStartsOn}
      formatters={{ ...text.formatters, ...formatters }}
      labels={{ ...text.labels, ...labels }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) rounded-(--cell-radius) p-0 select-none hover:bg-muted aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) rounded-(--cell-radius) p-0 select-none hover:bg-muted aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius) has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "font-medium select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-(--cell-radius) pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-[0.8rem] text-muted-foreground select-none",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day,
        ),
        range_start: cn(
          "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
          defaultClassNames.range_start,
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
          defaultClassNames.range_end,
        ),
        today: cn(
          "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<typeof Root>) {
  return (
    <div
      data-slot="calendar"
      ref={rootRef}
      className={cn(className)}
      {...props}
    />
  )
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof Chevron>) {
  const Icon =
    orientation === "left"
      ? ChevronLeftIcon
      : orientation === "right"
        ? ChevronRightIcon
        : ChevronDownIcon
  return <Icon className={cn("size-4", className)} {...props} />
}

function CalendarWeekNumber({
  children,
  ...props
}: React.ComponentProps<typeof WeekNumber>) {
  return (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </td>
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const { locale } = useDayPicker().dayPickerProps
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  // DayPicker moves focus between days with the arrow keys.
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 rounded-(--cell-radius) border-0 leading-none font-normal not-disabled:hover:bg-muted group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
