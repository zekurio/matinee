import type { Library } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CloudDownloadIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { libraryIcons } from "@/components/app-shell"
import { LibraryDialog } from "@/components/library-dialog"
import { tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { RowIcon, SettingsSections, SettingsSubsection } from "./settings-panel"

export function LibrariesPanel() {
  const [dialog, setDialog] = useState<{ library?: Library } | null>(null)
  const libraries = useQuery(
    orpc.libraries.list.queryOptions({
      refetchInterval: (q) =>
        q.state.data?.some((library) => library.scanning || library.refreshing)
          ? 2000
          : false,
    }),
  )
  const addButton = (
    <Button onClick={() => setDialog({})}>
      <PlusIcon />
      {tr("libraries.add")}
    </Button>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="libraries"
        title={tr("libraries.title")}
        action={libraries.data?.length ? addButton : undefined}
      >
        {libraries.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : libraries.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {tr("libraries.loadFailed", {
                error: errorMessage(libraries.error),
              })}
            </p>
            <Button variant="outline" onClick={() => void libraries.refetch()}>
              <RefreshCwIcon />
              {tr("libraries.retry")}
            </Button>
          </div>
        ) : libraries.data.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{tr("libraries.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {tr("libraries.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <List>
            {libraries.data?.map((library) => (
              <LibraryRow
                key={library.id}
                library={library}
                onEdit={() => setDialog({ library })}
              />
            ))}
          </List>
        )}
      </SettingsSubsection>

      <LibraryDialog
        library={dialog?.library}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </SettingsSections>
  )
}

function LibraryRow({
  library,
  onEdit,
}: {
  library: Library
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const Icon = libraryIcons[library.kind]
  const providers = useQuery(orpc.metadata.providers.queryOptions())
  const provider = providers.data?.find(
    (p) => p.id === library.metadataProvider,
  )
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.libraries.key() })

  const scan = useMutation({
    mutationFn: () => client.libraries.scan({ id: library.id }),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(tr("libraries.scanFailed"), {
        description: errorMessage(error),
      }),
  })
  const refetchMetadata = useMutation({
    mutationFn: () => client.libraries.refreshMetadata({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(tr("libraries.fetching"), { description: library.name })
    },
    onError: (error) =>
      toast.error(tr("libraries.fetchFailed"), {
        description: errorMessage(error),
      }),
  })
  const remove = useMutation({
    mutationFn: () => client.libraries.remove({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(tr("libraries.removed", { name: library.name }), {
        description: tr("libraries.removed.description"),
      })
    },
    onError: (error) =>
      toast.error(tr("libraries.removeFailed", { name: library.name }), {
        description: errorMessage(error),
      }),
  })

  return (
    <ListItem className="items-center gap-3 py-2.5 pr-2">
      <RowIcon>
        <Icon />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm leading-5 font-medium">
          {library.name}
        </h4>
        {(library.scanning || library.refreshing) && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] leading-5">
            <Spinner className="size-3.5" />
            {library.scanning
              ? tr("libraries.scanning")
              : provider
                ? tr("libraries.fetchingFrom", { provider: provider.name })
                : tr("libraries.fetchingFromProvider")}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
              aria-label={tr("libraries.actions", { name: library.name })}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
          <DropdownMenuItem
            disabled={library.scanning || scan.isPending}
            onClick={() => scan.mutate()}
          >
            <RefreshCwIcon />
            {tr("libraries.scanNow")}
          </DropdownMenuItem>
          {provider && (
            <DropdownMenuItem
              disabled={library.refreshing || refetchMetadata.isPending}
              onClick={() => refetchMetadata.mutate()}
            >
              <CloudDownloadIcon />
              {tr("libraries.refreshMetadata")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            {tr("libraries.edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
            {tr("libraries.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("libraries.remove.title", { name: library.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("libraries.remove.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {tr("libraries.remove.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => remove.mutate()}
            >
              {tr("libraries.remove.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListItem>
  )
}
