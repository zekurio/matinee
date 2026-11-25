import { CalendarDays, Check, ChevronDown } from "lucide"
import { createSignal, createUniqueId } from "solid-js"

import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Calendar } from "@/kit/calendar"
import { DialogFooter, DialogHeader, DialogTitle } from "@/kit/dialog"
import { Field, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/kit/popover"
import { createForm } from "@/lib/form"
import { SubmitButton } from "@/lib/form-fields"
import { formatDate } from "@/lib/format"

/** A local day as the calendar writes it, like `"2026-10-16"`. */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** The local midnight of a calendar day. */
function dayDate(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

/**
 * When on `day` to say the user watched: noon, as the server does for a
 * release date, so the play lands on that day in nearly every zone. Today
 * is now, since noon may not have come yet.
 */
function watchedAtOn(day: string): Date {
  const now = new Date()
  const noon = dayDate(day)
  noon.setHours(12)
  return noon > now ? now : noon
}

/** The form of `WatchedDateDialog`: a day, then Mark watched. */
export function WatchedDateForm(props: {
  /** The day button, which the dialog focuses when it opens. */
  triggerRef?: (element: HTMLButtonElement) => void
  onPick: (watchedAt: Date) => void
}) {
  const today = isoDay(new Date())
  const form = createForm({
    defaultValues: { day: today },
    onSubmit: (values) => props.onPick(watchedAtOn(values.day)),
  })
  return (
    <form
      class="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.submit()
      }}
    >
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("media.watchedDate.title")}
        </DialogTitle>
      </DialogHeader>
      <DayField
        triggerRef={props.triggerRef}
        today={today}
        value={form.values().day}
        onChange={(day) => form.set("day", day)}
      />
      <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6 py-4">
        <SubmitButton form={form} icon={<Icon icon={Check} />}>
          {tr("media.markWatched")}
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

/** A button showing the day, which opens a calendar up to `today`. */
function DayField(props: {
  triggerRef?: (element: HTMLButtonElement) => void
  today: string
  value: string
  onChange: (day: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const labelId = createUniqueId()
  const valueId = createUniqueId()
  // As far back as the dropdown calendar goes: a century.
  const earliest = () => {
    const date = dayDate(props.today)
    date.setFullYear(date.getFullYear() - 100)
    return isoDay(date)
  }
  return (
    <Field>
      <FieldLabel id={labelId}>{tr("media.watchedDate.date")}</FieldLabel>
      <Popover open={open()} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={(element) => props.triggerRef?.(element)}
          aria-labelledby={`${labelId} ${valueId}`}
          class={buttonVariants({
            variant: "outline",
            className: "justify-start font-normal",
          })}
        >
          <Icon icon={CalendarDays} class="text-muted-foreground" />
          <span id={valueId}>{formatDate(dayDate(props.value))}</span>
          <Icon icon={ChevronDown} class="text-muted-foreground ml-auto" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          class="w-(--anchor-width) p-0"
          // Keyboard users start on the picked day, to move with the arrows.
          initialFocus='[data-slot="calendar-day"][tabindex="0"]'
        >
          <Calendar
            class="w-full"
            value={props.value}
            defaultMonth={props.value.slice(0, 7)}
            onValueChange={(day) => {
              // A single-date calendar gives one day, or null once cleared.
              if (day === null || Array.isArray(day)) return
              props.onChange(day)
              setOpen(false)
            }}
            captionLayout="dropdown"
            min={earliest()}
            max={props.today}
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
