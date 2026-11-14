import type {
  DescribedField,
  FulfilmentConnection,
  FulfilmentLanding,
  FulfilmentRule,
  FulfilmentRuleChoices,
  FulfilmentSourceDescription,
  Library,
} from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CableIcon,
  CircleCheckIcon,
  EllipsisIcon,
  OctagonXIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { libraryIcons } from "@/components/app-shell"
import { perLocale, tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/react"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  CONNECTION_TEST,
  ConnectionDialog,
  KeyVariable,
} from "./connection-dialog"
import { shownValue } from "./connection-fields"
import { RuleDialog } from "./rule-dialog"
import {
  SettingRows,
  SettingsSections,
  SettingsSubsection,
  RowIcon,
} from "./settings-panel"
import { ConfirmDialog } from "./user-dialogs"

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/**
 * Settings → Requests: the connections approved requests go through,
 * each with what it sends and where that lands, and its override rules;
 * then, for each library, which connection fills it.
 */
export function RequestsPanel() {
  const sources = useQuery(orpc.admin.fulfilment.sources.queryOptions())
  const connections = useQuery(orpc.admin.fulfilment.connections.queryOptions())
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  // Kept after the dialog closes, so its words stay put as it fades.
  const [editing, setEditing] = useState<{
    connection?: FulfilmentConnection
  }>({})
  const [editOpen, setEditOpen] = useState(false)
  const edit = (connection?: FulfilmentConnection) => {
    setEditing({ connection })
    setEditOpen(true)
  }

  const addButton = (
    <Button onClick={() => edit()} disabled={!sources.data}>
      <PlusIcon />
      {tr("connections.add")}
    </Button>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="connections"
        title={tr("connections.title")}
        action={connections.data?.length ? addButton : undefined}
      >
        {connections.isPending || sources.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : connections.isError || sources.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
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
              <RefreshCwIcon />
              {tr("connections.retry")}
            </Button>
          </div>
        ) : connections.data.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{tr("connections.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {tr("connections.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {connections.data.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                source={sources.data.find((s) => s.id === connection.source)}
                onEdit={() => edit(connection)}
              />
            ))}
          </div>
        )}
      </SettingsSubsection>

      <LibraryCoverage libraries={libraries} connections={connections.data} />

      {sources.data && (
        <ConnectionDialog
          connection={editing.connection}
          sources={sources.data}
          connections={connections.data ?? []}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </SettingsSections>
  )
}

/** The choices a saved connection offers, for naming what it sends. */
function useConnectionChoices(connection: FulfilmentConnection) {
  return useQuery({
    ...orpc.admin.fulfilment.options.queryOptions({
      input: {
        id: connection.id,
        source: connection.source,
        slug: connection.slug,
        settings: connection.settings,
      },
    }),
    retry: false,
    staleTime: 60_000,
  })
}

/**
 * A saved connection, tested each time the panel opens and again after
 * each edit, so one that stopped answering shows it here.
 */
function ConnectionCard({
  connection,
  source,
  onEdit,
}: {
  connection: FulfilmentConnection
  source: FulfilmentSourceDescription | undefined
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const test = useQuery({
    // A new key for each version of the connection, so an edit tests again.
    queryKey: [CONNECTION_TEST, connection.id, JSON.stringify(connection)],
    queryFn: () =>
      client.admin.fulfilment.test({ id: connection.id }).then(() => true),
    retry: false,
    staleTime: 60_000,
  })
  const choices = useConnectionChoices(connection)
  const remove = useMutation({
    mutationFn: () => client.admin.fulfilment.remove({ id: connection.id }),
    onSuccess: async () => {
      setConfirming(false)
      toast.success(tr("connections.deleted", { name: connection.name }))
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.fulfilment.connections.key(),
      })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const variable = <KeyVariable slug={connection.slug} />
  const sourceName = source ? translateKnown(source.name) : connection.source
  const quality = (key: string) => {
    const field = choices.data?.fields.find((each) => each.key === key)
    return field
      ? (shownValue(field, connection.options, key)[0] ?? null)
      : null
  }
  const lines = connection.landings
    .filter((landing) => landing.from !== "rule")
    .map((landing) => ({
      landing,
      quality: quality(
        landing.from === "anime" ? "animeQualityProfileId" : "qualityProfileId",
      ),
    }))

  return (
    <article className="bg-foreground/[0.02] rounded-xl border">
      <div className="flex items-start gap-3 py-3 pr-2 pl-4">
        <RowIcon>
          <CableIcon />
        </RowIcon>
        <button
          type="button"
          onClick={onEdit}
          className="focus-visible:ring-ring/50 -my-1 flex min-w-0 flex-1 flex-col gap-1 rounded-md py-1 text-left outline-none focus-visible:ring-3"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
            <span className="truncate font-medium">{connection.name}</span>
            <span className="text-muted-foreground shrink-0 text-[13px]">
              {sourceName}
            </span>
            {connection.defaultFor.map((kind) => (
              <Badge key={kind} variant="secondary">
                {tr(`connections.card.default.${kind}`)}
              </Badge>
            ))}
          </span>
          <span
            role="status"
            className={cn(
              "flex min-w-0 items-start gap-1.5 text-[13px] leading-5",
              test.isError ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {test.isFetching ? (
              <>
                <Spinner className="mt-0.5 size-3.5 shrink-0" />
                {tr("connections.testing")}
              </>
            ) : test.isError ? (
              <>
                <OctagonXIcon
                  aria-hidden
                  className="text-danger mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  {tr("connections.testFailed")}
                  {". "}
                  {errorMessage(test.error)}
                </span>
              </>
            ) : test.isSuccess ? (
              <>
                <CircleCheckIcon
                  aria-hidden
                  className="text-success mt-0.5 size-3.5 shrink-0"
                />
                {tr("connections.connected")}
              </>
            ) : null}
          </span>
          {lines.length > 0 && (
            <span className="flex flex-col gap-0.5 text-[13px] leading-5">
              {lines.map(({ landing, quality }) => (
                <LandingLine
                  key={`${landing.kind}-${landing.folder}`}
                  landing={landing}
                  quality={quality}
                />
              ))}
            </span>
          )}
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-5">
            <span>
              <span className="sr-only">{tr("connections.slug")} </span>
              <code className="bg-foreground/[0.06] text-foreground/80 rounded px-1 py-px font-mono text-[11px]">
                {connection.slug}
              </code>
            </span>
            {source?.apiKey && (
              <span
                className={cn(
                  "min-w-0",
                  connection.apiKey.source === null && "text-warning",
                )}
              >
                {connection.apiKey.source === "saved"
                  ? trRich("connections.key.saved", { variable })
                  : connection.apiKey.source === "environment"
                    ? trRich("connections.key.environment", { variable })
                    : trRich("connections.key.none", { variable })}
              </span>
            )}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
                aria-label={tr("connections.actions", {
                  name: connection.name,
                })}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
            <DropdownMenuItem
              disabled={test.isFetching}
              onClick={() => void test.refetch()}
            >
              <RefreshCwIcon />
              {tr("connections.test")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              {tr("connections.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon />
              {tr("connections.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {source?.rules && (
        <ConnectionRules
          connection={connection}
          source={source}
          fields={choices.data?.rule}
        />
      )}

      <ConfirmDialog
        open={confirming}
        title={tr("connections.delete.title", { name: connection.name })}
        description={
          connection.defaultFor.length > 0
            ? tr("connections.delete.descriptionDefault")
            : tr("connections.delete.descriptionUnused")
        }
        confirmLabel={tr("connections.delete.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirming(false)}
      />
    </article>
  )
}

/** One folder a connection sends to, what with, and where it lands. */
function LandingLine({
  landing,
  quality,
}: {
  landing: FulfilmentLanding
  quality: string | null
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="text-muted-foreground w-16 shrink-0">
        {tr(`connections.card.from.${landing.from}`)}
      </span>
      <span className="min-w-0 break-words">
        {[quality, landing.folder].filter(Boolean).join(" · ")}
        {" → "}
        {landing.library ? (
          <span className="font-medium">{landing.library.name}</span>
        ) : (
          <span className="text-warning">{tr("connections.card.nowhere")}</span>
        )}
      </span>
    </span>
  )
}

/** A connection's override rules, in the order they win a tie. */
function ConnectionRules({
  connection,
  source,
  fields,
}: {
  connection: FulfilmentConnection
  source: FulfilmentSourceDescription
  /** The settings a rule can change. Unset until the server answers. */
  fields: DescribedField[] | undefined
}) {
  const queryClient = useQueryClient()
  const kind = source.kinds[0] ?? "movie"
  const rules = useQuery(
    orpc.admin.fulfilment.rules.queryOptions({
      input: { connectionId: connection.id },
    }),
  )
  const choices = useQuery(
    orpc.admin.fulfilment.ruleChoices.queryOptions({ input: { kind } }),
  )
  const [editing, setEditing] = useState<{ rule?: FulfilmentRule }>({})
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<FulfilmentRule | null>(null)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.fulfilment.key() })
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      client.admin.fulfilment.reorderRules({
        connectionId: connection.id,
        ids,
      }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => client.admin.fulfilment.removeRule({ id }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const list = rules.data ?? []
  const move = (index: number, by: number) => {
    const ids = list.map((rule) => rule.id)
    const [moved] = ids.splice(index, 1)
    if (!moved) return
    ids.splice(index + by, 0, moved)
    reorder.mutate(ids)
  }

  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-[13px] font-medium">
          {tr("connections.rules.title")}
        </h5>
        <Button
          variant="ghost"
          size="sm"
          disabled={!fields}
          onClick={() => {
            setEditing({})
            setOpen(true)
          }}
        >
          <PlusIcon />
          {tr("connections.rules.add")}
        </Button>
      </div>
      {list.length > 0 && (
        <ol className="flex flex-col divide-y rounded-lg border">
          {list.map((rule, index) => (
            <li
              key={rule.id}
              className="flex items-start gap-2 py-2 pr-1.5 pl-3"
            >
              <span className="text-muted-foreground w-4 shrink-0 pt-px text-[13px] tabular-nums">
                {index + 1}
              </span>
              <RuleSummary
                rule={rule}
                fields={fields}
                choices={choices.data}
                landings={connection.landings}
              />
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tr("connections.rules.up")}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tr("connections.rules.down")}
                  disabled={index === list.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tr("connections.rules.edit")}
                  disabled={!fields}
                  onClick={() => {
                    setEditing({ rule })
                    setOpen(true)
                  }}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tr("connections.rules.delete")}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRemoving(rule)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {fields && (
        <RuleDialog
          connection={connection}
          kind={kind}
          fields={fields}
          choices={choices.data}
          rule={editing.rule}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={tr("connections.rules.delete.title")}
        description={tr("connections.rules.delete.description")}
        confirmLabel={tr("connections.rules.delete.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

/** A rule's conditions, then what it changes, each by name. */
function RuleSummary({
  rule,
  fields,
  choices,
  landings,
}: {
  rule: FulfilmentRule
  fields: DescribedField[] | undefined
  choices: FulfilmentRuleChoices | undefined
  landings: FulfilmentLanding[]
}) {
  const named = <T,>(
    ids: T[],
    list: { id: T; name: string }[] | undefined,
  ): string =>
    lists().format(
      ids.map(
        (id) => list?.find((entry) => entry.id === id)?.name ?? String(id),
      ),
    )
  const conditions = [
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
  const settings = Object.keys(rule.settings).map((key) => {
    const field = fields?.find((each) => each.key === key)
    const shown = lists().format(shownValue(field, rule.settings, key))
    const lands = field?.folder
      ? landings.find(
          (landing) =>
            landing.folder === shownValue(undefined, rule.settings, key)[0] &&
            landing.kind === field.folder,
        )?.library
      : undefined
    return {
      label: field ? translateKnown(field.label) : key,
      value: lands ? `${shown} → ${lands.name}` : shown,
    }
  })
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px] leading-5">
      <p className="min-w-0 break-words">
        {conditions.map((entry, index) => (
          <span key={entry.label}>
            {index > 0 && <span className="text-muted-foreground"> · </span>}
            <span className="text-muted-foreground">{entry.label} </span>
            {entry.value}
          </span>
        ))}
      </p>
      <p className="text-muted-foreground min-w-0 break-words">
        {settings.map((entry, index) => (
          <span key={entry.label}>
            {index > 0 && " · "}
            {entry.label} <span className="text-foreground">{entry.value}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

/** For each library, the connections whose settings or rules land in it. */
function LibraryCoverage({
  libraries,
  connections,
}: {
  libraries: UseQueryResult<Library[]>
  connections: FulfilmentConnection[] | undefined
}) {
  const list = libraries.data ?? []
  if (!list.length || !connections) return null
  return (
    <SettingsSubsection id="fill" title={tr("connections.libraries.title")}>
      <SettingRows>
        {list.map((library) => {
          const Icon = libraryIcons[library.kind]
          const filling = connections
            .filter((connection) =>
              connection.landings.some(
                (landing) => landing.library?.id === library.id,
              ),
            )
            .map((connection) => connection.name)
          return (
            <div
              key={library.id}
              className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm"
            >
              <Icon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
              <span className="min-w-0 truncate font-medium">
                {library.name}
              </span>
              <span className="text-muted-foreground ml-auto min-w-0 truncate text-[13px]">
                {library.metadataProvider === null
                  ? tr("connections.libraries.noProvider")
                  : filling.length
                    ? tr("connections.libraries.filledBy", {
                        connections: lists().format(filling),
                      })
                    : tr("connections.libraries.unfilled")}
              </span>
            </div>
          )
        })}
      </SettingRows>
    </SettingsSubsection>
  )
}
