import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentValues,
  Library,
  LibraryFulfilment,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matinee/ui/components/collapsible"
import { Field, FieldLabel } from "@matinee/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { cn } from "@matinee/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react"
import { useId, useState } from "react"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

import { DescribedInput, textValues } from "./connection-dialog"

/** The options for anime as an admin changed them, until saved. */
export type AnimeEdit = {
  /** Choices changed by hand, over what the set starts from. */
  options: Record<string, string>
  /** The library picked for it, when Matinee can't tell where it lands. */
  libraryId: string | null
  /** It starts from the source's choices, not the saved set's. */
  fresh: boolean
}

/**
 * The options for anime as saving would leave them, null when anime is
 * sent like everything else. `edit` undefined is untouched, null cleared.
 */
export function animeState(
  saved: LibraryFulfilment | undefined,
  connectionId: string | null,
  defaults: FulfilmentValues,
  edit: AnimeEdit | null | undefined,
) {
  // Saved options for anime belong to the connection they were saved with.
  const kept = saved?.connectionId === connectionId ? saved.anime : null
  if (edit === null || (edit === undefined && !kept)) return null
  const base = kept && !edit?.fresh ? kept.options : defaults
  return {
    options: { ...textValues(base), ...edit?.options },
    libraryId:
      edit?.libraryId ??
      (kept && !kept.found && !edit?.fresh ? (kept.library?.id ?? null) : null),
  }
}

/**
 * The "Anime" part under a library's options: the same choices again, for
 * anime, and where those land. Collapsed, and empty until filled.
 */
export function AnimeOptions({
  library,
  libraries,
  connection,
  fields,
  defaults,
  state,
  onEdit,
}: {
  library: Library
  libraries: Library[]
  connection: FulfilmentConnection
  fields: DescribedField[]
  /** What the source starts them from. */
  defaults: FulfilmentValues
  state: ReturnType<typeof animeState>
  /** Null sends anime like everything else again. */
  onEdit: (edit: AnimeEdit | null) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const values = state?.options ?? textValues(defaults)
  const complete = fields.every((field) => !field.required || values[field.key])
  const landing = useQuery({
    ...orpc.admin.fulfilment.landing.queryOptions({
      input: {
        connectionId: connection.id,
        libraryId: library.id,
        options: values,
      },
    }),
    enabled: state !== null && complete,
    placeholderData: keepPreviousData,
    retry: false,
  })
  const found = state && complete ? landing.data?.library : undefined
  const lost =
    state !== null && complete && landing.isSuccess && !landing.data.library
  const picked = libraries.find((entry) => entry.id === state?.libraryId)
  const lands = found ?? (lost ? picked : undefined)

  // Every choice goes into the edit, so it doesn't matter what it started from.
  const change = (options: Record<string, string>, libraryId: string | null) =>
    onEdit({ options, libraryId, fresh: state === null })

  const status = !state
    ? tr("connections.anime.off")
    : lands
      ? tr("connections.anime.lands", { library: lands.name })
      : lost
        ? tr("connections.anime.choose")
        : null
  // Libraries anime could land in: of this kind, taking requests.
  const homes = libraries.filter(
    (entry) => entry.kind === library.kind && entry.metadataProvider !== null,
  )
  const homeItems = homes.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }))

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group/anime -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm",
          "hover:bg-foreground/[0.04] focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
        )}
      >
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-panel-open/anime:rotate-90 motion-reduce:transition-none"
        />
        <span className="font-medium">{tr("connections.anime")}</span>
        {status && (
          <span
            className={cn(
              "ml-auto truncate pl-3 text-[13px]",
              lost && !picked
                ? "text-warning"
                : lands
                  ? "text-foreground/80"
                  : "text-muted-foreground",
            )}
          >
            {status}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className="flex flex-col gap-3 pt-2 pb-0.5 pl-5.5">
          <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
            {fields.map((field) => (
              <DescribedInput
                key={field.key}
                field={field}
                value={state ? (values[field.key] ?? "") : ""}
                placeholder={tr("connections.libraries.pick")}
                onChange={(next) =>
                  change(
                    { ...values, [field.key]: next },
                    state?.libraryId ?? null,
                  )
                }
              />
            ))}
          </div>
          {lost && (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-1.5 text-[13px] leading-5">
                <TriangleAlertIcon
                  aria-hidden
                  className="text-warning mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  {landing.data.folder
                    ? tr("connections.anime.lost", {
                        folder: landing.data.folder,
                      })
                    : tr("connections.anime.lostNoFolder")}
                </span>
              </p>
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor={`${id}-home`}>
                    {tr("connections.anime.landsIn")}
                  </FieldLabel>
                  <Select
                    items={homeItems}
                    value={picked?.id ?? null}
                    onValueChange={(next) => next && change(values, next)}
                  >
                    <SelectTrigger id={`${id}-home`} className="w-full">
                      <SelectValue
                        placeholder={tr("connections.libraries.pick")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {homeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}
          {state && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ml-2.5"
                onClick={() => onEdit(null)}
              >
                {tr("connections.anime.clear")}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
