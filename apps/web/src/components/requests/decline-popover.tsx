import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import { Field, FieldLabel } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { cn } from "@matinee/ui/lib/utils"
import {
  type ReactElement,
  type RefObject,
  useId,
  useRef,
  useState,
} from "react"

import { usePhone } from "@/components/sheet-menu"
import { tr } from "@/i18n"

import { formatNames } from "./request-queue"

/**
 * An admin's no, as the queue sends it: a waiting request declined, or an
 * accepted one given up on for want of a copy, each with the reason the
 * admin typed, if any.
 */
export type Answer =
  | { kind: "decline"; note: string | null }
  | { kind: "giveUp"; note: string | null }

/**
 * Decline, with why: one field for a reason to whoever requested it,
 * which may stay empty, over a footer with Cancel and Decline. Or, with
 * `giveUp`, the same form for giving up on an accepted request. A popover
 * beside the button, or a drawer from the bottom on phones. Enter sends
 * it; Escape closes it.
 */
export function DeclinePopover({
  item,
  giveUp = false,
  open,
  onOpenChange,
  onAnswer,
  trigger,
  finalFocus,
  onClosed,
}: {
  item: AdminRequestItem
  /** Give up on an accepted request rather than decline a waiting one. */
  giveUp?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onAnswer: (answer: Answer) => void
  trigger: ReactElement
  /**
   * Where focus goes as it closes: back to its button, or after an
   * answer, to what takes the row's place.
   */
  finalFocus?: () => HTMLElement | boolean
  /** Once it has finished closing, for focus to move on after an answer. */
  onClosed?: () => void
}) {
  const first = useRef<HTMLElement>(null)
  const phone = usePhone()
  const title = giveUp
    ? tr("requests.giveUp.title", { name: item.title.name })
    : tr("requests.decline.title", { name: item.title.name })
  const askers = item.followers.map((follower) => follower.name)
  // Fresh for each opening.
  const form = open && (
    <AnswerForm
      first={first}
      giveUp={giveUp}
      // A by-hand connection holds nothing to keep.
      connection={
        item.connection?.reportsProgress ? item.connection.name : null
      }
      askers={askers}
      phone={phone}
      onAnswer={onAnswer}
      onCancel={() => onOpenChange(false)}
    />
  )
  if (phone) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={(next) => !next && onClosed?.()}
      >
        <DrawerTrigger render={trigger} />
        <DrawerContent initialFocus={first} finalFocus={finalFocus}>
          <DrawerHandle />
          <DrawerTitle className="truncate px-5 pt-3 text-lg leading-7 font-semibold tracking-tight">
            {title}
          </DrawerTitle>
          <div className="flex min-h-0 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {form}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => !next && onClosed?.()}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        sideOffset={6}
        initialFocus={first}
        finalFocus={finalFocus}
        className="w-80 gap-0 p-0"
      >
        <PopoverHeader>
          <PopoverTitle className="truncate font-semibold">
            {title}
          </PopoverTitle>
        </PopoverHeader>
        {form}
      </PopoverContent>
    </Popover>
  )
}

function AnswerForm({
  first,
  giveUp,
  connection,
  askers,
  phone,
  onAnswer,
  onCancel,
}: {
  /** What takes focus as it opens: the reason's field. */
  first: RefObject<HTMLElement | null>
  giveUp: boolean
  /** Where an accepted request was sent, which keeps what it has. */
  connection: string | null
  /** Who requested it, who read the reason. */
  askers: string[]
  phone: boolean
  onAnswer: (answer: Answer) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState("")
  const id = useId()

  const submit = () => {
    const text = note.trim() || null
    onAnswer(
      giveUp ? { kind: "giveUp", note: text } : { kind: "decline", note: text },
    )
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className={cn("flex flex-col gap-4", phone ? "px-5 py-4" : "p-3")}>
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`${id}-note`} className="text-13px">
            {askers.length > 0
              ? tr("requests.decline.noteFor", { names: formatNames(askers) })
              : tr("requests.decline.note")}
          </FieldLabel>
          <Input
            id={`${id}-note`}
            ref={(element) => {
              first.current = element
            }}
            value={note}
            maxLength={2000}
            autoComplete="off"
            placeholder={tr("requests.decline.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {giveUp && (
          <p className="text-muted-foreground text-13px leading-5 text-pretty">
            {connection
              ? tr("requests.giveUp.keeps", { connection })
              : tr("requests.giveUp.turnsUp")}
          </p>
        )}
      </div>
      <div
        className={cn(
          "flex justify-end gap-2 border-t",
          phone ? "px-5 py-3" : "px-3 py-2.5",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size={phone ? "lg" : "sm"}
          onClick={onCancel}
        >
          {tr("requests.decline.cancel")}
        </Button>
        <Button type="submit" variant="destructive" size={phone ? "lg" : "sm"}>
          {giveUp
            ? tr("requests.giveUp.submit")
            : tr("requests.decline.submit")}
        </Button>
      </div>
    </form>
  )
}
