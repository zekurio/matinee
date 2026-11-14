import type {
  FulfilmentConnection,
  FulfilmentSourceDescription,
  Library,
  LibraryFulfilment,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Field, FieldLabel } from "@matinee/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Spinner } from "@matinee/ui/components/spinner"
import {
  keepPreviousData,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useId, useState } from "react"

import { libraryIcons } from "@/components/app-shell"
import { perLocale, tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { type AnimeEdit, AnimeOptions, animeState } from "./anime-options"
import { DescribedInput, textValues } from "./connection-dialog"
import { SettingWarning } from "./setting-controls"
import {
  SettingNote,
  SettingRows,
  SettingsSaveBar,
  SettingsSubsection,
} from "./settings-panel"

/** What an admin changed for a library, until it's saved. */
type Edit = {
  connectionId: string | null
  /** Choices changed by hand. The rest are what the server preselects. */
  options: Record<string, string>
  /** The options for anime: undefined untouched, null cleared. */
  anime?: AnimeEdit | null
}

const NOTHING = "nothing"

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** The kind of title a library holds, as sources name what they take. */
function titleKind(library: Library) {
  return library.kind === "movies" ? "movie" : "show"
}

/**
 * Which connection fills each library, and its choices for it, like the
 * quality and where it saves. One save for every library changed.
 */
export function LibraryFill({
  libraries,
  mappings,
  connections,
  sources,
}: {
  libraries: UseQueryResult<Library[]>
  /** Each library's saved mapping, in the order of `libraries`. */
  mappings: UseQueryResult<LibraryFulfilment>[]
  connections: FulfilmentConnection[] | undefined
  sources: FulfilmentSourceDescription[] | undefined
}) {
  const queryClient = useQueryClient()
  const [edits, setEdits] = useState(() => new Map<string, Edit>())

  const saved = (libraryId: string) =>
    mappings.find((mapping) => mapping.data?.libraryId === libraryId)?.data
  const described = (libraryId: string, connectionId: string) =>
    queryClient.getQueryData(
      orpc.admin.fulfilment.options.queryKey({
        input: { connectionId, libraryId },
      }),
    )
  /** The options a save sends: the server's, with the admin's edits over them. */
  const optionsFor = (libraryId: string, edit: Edit) => {
    if (!edit.connectionId) return {}
    return {
      ...textValues(described(libraryId, edit.connectionId)?.values ?? {}),
      ...edit.options,
    }
  }
  /** The options for anime a save sends, or undefined to keep them. */
  const animeFor = (libraryId: string, edit: Edit) => {
    if (edit.anime === undefined || !edit.connectionId) return undefined
    return animeState(
      saved(libraryId),
      edit.connectionId,
      described(libraryId, edit.connectionId)?.anime ?? {},
      edit.anime,
    )
  }
  const changed = [...edits.entries()].filter(([libraryId, edit]) => {
    const current = saved(libraryId)
    if (!current) return true
    if ((current.connectionId ?? null) !== edit.connectionId) return true
    if (edit.anime !== undefined && (edit.anime !== null || current.anime))
      return true
    const before = textValues(current.options)
    return Object.entries(edit.options).some(
      ([key, value]) => before[key] !== value,
    )
  })

  const save = async () => {
    const failures: string[] = []
    for (const [libraryId, edit] of changed) {
      const library = libraries.data?.find((entry) => entry.id === libraryId)
      try {
        const next = await client.admin.fulfilment.setMapping({
          libraryId,
          connectionId: edit.connectionId,
          options: optionsFor(libraryId, edit),
          anime: animeFor(libraryId, edit),
        })
        queryClient.setQueryData(
          orpc.admin.fulfilment.mapping.queryKey({ input: { libraryId } }),
          next,
        )
        setEdits((current) => {
          const rest = new Map(current)
          rest.delete(libraryId)
          return rest
        })
      } catch (cause) {
        failures.push(
          tr("connections.libraries.saveFailed", {
            library: library?.name ?? "",
            error: errorMessage(cause),
          }),
        )
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.admin.fulfilment.options.key(),
      }),
      // Where anime lands shows on the library it lands in, too.
      queryClient.invalidateQueries({
        queryKey: orpc.admin.fulfilment.mapping.key(),
      }),
    ])
    if (failures.length > 0) throw new Error(failures.join(" "))
  }

  const list = libraries.data ?? []
  let body
  if (libraries.isPending) {
    body = <Skeleton className="h-32 rounded-xl" />
  } else if (libraries.isError) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {tr("connections.libraries.loadFailed", {
            error: errorMessage(libraries.error),
          })}
        </p>
        <Button variant="outline" onClick={() => void libraries.refetch()}>
          <RefreshCwIcon />
          {tr("connections.retry")}
        </Button>
      </div>
    )
  } else if (list.length === 0) {
    body = <SettingNote>{tr("connections.libraries.none")}</SettingNote>
  } else {
    body = (
      <SettingRows>
        {list.map((library, index) => (
          <LibraryRow
            key={library.id}
            library={library}
            mapping={mappings[index]}
            edit={edits.get(library.id)}
            libraries={list}
            connections={connections ?? []}
            sources={sources ?? []}
            onEdit={(edit) =>
              setEdits((current) => new Map(current).set(library.id, edit))
            }
          />
        ))}
      </SettingRows>
    )
  }

  return (
    <SettingsSubsection id="fill" title={tr("connections.libraries.title")}>
      {body}
      <SettingsSaveBar
        dirty={changed.length > 0}
        onReset={() => setEdits(new Map())}
        onSave={save}
      />
    </SettingsSubsection>
  )
}

function LibraryRow({
  library,
  mapping,
  edit,
  libraries,
  connections,
  sources,
  onEdit,
}: {
  library: Library
  mapping: UseQueryResult<LibraryFulfilment> | undefined
  edit: Edit | undefined
  libraries: Library[]
  connections: FulfilmentConnection[]
  sources: FulfilmentSourceDescription[]
  onEdit: (edit: Edit) => void
}) {
  const id = useId()
  const Icon = libraryIcons[library.kind]
  const kind = titleKind(library)
  const fitting = connections.filter((connection) =>
    sources
      .find((source) => source.id === connection.source)
      ?.kinds.includes(kind),
  )
  const connectionId =
    edit?.connectionId !== undefined
      ? edit.connectionId
      : (mapping?.data?.connectionId ?? null)
  const connection = connections.find((entry) => entry.id === connectionId)
  const choices = [NOTHING, ...fitting.map((entry) => entry.id)]
  // A saved mapping to a connection that no longer fits still shows.
  if (connection && !choices.includes(connection.id))
    choices.push(connection.id)
  const noProvider = library.metadataProvider === null

  const options = useQuery({
    ...orpc.admin.fulfilment.options.queryOptions({
      input: { connectionId: connectionId ?? "", libraryId: library.id },
    }),
    enabled: connectionId !== null && !noProvider,
    retry: false,
  })
  const values = {
    ...textValues(options.data?.values ?? {}),
    ...edit?.options,
  }
  const ready = !!connection && !noProvider && options.isSuccess
  // Where titles saved with these options land, to warn when it isn't here.
  const landing = useQuery({
    ...orpc.admin.fulfilment.landing.queryOptions({
      input: {
        connectionId: connectionId ?? "",
        libraryId: library.id,
        options: values,
      },
    }),
    enabled: ready,
    placeholderData: keepPreviousData,
    retry: false,
  })
  const elsewhere =
    ready && landing.data?.folder && landing.data.library?.id !== library.id
      ? landing.data.folder
      : null
  const anime = animeState(
    mapping?.data,
    connectionId,
    options.data?.anime ?? {},
    edit?.anime,
  )
  /** Libraries whose anime lands here, as saved. */
  const animeFrom = mapping?.data?.animeFrom ?? []
  const receives =
    animeFrom.length > 0 ? (
      <SettingNote>
        {tr("connections.anime.from", {
          libraries: lists().format(animeFrom.map((entry) => entry.name)),
        })}
      </SettingNote>
    ) : null

  const fillItems = choices.map((value) => ({
    value,
    label:
      value === NOTHING
        ? tr("connections.fillFrom.nothing")
        : (connections.find((entry) => entry.id === value)?.name ?? value),
  }))

  let note = null
  let fields = null
  if (noProvider) {
    note = (
      <SettingWarning>{tr("connections.libraries.noProvider")}</SettingWarning>
    )
  } else if (connections.length === 0) {
    note = <SettingNote>{tr("connections.libraries.noConnection")}</SettingNote>
  } else if (fitting.length === 0 && !connection) {
    note = (
      <SettingNote>
        {tr("connections.libraries.nothingFits", {
          kind: tr(`connections.libraries.kind.${library.kind}`),
        })}
      </SettingNote>
    )
  } else if (!connection) {
    note = receives
  } else if (options.isPending) {
    note = (
      <SettingNote>
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3.5" />
          {tr("connections.libraries.loadingChoices", {
            name: connection.name,
          })}
        </span>
      </SettingNote>
    )
  } else if (options.isError) {
    note = (
      <SettingWarning>
        {tr("connections.libraries.choicesFailed", {
          name: connection.name,
          error: errorMessage(options.error),
        })}
      </SettingWarning>
    )
  } else {
    fields = options.data.fields.map((field) => (
      <DescribedInput
        key={field.key}
        field={field}
        value={values[field.key] ?? ""}
        placeholder={tr("connections.libraries.pick")}
        onChange={(next) =>
          onEdit({
            connectionId: connection.id,
            options: { ...edit?.options, [field.key]: next },
            anime: edit?.anime,
          })
        }
      />
    ))
  }

  return (
    <section
      aria-labelledby={`${id}-name`}
      className="@container flex flex-col gap-3 px-4 py-3.5"
    >
      <h4
        id={`${id}-name`}
        className="flex min-w-0 items-center gap-2 text-sm font-medium"
      >
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate">{library.name}</span>
      </h4>
      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${id}-fill`}>
            {tr("connections.fillFrom")}
          </FieldLabel>
          <Select
            items={fillItems}
            value={connectionId ?? NOTHING}
            disabled={noProvider || (connections.length === 0 && !connection)}
            onValueChange={(next) =>
              next &&
              onEdit({
                connectionId: next === NOTHING ? null : next,
                options: {},
              })
            }
          >
            <SelectTrigger id={`${id}-fill`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fillItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {fields}
      </div>
      {elsewhere && connection && (
        <SettingNote>
          <span className="flex items-start gap-1.5">
            <TriangleAlertIcon
              aria-hidden
              className="text-warning mt-0.5 size-3.5 shrink-0"
            />
            <span>
              {tr("connections.libraries.elsewhere", {
                folder: elsewhere,
                library: library.name,
                connection: connection.name,
              })}
            </span>
          </span>
        </SettingNote>
      )}
      {/* A source with no choices has nothing to send anime with. */}
      {ready && connection && options.data.fields.length > 0 && (
        <AnimeOptions
          library={library}
          libraries={libraries}
          connection={connection}
          fields={options.data.fields}
          defaults={options.data.anime}
          state={anime}
          onEdit={(next) =>
            onEdit({
              connectionId: connection.id,
              options: edit?.options ?? {},
              anime: next,
            })
          }
        />
      )}
      {connection && receives}
      {note}
    </section>
  )
}
