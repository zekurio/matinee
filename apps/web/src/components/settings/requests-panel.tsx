import type {
  FulfilmentConnection,
  FulfilmentSourceDescription,
} from "@matinee/contracts"
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
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
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

import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/react"
import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  CONNECTION_TEST,
  ConnectionDialog,
  KeyVariable,
} from "./connection-dialog"
import { LibraryFill } from "./library-fill"
import { RowIcon, SettingsSections, SettingsSubsection } from "./settings-panel"
import { ConfirmDialog } from "./user-dialogs"

/**
 * Settings → Requests: the connections approved requests go through, and
 * which of them fills each library. Both are here, side by side, since a
 * mapping needs a connection to exist and reads best next to the list of
 * them.
 */
export function RequestsPanel() {
  const sources = useQuery(orpc.admin.fulfilment.sources.queryOptions())
  const connections = useQuery(orpc.admin.fulfilment.connections.queryOptions())
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const mappings = useQueries({
    queries: (libraries.data ?? []).map((library) =>
      orpc.admin.fulfilment.mapping.queryOptions({
        input: { libraryId: library.id },
      }),
    ),
  })
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
          <Skeleton className="h-20 rounded-xl" />
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
          <List>
            {connections.data.map((connection) => (
              <ConnectionRow
                key={connection.id}
                connection={connection}
                source={sources.data.find((s) => s.id === connection.source)}
                filled={
                  mappings.filter(
                    (mapping) => mapping.data?.connectionId === connection.id,
                  ).length
                }
                onEdit={() => edit(connection)}
              />
            ))}
          </List>
        )}
      </SettingsSubsection>

      <LibraryFill
        libraries={libraries}
        mappings={mappings}
        connections={connections.data}
        sources={sources.data}
      />

      {sources.data && (
        <ConnectionDialog
          connection={editing.connection}
          sources={sources.data}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </SettingsSections>
  )
}

/**
 * A saved connection, tested each time the panel opens and again after
 * each edit, so one that stopped answering shows it here.
 */
function ConnectionRow({
  connection,
  source,
  filled,
  onEdit,
}: {
  connection: FulfilmentConnection
  source: FulfilmentSourceDescription | undefined
  /** How many libraries it fills. */
  filled: number
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
  const remove = useMutation({
    mutationFn: () => client.admin.fulfilment.remove({ id: connection.id }),
    onSuccess: async () => {
      setConfirming(false)
      toast.success(tr("connections.deleted", { name: connection.name }))
      // Not the whole of fulfilment: the choices this connection offered
      // a library would be asked for again and answer 404. Once the
      // mappings reload, nothing asks for them.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.admin.fulfilment.connections.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.admin.fulfilment.mapping.key(),
        }),
      ])
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const variable = <KeyVariable slug={connection.slug} />
  const sourceName = source ? translateKnown(source.name) : connection.source

  return (
    <ListItem className="items-start gap-3 py-3 pr-2">
      <RowIcon>
        <CableIcon />
      </RowIcon>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h4 className="flex min-w-0 items-baseline gap-2 text-sm leading-5">
          <span className="truncate font-medium">{connection.name}</span>
          <span className="text-muted-foreground shrink-0 text-[13px]">
            {sourceName}
          </span>
        </h4>
        <p
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
        </p>
        <p className="text-muted-foreground flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-5">
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
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
              aria-label={tr("connections.actions", { name: connection.name })}
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

      <ConfirmDialog
        open={confirming}
        title={tr("connections.delete.title", { name: connection.name })}
        description={
          filled > 0
            ? tr("connections.delete.description", { count: filled })
            : tr("connections.delete.descriptionUnused")
        }
        confirmLabel={tr("connections.delete.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirming(false)}
      />
    </ListItem>
  )
}
