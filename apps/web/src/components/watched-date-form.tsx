import { Button } from "@matinee/ui/components/button"
import { Calendar } from "@matinee/ui/components/calendar"
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Field, FieldLabel } from "@matinee/ui/components/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { CalendarIcon, CheckIcon, ChevronDownIcon } from "lucide-react"
import { type RefObject, useId, useRef, useState } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { formatDate } from "@/lib/format"

/*
 * The form of `WatchedDateDialog`, apart so its calendar and form code
 * load when the dialog first opens, not with every card.
 */

/**
 * When on `day` to say the user watched: noon, as the server does for a
 * release date, so the play lands on that day in nearly every zone. Today
 * is now, since noon may not have come yet.
 */
function watchedAtOn(day: Date): Date {
  const now = new Date()
  const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)
  return noon > now ? now : noon
}

export function WatchedDateForm({
  triggerRef,
  onPick,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>
  onPick: (watchedAt: Date) => void
}) {
  const [today] = useState(() => new Date())
  const form = useAppForm({
    defaultValues: { day: today },
    onSubmit: ({ value }) => onPick(watchedAtOn(value.day)),
  })
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("media.watchedDate.title")}
        </DialogTitle>
      </DialogHeader>
      <form.Field name="day">
        {(field) => (
          <DayField
            triggerRef={triggerRef}
            today={today}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <form.AppForm>
          <form.SubmitButton icon={<CheckIcon />}>
            {tr("media.markWatched")}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}

/** A button showing the day, which opens a calendar up to `today`. */
function DayField({
  triggerRef,
  today,
  value,
  onChange,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>
  today: Date
  value: Date
  onChange: (day: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const valueId = useId()
  return (
    <Field>
      <FieldLabel id={labelId}>{tr("media.watchedDate.date")}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={triggerRef}
          aria-labelledby={`${labelId} ${valueId}`}
          render={
            <Button
              type="button"
              variant="outline"
              className="justify-start font-normal"
            />
          }
        >
          <CalendarIcon className="text-muted-foreground" />
          <span id={valueId}>{formatDate(value)}</span>
          <ChevronDownIcon className="text-muted-foreground ml-auto" />
        </PopoverTrigger>
        <PopoverContent
          ref={popupRef}
          align="start"
          className="w-(--anchor-width) p-0"
          // Keyboard users start on the picked day, to move with the arrows.
          initialFocus={(type) =>
            type !== "keyboard" ||
            (popupRef.current?.querySelector<HTMLElement>(
              "[data-selected-single=true]",
            ) ??
              true)
          }
        >
          <Calendar
            className="w-full"
            mode="single"
            required
            selected={value}
            defaultMonth={value}
            onSelect={(day) => {
              onChange(day)
              setOpen(false)
            }}
            captionLayout="dropdown"
            endMonth={today}
            disabled={{ after: today }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
