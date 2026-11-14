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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Switch } from "@matinee/ui/components/switch"
import { cn } from "@matinee/ui/lib/utils"
import { useId, useState } from "react"

import { Picture, tone } from "@/components/media-item"
import { tr } from "@/i18n"
import { art, present, seasonName } from "@/lib/media"

import { type CatalogSeasonEntry, refKey } from "./catalog-data"
import { useAsk } from "./use-ask"
import { asks, seasonDetail, stateWord } from "./words"

type Destination = { id: string; name: string; selected: boolean }

/**
 * Where a request that needs a decision is made: a show's seasons, each
 * the viewer may still request with a box and the server's pick already
 * ticked, the rest with their state, and on a first request "New seasons
 * as they air"; and, when the title could go to more than one library,
 * which. A film with only one library to go to never opens it.
 */
export function RequestDialog({
  open,
  onOpenChange,
  titleRef,
  name,
  seasons,
  first,
  defaultFuture,
  libraryId,
  destinations = [],
  onLibrary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: CatalogRef
  name: string
  /** A show's seasons, in order. Empty for a film. */
  seasons: CatalogSeasonEntry[]
  /** Nothing is requested for this title yet. */
  first: boolean
  /** Whether the server's default takes new seasons as they air. */
  defaultFuture: boolean
  libraryId?: string
  /** The libraries it could go to; a chooser when there's more than one. */
  destinations?: Destination[]
  onLibrary?: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 p-6 sm:max-w-md [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        {/* Another library's provider can number the seasons differently,
            so a new pick starts again from the server's. */}
        <RequestForm
          key={libraryId ?? ""}
          titleRef={titleRef}
          name={name}
          seasons={seasons}
          first={first}
          defaultFuture={defaultFuture}
          libraryId={libraryId}
          destinations={first ? destinations : []}
          onLibrary={onLibrary}
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
  defaultFuture,
  libraryId,
  destinations,
  onLibrary,
  onDone,
}: {
  titleRef: CatalogRef
  name: string
  seasons: CatalogSeasonEntry[]
  first: boolean
  defaultFuture: boolean
  libraryId?: string
  destinations: Destination[]
  onLibrary?: (id: string) => void
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
  const [future, setFuture] = useState(first && defaultFuture)
  const futureId = useId()
  const libraryLabel = useId()
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
  const nothing = show && chosen.length === 0 && !(future && first)
  const current = destinations.find((library) => library.selected)

  const submit = () =>
    ask.mutate(
      {
        ref: titleRef,
        name,
        libraryId,
        scope: show ? { seasons: chosen, future: future && first } : undefined,
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
                    <span className="text-muted-foreground shrink-0 text-[13px] tabular-nums">
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

      {show && first && (
        <div className="flex min-h-9 items-center justify-between gap-3">
          <label htmlFor={futureId} className="min-w-0 flex-1 cursor-pointer">
            {tr("ask.chooser.future")}
          </label>
          <Switch id={futureId} checked={future} onCheckedChange={setFuture} />
        </div>
      )}

      {current && onLibrary && destinations.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span id={libraryLabel}>{tr("ask.dialog.goesTo")}</span>
          <Select
            items={destinations.map((library) => ({
              value: library.id,
              label: library.name,
            }))}
            value={current.id}
            onValueChange={(id) => {
              if (id && id !== current.id) onLibrary(id)
            }}
          >
            <SelectTrigger aria-labelledby={libraryLabel} className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {destinations.map((library) => (
                <SelectItem key={library.id} value={library.id}>
                  {library.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button disabled={nothing || ask.isPending} onClick={submit}>
          {show ? submitLabel(chosen, future && first) : tr("ask.ask")}
        </Button>
      </DialogFooter>
    </>
  )
}

/** "Request 3 seasons", "Request season 4", "Request new seasons", and so on. */
function submitLabel(numbers: number[], future: boolean): string {
  const [only] = numbers
  if (numbers.length === 0) {
    return future ? tr("ask.chooser.newOnly") : tr("ask.chooser.none")
  }
  if (numbers.length === 1 && only !== undefined) {
    return only === 0
      ? tr("ask.chooser.specials")
      : tr("ask.chooser.one", { number: String(only) })
  }
  return tr("ask.chooser.many", { count: numbers.length })
}
