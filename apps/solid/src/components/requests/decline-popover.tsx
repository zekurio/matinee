import {
  type AdminRequestItem,
  WAITING_DECLINE_REASONS,
  type WaitingDeclineReason,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Check } from "lucide"
import { createSignal, createUniqueId, For, Show } from "solid-js"

import type { TriggerRender } from "@/components/catalog/ask-sheet"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@/kit/drawer"
import { Field, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import { isPhone } from "@/lib/viewport"

import { formatNames } from "./request-queue"

/**
 * An admin's no, as the queue sends it: a waiting request declined with
 * a reason, or an accepted one given up on, whose reason is always that
 * no copy could be found.
 */
export type Answer =
  | { kind: "decline"; reason: WaitingDeclineReason; note: string | null }
  | { kind: "giveUp"; note: string | null }

/** What takes focus as the form opens: the first reason, or the note. */
type FirstFocus = { element?: HTMLElement }

/**
 * Decline, with why: the reason, picked like a menu's item, and a note
 * for whoever requested it, over a footer with Cancel and Decline. Or,
 * with `giveUp`, the same form for giving up on an accepted request, its
 * reason fixed. A popover beside the button, or a drawer from the bottom
 * on phones. Enter sends it once a reason is picked; Escape closes it.
 */
export function DeclinePopover(props: {
  item: AdminRequestItem
  /** Give up on an accepted request rather than decline a waiting one. */
  giveUp?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onAnswer: (answer: Answer) => void
  renderTrigger: TriggerRender
  /**
   * Where focus goes as it closes: back to its button when this gives
   * nothing, or after an answer, to what takes the row's place.
   */
  finalFocus?: () => HTMLElement | null | undefined
  /** Once it has finished closing, for focus to move on after an answer. */
  onClosed?: () => void
}) {
  const first: FirstFocus = {}
  const title = () =>
    props.giveUp
      ? tr("requests.giveUp.title", { name: props.item.title.name })
      : tr("requests.decline.title", { name: props.item.title.name })
  // Fresh for each opening.
  const form = () => (
    <Show when={props.open}>
      <AnswerForm
        first={first}
        giveUp={props.giveUp ?? false}
        // A by-hand connection holds nothing to keep.
        connection={
          props.item.connection?.reportsProgress
            ? props.item.connection.name
            : null
        }
        askers={props.item.followers.map((follower) => follower.name)}
        phone={isPhone()}
        onAnswer={props.onAnswer}
        onCancel={() => props.onOpenChange(false)}
      />
    </Show>
  )
  const closed = (open: boolean) => {
    if (!open) props.onClosed?.()
  }
  const finalFocus = () => props.finalFocus?.() ?? undefined
  return (
    <Show
      when={isPhone()}
      fallback={
        <Popover
          open={props.open}
          onOpenChange={props.onOpenChange}
          onOpenChangeComplete={closed}
        >
          <PopoverTrigger render={props.renderTrigger} />
          <PopoverContent
            align="end"
            sideOffset={6}
            initialFocus={() => first.element}
            finalFocus={props.finalFocus ? finalFocus : "trigger"}
            class="w-80 gap-0 p-0"
          >
            <PopoverHeader>
              <PopoverTitle class="truncate font-semibold">
                {title()}
              </PopoverTitle>
            </PopoverHeader>
            {form()}
          </PopoverContent>
        </Popover>
      }
    >
      <Drawer
        open={props.open}
        onOpenChange={props.onOpenChange}
        onOpenChangeComplete={closed}
      >
        <DrawerTrigger render={props.renderTrigger} />
        <DrawerContent
          initialFocus={() => first.element}
          finalFocus={props.finalFocus ? finalFocus : "trigger"}
        >
          <DrawerHandle />
          <DrawerTitle class="truncate px-5 pt-3 text-lg leading-7 font-semibold tracking-tight">
            {title()}
          </DrawerTitle>
          <div class="flex min-h-0 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {form()}
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  )
}

const reasonRow =
  "flex h-8 items-center justify-between gap-3 rounded-md px-2 text-left text-sm select-none [@media(pointer:coarse)]:h-11"

function AnswerForm(props: {
  first: FirstFocus
  giveUp: boolean
  /** Where an accepted request was sent, which keeps what it has. */
  connection: string | null
  /** Who requested it, who read the reason and the note. */
  askers: string[]
  phone: boolean
  onAnswer: (answer: Answer) => void
  onCancel: () => void
}) {
  const [reason, setReason] = createSignal<WaitingDeclineReason | null>(null)
  const [note, setNote] = createSignal("")
  const id = createUniqueId()
  const reasons: (HTMLButtonElement | undefined)[] = []
  let cancel: HTMLButtonElement | undefined
  const ready = () => props.giveUp || reason() !== null

  const submit = () => {
    const text = note().trim() || null
    const picked = reason()
    if (props.giveUp) props.onAnswer({ kind: "giveUp", note: text })
    else if (picked)
      props.onAnswer({ kind: "decline", reason: picked, note: text })
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
    reasons[next]?.focus()
  }

  return (
    <form
      class="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      // Enter sends it from anywhere in it once a reason is picked, the
      // reasons included, which a form leaves to themselves. Cancel keeps
      // its own Enter.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !ready() || event.isComposing) return
        if (event.target === cancel) return
        event.preventDefault()
        event.currentTarget.requestSubmit()
      }}
    >
      <div class={cn("flex flex-col gap-4", props.phone ? "px-5 py-4" : "p-3")}>
        <Field class="gap-1.5">
          <FieldLabel id={`${id}-reason`} class="text-13px">
            {tr("requests.decline.reason")}
          </FieldLabel>
          <Show
            when={!props.giveUp}
            fallback={
              // Only one reason fits giving up, so it's said, not offered.
              <p class={cn(reasonRow, "text-foreground -mx-1 font-medium")}>
                {tr("requests.reason.notFound")}
                <Icon icon={Check} class="text-primary size-4" />
              </p>
            }
          >
            <div
              role="radiogroup"
              aria-labelledby={`${id}-reason`}
              class="-mx-1 flex flex-col"
            >
              <For each={WAITING_DECLINE_REASONS}>
                {(value, index) => (
                  <button
                    ref={(element) => {
                      const at = WAITING_DECLINE_REASONS.indexOf(value)
                      reasons[at] = element
                      if (at === 0) props.first.element = element
                    }}
                    type="button"
                    role="radio"
                    aria-checked={reason() === value ? "true" : "false"}
                    tabindex={
                      reason() === value || (reason() === null && index() === 0)
                        ? 0
                        : -1
                    }
                    onClick={() => setReason(value)}
                    onKeyDown={(event) => moveReason(event, index())}
                    class={cn(
                      reasonRow,
                      "outline-none",
                      "hover:bg-foreground/[0.06] focus-visible:bg-foreground/10",
                      reason() === value
                        ? "text-foreground font-medium"
                        : "text-foreground/80",
                    )}
                  >
                    {tr(`requests.reason.${value}`)}
                    <Show when={reason() === value}>
                      <Icon icon={Check} class="text-primary size-4" />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Field>
        <Field class="gap-1.5">
          <FieldLabel class="text-13px">
            {props.askers.length > 0
              ? tr("requests.decline.noteFor", {
                  names: formatNames(props.askers),
                })
              : tr("requests.decline.note")}
          </FieldLabel>
          <Input
            ref={(element: HTMLInputElement) => {
              if (props.giveUp) props.first.element = element
            }}
            value={note()}
            maxlength={2000}
            autocomplete="off"
            placeholder={tr("requests.decline.notePlaceholder")}
            onValueChange={(value: string) => setNote(value)}
          />
        </Field>
        <Show when={props.giveUp}>
          <p class="text-muted-foreground text-13px leading-5 text-pretty">
            {props.connection
              ? tr("requests.giveUp.keeps", { connection: props.connection })
              : tr("requests.giveUp.turnsUp")}
          </p>
        </Show>
      </div>
      <div
        class={cn(
          "flex justify-end gap-2 border-t",
          props.phone ? "px-5 py-3" : "px-3 py-2.5",
        )}
      >
        <Button
          ref={(element: HTMLButtonElement) => {
            cancel = element
          }}
          type="button"
          variant="ghost"
          size={props.phone ? "lg" : "sm"}
          onClick={() => props.onCancel()}
        >
          {tr("requests.decline.cancel")}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          size={props.phone ? "lg" : "sm"}
          disabled={!ready()}
        >
          {props.giveUp
            ? tr("requests.giveUp.submit")
            : tr("requests.decline.submit")}
        </Button>
      </div>
    </form>
  )
}
