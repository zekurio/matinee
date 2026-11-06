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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ImagesIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { libraryIcons } from "@/components/app-shell"
import { LibraryDialog } from "@/components/library-dialog"
import { formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { RowIcon } from "./account-panel"
import { SettingsSections, SettingsSubsection } from "./settings-panel"

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
                Add a folder of movies, shows, or any other videos.
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
    onError: (error) => toast.error(errorMessage(error)),
  })
  const refetchMetadata = useMutation({
    mutationFn: () => client.libraries.refreshMetadata({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`Fetching metadata for ${library.name} again`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => client.libraries.remove({ id: library.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`Removed ${library.name}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <ListItem className="flex-wrap items-start gap-x-3 gap-y-3 py-3 pr-2">
      <RowIcon>
        <Icon />
      </RowIcon>
      <div className="min-w-0 flex-1 basis-48">
        <h4 className="text-sm leading-5 font-medium">{library.name}</h4>
        <p className="text-muted-foreground text-[13px] leading-5">
          {library.scanning ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Scanning…
            </span>
          ) : library.refreshing ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Fetching metadata from {provider?.name ?? "the provider"}…
            </span>
          ) : (
            <>
              {library.itemCount} {library.itemCount === 1 ? "video" : "videos"}
              {provider ? ` · ${provider.name}` : ""}
              {library.lastScannedAt
                ? ` · scanned ${formatRelative(library.lastScannedAt)}`
                : " · not scanned yet"}
            </>
          )}
        </p>
        <ul aria-label="Folders" className="mt-2 flex flex-wrap gap-1.5">
          {library.paths.map((path) => (
            <li
              key={path}
              className="bg-muted text-muted-foreground max-w-full truncate rounded px-1.5 py-0.5 font-mono text-xs"
            >
              {path}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-1 max-sm:w-full max-sm:pl-12">
        <Button
          variant="outline"
          disabled={library.scanning || scan.isPending}
          onClick={() => scan.mutate()}
        >
          <RefreshCwIcon />
          Scan now
        </Button>
        {provider && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Fetch metadata for ${library.name} again`}
                  disabled={library.refreshing || refetchMetadata.isPending}
                  onClick={() => refetchMetadata.mutate()}
                />
              }
            >
              <ImagesIcon />
            </TooltipTrigger>
            <TooltipContent>Fetch all metadata again</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Edit ${library.name}`}
                onClick={onEdit}
              />
            }
          >
            <PencilIcon />
          </TooltipTrigger>
          <TooltipContent>Edit library</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove ${library.name}`}
                onClick={() => setConfirming(true)}
              />
            }
          >
            <Trash2Icon />
          </TooltipTrigger>
          <TooltipContent>Remove library</TooltipContent>
        </Tooltip>
      </div>

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
