import type { CatalogRef } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Checkbox } from "@matinee/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { cn } from "@matinee/ui/lib/utils"
import { useState } from "react"

import { Picture, tone } from "@/components/media-item"
import { tr } from "@/i18n"
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
export function RequestDialog({
  open,
  onOpenChange,
  titleRef,
  name,
  seasons,
  first,
  libraryId,
}: {
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 p-6 sm:max-w-md"
      >
        {/* Another library's provider can number the seasons differently,
            so a new pick starts again from the server's. */}
        <RequestForm
          key={libraryId ?? ""}
          titleRef={titleRef}
          name={name}
          seasons={seasons}
          first={first}
          libraryId={libraryId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Mounts with the dialog, so each opening starts from the server's pick. */
function RequestForm({
  titleRef,
  name,
  seasons,
  first,
  libraryId,
  onDone,
}: {
  titleRef: CatalogRef
  name: string
  seasons: CatalogSeasonEntry[]
  first: boolean
  libraryId?: string
  onDone: () => void
}) {
  const ask = useAsk()
  const show = titleRef.kind === "show"
  const [picked, setPicked] = useState(
    () =>
      new Set(
        seasons
          .filter((season) => season.selected && asks(season.availability))
          .map((season) => season.number),
      ),
  )
  const toggle = (number: number, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(number)
      else next.delete(number)
      return next
    })

  const chosen = seasons
    .filter((season) => picked.has(season.number))
    .map((season) => season.number)
  const nothing = show && chosen.length === 0

  const submit = () =>
    ask.mutate(
      {
        ref: titleRef,
        name,
        libraryId,
        scope: show ? { seasons: chosen } : undefined,
        undo: first,
      },
      { onSuccess: onDone },
    )

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8 text-lg leading-7 font-semibold">
          {tr("ask.dialog.title", { name })}
        </DialogTitle>
      </DialogHeader>

      {show && (
        <div className="-mx-6 flex min-h-0 flex-col border-y">
          <ul
            aria-label={tr("ask.chooser.seasons")}
            className="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 py-2"
          >
            {seasons.map((season) => {
              const open = asks(season.availability)
              const id = `${refKey(titleRef)}-season-${season.number}`
              return (
                <li key={season.number}>
                  <label
                    htmlFor={open ? id : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5",
                      open && "hover:bg-foreground/[0.06] cursor-pointer",
                    )}
                  >
                    {open ? (
                      <Checkbox
                        id={id}
                        checked={picked.has(season.number)}
                        onCheckedChange={(on) => toggle(season.number, on)}
                      />
                    ) : (
                      <span aria-hidden className="w-[18px] shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "relative block aspect-[2/3] w-7 shrink-0 overflow-hidden rounded-sm border",
                        tone(`${refKey(titleRef)}:${season.number}`),
                      )}
                    >
                      <Picture sources={present(art(season.poster))} />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-medium",
                        !open && "text-muted-foreground",
                      )}
                    >
                      {seasonName(season.number)}
                    </span>
                    <span className="text-muted-foreground text-13px shrink-0 tabular-nums">
                      {open
                        ? seasonDetail(season)
                        : (stateWord(season.availability) ??
                          tr("ask.chooser.unavailable"))}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <DialogFooter showCancelButton className="-mx-6 -mb-6 px-6 py-4">
        <Button disabled={nothing || ask.isPending} onClick={submit}>
          {show ? submitLabel(chosen) : tr("ask.ask")}
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
