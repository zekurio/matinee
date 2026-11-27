import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentLanding,
  FulfilmentRule,
  FulfilmentRuleChoices,
  FulfilmentSourceDescription,
  Library,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import {
  ArrowDown,
  ArrowUp,
  Cable,
  CircleCheck,
  Ellipsis,
  OctagonX,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide"
import { createSignal, For, Match, Show, Switch } from "solid-js"

import { libraryIcons } from "@/components/app-shell"
import { perLocale, tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Badge } from "@/kit/badge"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  CONNECTION_TEST,
  ConnectionDialog,
  KeyVariable,
} from "./connection-dialog"
import { shownValue } from "./connection-fields"
import { fetching } from "./query-state"
import { RuleDialog } from "./rule-dialog"
import {
  RowIcon,
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"
import { ConfirmDialog } from "./user-dialogs"

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

const rowMenuButton = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "text-muted-foreground hover:text-foreground data-open:text-foreground",
)

/**
 * Settings → Requests: the connections approved requests go through,
 * each with what it sends and where that lands, and its override rules;
 * then, for each library, which connection fills it.
 */
export function RequestsPanel() {
  const sources = useQuery(() => orpc.admin.fulfilment.sources.queryOptions())
  const connections = useQuery(() =>
    orpc.admin.fulfilment.connections.queryOptions(),
  )
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const sourceList = () => (sources.isSuccess ? sources.data : undefined)
  const connectionList = () =>
    connections.isSuccess ? connections.data : undefined
  // Kept after the dialog closes, so its words stay put as it fades.
  const [editing, setEditing] = createSignal<{
    connection?: FulfilmentConnection
  }>({})
  const [editOpen, setEditOpen] = createSignal(false)
  const edit = (connection?: FulfilmentConnection) => {
    setEditing({ connection })
    setEditOpen(true)
  }

  // Outline beside the section's title, filled as an empty list's one action.
  const addButton = (variant: "default" | "outline") => (
    <Button variant={variant} onClick={() => edit()} disabled={!sourceList()}>
      <Icon icon={Plus} />
      {tr("connections.add")}
    </Button>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="connections"
        title={tr("connections.title")}
        action={connectionList()?.length ? addButton("outline") : undefined}
      >
        <Switch>
          <Match when={connections.isPending || sources.isPending}>
            <Skeleton class="h-32 rounded-xl" />
          </Match>
          <Match when={connections.isError || sources.isError}>
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <p class="text-muted-foreground text-sm">
                {tr("connections.loadFailed", {
                  error: errorMessage(connections.error ?? sources.error),
                })}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  void connections.refetch()
                  void sources.refetch()
                }}
              >
                <Icon icon={RefreshCw} />
                {tr("connections.retry")}
              </Button>
            </div>
          </Match>
          <Match when={connectionList()?.length === 0}>
            <Empty class="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{tr("connections.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {tr("connections.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{addButton("default")}</EmptyContent>
            </Empty>
          </Match>
          <Match when={true}>
            <div class="flex flex-col gap-3">
              <For
                each={connectionList() ?? []}
                keyed={(connection) => connection.id}
              >
                {(connection) => (
                  <ConnectionCard
                    connection={connection()}
                    source={sourceList()?.find(
                      (s) => s.id === connection().source,
                    )}
                    onEdit={() => edit(connection())}
                  />
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </SettingsSubsection>

      <LibraryCoverage
        libraries={libraries.isSuccess ? libraries.data : undefined}
        connections={connectionList()}
      />

      <Show when={sourceList()}>
        {(list) => (
          <ConnectionDialog
            connection={editing().connection}
            sources={list()}
            connections={connectionList() ?? []}
            open={editOpen()}
            onOpenChange={setEditOpen}
          />
        )}
      </Show>
    </SettingsSections>
  )
}

/** The choices a saved connection offers, for naming what it sends. */
function useConnectionChoices(connection: () => FulfilmentConnection) {
  return useQuery(() => ({
    ...orpc.admin.fulfilment.options.queryOptions({
      input: {
        id: connection().id,
        source: connection().source,
        slug: connection().slug,
        settings: connection().settings,
      },
    }),
    retry: false,
    staleTime: 60_000,
  }))
}

/**
 * A saved connection, tested each time the panel opens and again after
 * each edit, so one that stopped answering shows it here.
 */
function ConnectionCard(props: {
  connection: FulfilmentConnection
  source: FulfilmentSourceDescription | undefined
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = createSignal(false)
  // The callbacks run outside tracking, so the options read the connection.
  const test = useQuery(() => {
    const id = props.connection.id
    return {
      // A new key for each version of the connection, so an edit tests again.
      queryKey: [CONNECTION_TEST, id, JSON.stringify(props.connection)],
      queryFn: () => client.admin.fulfilment.test({ id }).then(() => true),
      retry: false,
      staleTime: 60_000,
    }
  })
  const choices = useConnectionChoices(() => props.connection)
  const choiceData = () => (choices.isSuccess ? choices.data : undefined)
  const remove = useMutation(() => {
    const { id, name } = props.connection
    return {
      mutationFn: () => client.admin.fulfilment.remove({ id }),
      onSuccess: async () => {
        setConfirming(false)
        toast.success(tr("connections.deleted", { name }))
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.fulfilment.connections.key(),
        })
      },
      onError: (error: Error) => toast.error(errorMessage(error)),
    }
  })

  const sourceName = () =>
    props.source
      ? translateKnown(props.source.name)
      : tr("connections.card.unknownSource")
  const quality = (key: string) => {
    const field = choiceData()?.fields.find((each) => each.key === key)
    return field
      ? (shownValue(field, props.connection.options, key)[0] ?? null)
      : null
  }
  const lines = () =>
    props.connection.landings
      .filter((landing) => landing.from !== "rule")
      .map((landing) => ({
        landing,
        quality: quality(
          landing.from === "anime"
            ? "animeQualityProfileId"
            : "qualityProfileId",
        ),
      }))

  return (
    <article class="bg-foreground/[0.02] rounded-xl border">
      <div class="flex items-start gap-3 py-3 pr-2 pl-4">
        <RowIcon>
          <Icon icon={Cable} />
        </RowIcon>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
            <span class="truncate font-medium">{props.connection.name}</span>
            <span class="text-muted-foreground text-13px shrink-0">
              {sourceName()}
            </span>
            <For each={props.connection.defaultFor}>
              {(kind) => (
                <Badge variant="secondary">
                  {tr(`connections.card.default.${kind}`)}
                </Badge>
              )}
            </For>
          </span>
          <span
            role="status"
            class={cn(
              "flex min-w-0 items-start gap-1.5 text-13px leading-5",
              test.isError ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Switch>
              <Match when={fetching(test)}>
                <Spinner class="mt-0.5 size-3.5 shrink-0" />
                {tr("connections.testing")}
              </Match>
              <Match when={test.isError}>
                <Icon
                  icon={OctagonX}
                  class="text-danger mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  {tr("connections.testFailed.detail", {
                    error: errorMessage(test.error),
                  })}
                </span>
              </Match>
              <Match when={test.isSuccess}>
                <Icon
                  icon={CircleCheck}
                  class="text-success mt-0.5 size-3.5 shrink-0"
                />
                {tr("connections.connected")}
              </Match>
            </Switch>
          </span>
          <Show when={lines().length > 0}>
            <span class="text-13px grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 leading-5">
              <For
                each={lines()}
                keyed={(line) => `${line.landing.kind}-${line.landing.folder}`}
              >
                {(line) => (
                  <LandingLine
                    landing={line().landing}
                    quality={line().quality}
                    byKind={(props.source?.kinds.length ?? 1) > 1}
                  />
                )}
              </For>
            </span>
          </Show>
          <Show when={!props.connection.editable}>
            <span class="text-muted-foreground text-xs leading-5">
              {tr("connections.card.readOnly")}
            </span>
          </Show>
          <Show
            when={
              props.source?.apiKey && props.connection.apiKey.source === null
            }
          >
            <span class="text-warning text-xs leading-5">
              {trRich("connections.key.none", {
                variable: <KeyVariable slug={props.connection.slug} />,
              })}
            </span>
          </Show>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            class={rowMenuButton}
            aria-label={tr("connections.actions", {
              name: props.connection.name,
            })}
          >
            <Icon icon={Ellipsis} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} class="min-w-48">
            <DropdownMenuItem
              disabled={fetching(test)}
              onSelect={() => void test.refetch()}
            >
              <Icon icon={RefreshCw} />
              {tr("connections.test")}
            </DropdownMenuItem>
            <Show when={props.connection.editable}>
              <DropdownMenuItem onSelect={() => props.onEdit()}>
                <Icon icon={Pencil} />
                {tr("connections.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirming(true)}
              >
                <Icon icon={Trash2} />
                {tr("connections.delete")}
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Show when={props.source?.rules && props.source}>
        {(source) => (
          <ConnectionRules
            connection={props.connection}
            source={source()}
            fields={choiceData()?.rule}
          />
        )}
      </Show>

      <ConfirmDialog
        open={confirming()}
        title={tr("connections.delete.title", { name: props.connection.name })}
        description={
          props.connection.defaultFor.length > 0
            ? tr("connections.delete.descriptionDefault")
            : tr("connections.delete.descriptionUnused")
        }
        confirmLabel={tr("connections.delete.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => void remove.mutate()}
        onClose={() => setConfirming(false)}
      />
    </article>
  )
}

/**
 * Where one of a connection's setups lands: named as the form's section,
 * or by kind for a source that takes both, then the library, its folder,
 * and the quality.
 */
function LandingLine(props: {
  landing: FulfilmentLanding
  quality: string | null
  /** The connection takes films and shows, so each line names its kind. */
  byKind: boolean
}) {
  return (
    <>
      <span class="text-muted-foreground">
        {props.byKind && props.landing.from === "default"
          ? tr(`connections.card.kind.${props.landing.kind}`)
          : props.landing.from === "anime"
            ? tr("connections.section.anime")
            : tr("connections.section.defaults")}
      </span>
      <Destination
        library={props.landing.library?.name ?? null}
        hidden={props.landing.hidden}
        rest={[props.landing.folder, props.quality]}
      />
    </>
  )
}

/** A library in bold, then what else says how a title gets there. */
function Destination(props: {
  /** Null when the folder is in no library, or in one the account can't see. */
  library: string | null
  /** The folder is in a library the account can't see. */
  hidden: boolean
  rest: (JSX.Element | null)[]
}) {
  const shown = () => props.rest.filter((part) => part !== null && part !== "")
  return (
    <span class="min-w-0 break-words">
      <Switch
        fallback={
          <span class="text-warning">{tr("connections.card.nowhere")}</span>
        }
      >
        <Match when={props.library}>
          {(library) => <span class="font-medium">{library()}</span>}
        </Match>
        <Match when={props.hidden}>
          <span class="text-muted-foreground font-medium">
            {tr("connections.card.hidden")}
          </span>
        </Match>
      </Switch>
      <For each={shown()}>
        {(part) => (
          <span class="text-muted-foreground">
            {" · "}
            {part}
          </span>
        )}
      </For>
    </span>
  )
}

/** A connection's override rules, in the order they win a tie. */
function ConnectionRules(props: {
  connection: FulfilmentConnection
  source: FulfilmentSourceDescription
  /** The settings a rule can change. Unset until the server answers. */
  fields: DescribedField[] | undefined
}) {
  const queryClient = useQueryClient()
  const kind = () => props.source.kinds[0] ?? "movie"
  const rules = useQuery(() =>
    orpc.admin.fulfilment.rules.queryOptions({
      input: { connectionId: props.connection.id },
    }),
  )
  const choices = useQuery(() =>
    orpc.admin.fulfilment.ruleChoices.queryOptions({ input: { kind: kind() } }),
  )
  const choiceData = () => (choices.isSuccess ? choices.data : undefined)
  const [editing, setEditing] = createSignal<{ rule?: FulfilmentRule }>({})
  const [open, setOpen] = createSignal(false)
  const [removing, setRemoving] = createSignal<FulfilmentRule | null>(null)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.fulfilment.key() })
  const reorder = useMutation(() => {
    const connectionId = props.connection.id
    return {
      mutationFn: (ids: string[]) =>
        client.admin.fulfilment.reorderRules({ connectionId, ids }),
      onSuccess: refresh,
      onError: (error: Error) => toast.error(errorMessage(error)),
    }
  })
  const remove = useMutation(() => ({
    mutationFn: (id: string) => client.admin.fulfilment.removeRule({ id }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const list = () => (rules.isSuccess ? rules.data : [])
  const move = (index: number, by: number) => {
    const ids = list().map((rule) => rule.id)
    const [moved] = ids.splice(index, 1)
    if (!moved) return
    ids.splice(index + by, 0, moved)
    void reorder.mutate(ids)
  }

  return (
    <div class="flex flex-col gap-2 border-t px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <h5 class="text-13px font-medium">{tr("connections.rules.title")}</h5>
        <Show when={props.connection.editable}>
          <Button
            variant="ghost"
            size="sm"
            disabled={!props.fields}
            onClick={() => {
              setEditing({})
              setOpen(true)
            }}
          >
            <Icon icon={Plus} />
            {tr("connections.rules.add")}
          </Button>
        </Show>
      </div>
      <Show when={list().length > 0}>
        <ol class="flex flex-col divide-y rounded-lg border">
          <For each={list()} keyed={(rule) => rule.id}>
            {(rule, index) => (
              <li class="flex items-start gap-2 py-2 pr-1.5 pl-3">
                <span class="text-muted-foreground text-13px w-4 shrink-0 pt-px">
                  {index() + 1}
                </span>
                <RuleSummary
                  rule={rule()}
                  fields={props.fields}
                  choices={choiceData()}
                  landings={props.connection.landings}
                />
                <Show when={props.connection.editable}>
                  <div class="flex shrink-0 items-center self-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("connections.rules.up")}
                      disabled={index() === 0 || reorder.isPending}
                      onClick={() => move(index(), -1)}
                    >
                      <Icon icon={ArrowUp} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("connections.rules.down")}
                      disabled={
                        index() === list().length - 1 || reorder.isPending
                      }
                      onClick={() => move(index(), 1)}
                    >
                      <Icon icon={ArrowDown} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("connections.rules.edit")}
                      disabled={!props.fields}
                      onClick={() => {
                        setEditing({ rule: rule() })
                        setOpen(true)
                      }}
                    >
                      <Icon icon={Pencil} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("connections.rules.delete")}
                      class="text-destructive hover:text-destructive"
                      onClick={() => setRemoving(rule())}
                    >
                      <Icon icon={Trash2} />
                    </Button>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={props.connection.editable && props.fields}>
        {(fields) => (
          <RuleDialog
            connection={props.connection}
            kind={kind()}
            fields={fields()}
            choices={choiceData()}
            rule={editing().rule}
            open={open()}
            onOpenChange={setOpen}
          />
        )}
      </Show>
      <ConfirmDialog
        open={removing() !== null}
        title={tr("connections.rules.delete.title")}
        description={tr("connections.rules.delete.description")}
        confirmLabel={tr("connections.rules.delete.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          const rule = removing()
          if (rule) void remove.mutate(rule.id)
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

/** A rule's conditions, then what it changes, each by name. */
function RuleSummary(props: {
  rule: FulfilmentRule
  fields: DescribedField[] | undefined
  choices: FulfilmentRuleChoices | undefined
  landings: FulfilmentLanding[]
}) {
  // Until both answer, names and setting labels would show as ids and keys.
  return (
    <Show
      when={props.fields !== undefined && props.choices !== undefined}
      fallback={
        <p class="text-13px text-muted-foreground min-w-0 flex-1 leading-5">
          {tr("connections.rules.summaryPending")}
        </p>
      }
    >
      <RuleParts
        rule={props.rule}
        fields={props.fields ?? []}
        choices={props.choices}
        landings={props.landings}
      />
    </Show>
  )
}

function RuleParts(props: {
  rule: FulfilmentRule
  fields: DescribedField[]
  choices: FulfilmentRuleChoices | undefined
  landings: FulfilmentLanding[]
}) {
  const named = <T,>(
    ids: T[],
    list: { id: T; name: string }[] | undefined,
  ): string =>
    lists().format(
      ids.map(
        (id) =>
          list?.find((entry) => entry.id === id)?.name ??
          tr("connections.rules.unknownChoice"),
      ),
    )
  const conditions = () => {
    const rule = props.rule
    const choices = props.choices
    return [
      rule.users.length > 0 && {
        label: tr("connections.rules.users"),
        value: named(rule.users, choices?.users),
      },
      rule.genres.length > 0 && {
        label: tr("connections.rules.genres"),
        value: named(rule.genres, choices?.genres),
      },
      rule.languages.length > 0 && {
        label: tr("connections.rules.languages"),
        value: named(rule.languages, choices?.languages),
      },
      rule.keywords.length > 0 && {
        label: tr("connections.rules.keywords"),
        value: lists().format(rule.keywords.map((keyword) => keyword.name)),
      },
    ].filter((entry) => entry !== false)
  }
  // In the order the form lists them, and only the ones it knows.
  const known = () =>
    props.fields.filter((each) => Object.hasOwn(props.rule.settings, each.key))
  // A folder and a quality read as what they are; anything else by name.
  const folder = () => {
    const folderField = known().find((each) => each.folder)
    if (!folderField?.folder) return null
    const landing = props.landings.find(
      (each) =>
        each.folder ===
          shownValue(undefined, props.rule.settings, folderField.key)[0] &&
        each.kind === folderField.folder,
    )
    return {
      library: landing?.library?.name ?? null,
      hidden: landing?.hidden ?? false,
    }
  }
  const settings = () =>
    known().map((field): JSX.Element => {
      const shown = lists().format(
        shownValue(field, props.rule.settings, field.key),
      )
      if (field.folder || field.key === "qualityProfileId") return shown
      return (
        <>
          {translateKnown(field.label)}{" "}
          <span class="text-foreground">{shown}</span>
        </>
      )
    })
  return (
    <div class="text-13px flex min-w-0 flex-1 flex-col gap-0.5 leading-5">
      <p class="min-w-0 break-words">
        <For each={conditions()} keyed={(entry) => entry.label}>
          {(entry, index) => (
            <span>
              <Show when={index() > 0}>
                <span class="text-muted-foreground"> · </span>
              </Show>
              <span class="text-muted-foreground">{entry().label} </span>
              {entry().value}
            </span>
          )}
        </For>
      </p>
      <Show
        when={folder()}
        fallback={
          <p class="text-muted-foreground min-w-0 break-words">
            <For each={settings()}>
              {(part, index) => (
                <span>
                  <Show when={index() > 0}>{" · "}</Show>
                  {part}
                </span>
              )}
            </For>
          </p>
        }
      >
        {(place) => (
          <Destination
            library={place().library}
            hidden={place().hidden}
            rest={settings()}
          />
        )}
      </Show>
    </div>
  )
}

/** For each library, the connections whose settings or rules land in it. */
function LibraryCoverage(props: {
  libraries: Library[] | undefined
  connections: FulfilmentConnection[] | undefined
}) {
  return (
    <Show when={(props.libraries?.length ?? 0) > 0 && props.connections}>
      {(connections) => (
        <SettingsSubsection id="fill" title={tr("connections.libraries.title")}>
          <SettingRows>
            <For each={props.libraries ?? []}>
              {(library) => {
                const filling = () =>
                  connections()
                    .filter((connection) =>
                      connection.landings.some(
                        (landing) => landing.library?.id === library.id,
                      ),
                    )
                    .map((connection) => connection.name)
                return (
                  <div class="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm">
                    <Icon
                      icon={libraryIcons[library.kind]}
                      class="text-muted-foreground size-4 shrink-0"
                    />
                    <span class="min-w-0 truncate font-medium">
                      {library.name}
                    </span>
                    <span class="text-muted-foreground text-13px ml-auto min-w-0 truncate">
                      {library.metadataProvider === null
                        ? tr("connections.libraries.noProvider")
                        : filling().length
                          ? tr("connections.libraries.filledBy", {
                              connections: lists().format(filling()),
                            })
                          : tr("connections.libraries.unfilled")}
                    </span>
                  </div>
                )
              }}
            </For>
          </SettingRows>
        </SettingsSubsection>
      )}
    </Show>
  )
}
