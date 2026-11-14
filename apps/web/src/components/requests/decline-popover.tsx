import {
  type AdminRequestItem,
  WAITING_DECLINE_REASONS,
  type WaitingDeclineReason,
} from "@matinee/contracts"
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
import { CheckIcon } from "lucide-react"
import {
  type KeyboardEvent,
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
 * An admin's no, as the queue sends it: a waiting request declined with
 * a reason, or an accepted one given up on, whose reason is always that
 * no copy could be found.
 */
export type Answer =
  | { kind: "decline"; reason: WaitingDeclineReason; note: string | null }
  | { kind: "giveUp"; note: string | null }

/**
 * Decline, with why: the reason, picked like a menu's item, and a note
 * for whoever requested it, over a footer with Cancel and Decline. Or,
 * with `giveUp`, the same form for giving up on an accepted request, its
 * reason fixed. A popover beside the button, or a drawer from the bottom
 * on phones. Enter sends it once a reason is picked; Escape closes it.
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
  const askers = item.followers
    .filter((follower) => follower.asked)
    .map((follower) => follower.name)
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

const reasonRow =
  "flex h-8 items-center justify-between gap-3 rounded-md px-2 text-left text-sm select-none [@media(pointer:coarse)]:h-11"

function AnswerForm({
  first,
  giveUp,
  connection,
  askers,
  phone,
  onAnswer,
  onCancel,
}: {
  /** What takes focus as it opens: the first reason, or the note. */
  first: RefObject<HTMLElement | null>
  giveUp: boolean
  /** Where an accepted request was sent, which keeps what it has. */
  connection: string | null
  /** Who requested it, who read the reason and the note. */
  askers: string[]
  phone: boolean
  onAnswer: (answer: Answer) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState<WaitingDeclineReason | null>(null)
  const [note, setNote] = useState("")
  const id = useId()
  const reasons = useRef<(HTMLButtonElement | null)[]>([])
  const cancel = useRef<HTMLButtonElement>(null)
  const ready = giveUp || reason !== null

  const submit = () => {
    const text = note.trim() || null
    if (giveUp) onAnswer({ kind: "giveUp", note: text })
    else if (reason) onAnswer({ kind: "decline", reason, note: text })
  }

  // Arrow keys move between the reasons, as in any radio group.
  const moveReason = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const count = WAITING_DECLINE_REASONS.length
    const next = (index + step + count) % count
    const value = WAITING_DECLINE_REASONS[next]
    if (value) setReason(value)
    reasons.current[next]?.focus()
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      // Enter sends it from anywhere in it once a reason is picked, the
      // reasons included, which a form leaves to themselves. Cancel keeps
      // its own Enter.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !ready || event.nativeEvent.isComposing)
          return
        if (event.target === cancel.current) return
        event.preventDefault()
        event.currentTarget.requestSubmit()
      }}
    >
      <div className={cn("flex flex-col gap-4", phone ? "px-5 py-4" : "p-3")}>
        <Field className="gap-1.5">
          <FieldLabel id={`${id}-reason`} className="text-[13px]">
            {tr("requests.decline.reason")}
          </FieldLabel>
          {giveUp ? (
            // Only one reason fits giving up, so it's said, not offered.
            <p className={cn(reasonRow, "text-foreground -mx-1 font-medium")}>
              {tr("requests.reason.notFound")}
              <CheckIcon aria-hidden className="text-primary size-4" />
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby={`${id}-reason`}
              className="-mx-1 flex flex-col"
            >
              {WAITING_DECLINE_REASONS.map((value, index) => {
                const checked = reason === value
                return (
                  <button
                    key={value}
                    ref={(element) => {
                      reasons.current[index] = element
                      if (index === 0) first.current = element
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={
                      checked || (reason === null && index === 0) ? 0 : -1
                    }
                    onClick={() => setReason(value)}
                    onKeyDown={(event) => moveReason(event, index)}
                    className={cn(
                      reasonRow,
                      "outline-none",
                      "hover:bg-foreground/[0.06] focus-visible:bg-foreground/10",
                      checked
                        ? "text-foreground font-medium"
                        : "text-foreground/80",
                    )}
                  >
                    {tr(`requests.reason.${value}`)}
                    {checked && (
                      <CheckIcon aria-hidden className="text-primary size-4" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`${id}-note`} className="text-[13px]">
            {askers.length > 0
              ? tr("requests.decline.noteFor", { names: formatNames(askers) })
              : tr("requests.decline.note")}
          </FieldLabel>
          <Input
            id={`${id}-note`}
            ref={(element) => {
              if (giveUp) first.current = element
            }}
            value={note}
            maxLength={2000}
            autoComplete="off"
            placeholder={tr("requests.decline.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {giveUp && (
          <p className="text-muted-foreground text-[13px] leading-5 text-pretty">
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
          ref={cancel}
          type="button"
          variant="ghost"
          size={phone ? "lg" : "sm"}
          onClick={onCancel}
        >
          {tr("requests.decline.cancel")}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          size={phone ? "lg" : "sm"}
          disabled={!ready}
        >
          {giveUp
            ? tr("requests.giveUp.submit")
            : tr("requests.decline.submit")}
        </Button>
      </div>
    </form>
  )
}
