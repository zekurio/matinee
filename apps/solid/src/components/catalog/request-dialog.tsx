import type { CatalogRef } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { createMemo, createSignal, For, Show, untrack } from "solid-js"

import { Picture, tone } from "@/components/picture"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Checkbox } from "@/kit/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { art, present, seasonName } from "@/lib/media"

import { type CatalogSeasonEntry, refKey } from "./catalog-data"
import { useAsk } from "./use-ask"
import { asks, seasonDetail, stateWord } from "./words"

/**
 * Where a request that needs a decision is made: a show's seasons, each
 * the viewer may still request with a box and the server's pick already
 * ticked, the rest with their state. Only seasons that are out can be
 * asked for; a new one is asked for once it airs. Where it lands is the
 * server's call, as in Seerr: an admin moves a request from the queue.
 */
export function RequestDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: CatalogRef
  name: string
  /** A show's seasons, in order. Empty for a film. */
  seasons: CatalogSeasonEntry[]
  /** Nothing is requested for this title yet. */
  first: boolean
  libraryId?: string
}) {
  // Another library's provider can number the seasons differently, so a
  // new pick starts again from the server's.
  const library = createMemo(() => ({ id: props.libraryId }))
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        class="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 p-6 sm:max-w-md"
      >
        <Show when={library()} keyed>
          {(current) => (
            <RequestForm
              titleRef={props.titleRef}
              name={props.name}
              seasons={props.seasons}
              first={props.first}
              libraryId={current.id}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </DialogContent>
    </Dialog>
  )
}

/** Mounts with the dialog, so each opening starts from the server's pick. */
function RequestForm(props: {
  titleRef: CatalogRef
  name: string
  seasons: CatalogSeasonEntry[]
  first: boolean
  libraryId?: string
  onDone: () => void
}) {
  const ask = useAsk()
  const show = () => props.titleRef.kind === "show"
  // The server's pick as the form opens; a live update to a season's
  // state after that doesn't undo what the viewer ticked.
  const [picked, setPicked] = createSignal(
    untrack(
      () =>
        new Set(
          props.seasons
            .filter((season) => season.selected && asks(season.availability))
            .map((season) => season.number),
        ),
    ),
  )
  const toggle = (number: number, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(number)
      else next.delete(number)
      return next
    })

  const chosen = createMemo(() =>
    props.seasons
      .filter((season) => picked().has(season.number))
      .map((season) => season.number),
  )
  const nothing = () => show() && chosen().length === 0

  // The dialog closes once the ask is in; a failure keeps it open, with
  // the toast `useAsk` shows.
  const submit = () =>
    void ask
      .mutate({
        ref: props.titleRef,
        name: props.name,
        libraryId: props.libraryId,
        scope: show() ? { seasons: chosen() } : undefined,
        undo: props.first,
      })
      .then(
        () => props.onDone(),
        () => undefined,
      )

  return (
    <>
      <DialogHeader>
        <DialogTitle class="pr-8 text-lg leading-7 font-semibold">
          {tr("ask.dialog.title", { name: props.name })}
        </DialogTitle>
      </DialogHeader>

      <Show when={show()}>
        <div class="-mx-6 flex min-h-0 flex-col border-y">
          <ul
            aria-label={tr("ask.chooser.seasons")}
            class="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 py-2"
          >
            <For each={props.seasons}>
              {(season) => {
                const open = () => asks(season.availability)
                const id = `${refKey(props.titleRef)}-season-${season.number}`
                return (
                  <li>
                    <label
                      for={open() ? id : undefined}
                      class={cn(
                        "flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5",
                        open() && "hover:bg-foreground/[0.06] cursor-pointer",
                      )}
                    >
                      <Show
                        when={open()}
                        fallback={
                          <span aria-hidden="true" class="w-[18px] shrink-0" />
                        }
                      >
                        <Checkbox
                          id={id}
                          checked={picked().has(season.number)}
                          onCheckedChange={(on) =>
                            toggle(season.number, on === true)
                          }
                        />
                      </Show>
                      <span
                        aria-hidden="true"
                        class={cn(
                          "relative block aspect-[2/3] w-7 shrink-0 overflow-hidden rounded-sm border",
                          tone(`${refKey(props.titleRef)}:${season.number}`),
                        )}
                      >
                        <Picture sources={present(art(season.poster))} />
                      </span>
                      <span
                        class={cn(
                          "min-w-0 flex-1 truncate font-medium",
                          !open() && "text-muted-foreground",
                        )}
                      >
                        {seasonName(season.number)}
                      </span>
                      <span class="text-muted-foreground text-13px shrink-0 tabular-nums">
                        {open()
                          ? seasonDetail(season)
                          : (stateWord(season.availability) ??
                            tr("ask.chooser.unavailable"))}
                      </span>
                    </label>
                  </li>
                )
              }}
            </For>
          </ul>
        </div>
      </Show>

      <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6 py-4">
        <Button disabled={nothing() || ask.isPending} onClick={submit}>
          {show() ? submitLabel(chosen()) : tr("ask.ask")}
        </Button>
      </DialogFooter>
    </>
  )
}

/** "Request 3 seasons", "Request season 4", and so on. */
function submitLabel(numbers: number[]): string {
  const [only] = numbers
  if (numbers.length === 0) return tr("ask.chooser.none")
  if (numbers.length === 1 && only !== undefined) {
    return only === 0
      ? tr("ask.chooser.specials")
      : tr("ask.chooser.one", { number: String(only) })
  }
  return tr("ask.chooser.many", { count: numbers.length })
}
