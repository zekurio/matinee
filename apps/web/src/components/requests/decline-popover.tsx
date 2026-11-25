import type { AdminRequestItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { createSignal, createUniqueId, Show } from "solid-js"

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

export type Answer =
  | { kind: "decline"; note: string | null }
  | { kind: "giveUp"; note: string | null }

type FirstFocus = { element?: HTMLElement }

/** Decline a request or give up on finding it, with an optional note. */
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

function AnswerForm(props: {
  first: FirstFocus
  giveUp: boolean
  /** Where an accepted request was sent, which keeps what it has. */
  connection: string | null
  /** Who requested it, who read the note. */
  askers: string[]
  phone: boolean
  onAnswer: (answer: Answer) => void
  onCancel: () => void
}) {
  const [note, setNote] = createSignal("")
  const id = createUniqueId()
  return (
    <form
      class="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        props.onAnswer({
          kind: props.giveUp ? "giveUp" : "decline",
          note: note().trim() || null,
        })
      }}
    >
      <div class={cn("flex flex-col gap-4", props.phone ? "px-5 py-4" : "p-3")}>
        <Field class="gap-1.5">
          <FieldLabel for={id} class="text-13px">
            {props.askers.length > 0
              ? tr("requests.decline.noteFor", {
                  names: formatNames(props.askers),
                })
              : tr("requests.decline.note")}
          </FieldLabel>
          <Input
            id={id}
            ref={(element: HTMLInputElement) => {
              props.first.element = element
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
        >
          {props.giveUp
            ? tr("requests.giveUp.submit")
            : tr("requests.decline.submit")}
        </Button>
      </div>
    </form>
  )
}
