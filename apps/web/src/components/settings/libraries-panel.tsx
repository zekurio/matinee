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
      Add library
    </Button>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="libraries"
        title="Libraries"
        action={libraries.data?.length ? addButton : undefined}
      >
        {libraries.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : libraries.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              Couldn't load libraries. {errorMessage(libraries.error)}
            </p>
            <Button variant="outline" onClick={() => void libraries.refetch()}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : libraries.data.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No libraries yet</EmptyTitle>
              <EmptyDescription>
                Add a folder of movies or shows.
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
      toast.error("Couldn't start the scan", {
        description: errorMessage(error),
      }),
  })
  const refetchMetadata = useMutation({
    mutationFn: () => client.libraries.refreshMetadata({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success("Fetching metadata", { description: library.name })
    },
    onError: (error) =>
      toast.error("Couldn't fetch metadata", {
        description: errorMessage(error),
      }),
  })
  const remove = useMutation({
    mutationFn: () => client.libraries.remove({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`Removed ${library.name}`, {
        description: "Your files are still on disk.",
      })
    },
    onError: (error) =>
      toast.error(`Couldn't remove ${library.name}`, {
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
              ? "Scanning…"
              : `Fetching metadata from ${provider?.name ?? "the provider"}…`}
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
              aria-label={`${library.name} actions`}
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
            Scan now
          </DropdownMenuItem>
          {provider && (
            <DropdownMenuItem
              disabled={library.refreshing || refetchMetadata.isPending}
              onClick={() => refetchMetadata.mutate()}
            >
              <CloudDownloadIcon />
              Refresh metadata
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            Edit…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
            Remove…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {library.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Matinee forgets the library and its titles. Your files stay where
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => remove.mutate()}
            >
              Remove library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListItem>
  )
}
