import type { Library } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useRouteContext } from "@tanstack/solid-router"
import {
  CloudDownload,
  Ellipsis,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide"
import { createSignal, For, Match, Show, Switch } from "solid-js"

import { libraryIcons } from "@/components/app-shell"
import { LibraryDialog } from "@/components/library-dialog"
import { tr } from "@/i18n"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/kit/alert-dialog"
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
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { can } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createSettingsLibrariesStore } from "@/stores/settings-libraries"

import { RowIcon, SettingsSections, SettingsSubsection } from "./settings-panel"

const rowMenuButton = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "text-muted-foreground hover:text-foreground data-open:text-foreground",
)

export function LibrariesPanel() {
  const store = createSettingsLibrariesStore()
  const context = useRouteContext({ from: "/_authed" })
  const libraries = useQuery(() => ({
    ...orpc.libraries.list.queryOptions(),
    refetchInterval: (q) =>
      q.state.data?.some((library) => library.scanning || library.refreshing)
        ? 2000
        : false,
  }))
  const list = () => (libraries.isSuccess ? libraries.data : [])
  // The form browses the server's folders to pick from.
  const mayAdd = () =>
    can(context().user, "library.create") && can(context().user, "folder.read")
  const addButton = () => (
    <Show when={mayAdd()}>
      <Button onClick={() => store.edit()}>
        <Icon icon={Plus} />
        {tr("libraries.add")}
      </Button>
    </Show>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="libraries"
        title={tr("libraries.title")}
        action={list().length && mayAdd() ? addButton() : undefined}
      >
        <Switch>
          <Match when={libraries.isPending}>
            <Skeleton class="h-32 rounded-xl" />
          </Match>
          <Match when={libraries.isError}>
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <p class="text-muted-foreground text-sm">
                {tr("libraries.loadFailed", {
                  error: errorMessage(libraries.error),
                })}
              </p>
              <Button
                variant="outline"
                onClick={() => void libraries.refetch()}
              >
                <Icon icon={RefreshCw} />
                {tr("libraries.retry")}
              </Button>
            </div>
          </Match>
          <Match when={list().length === 0}>
            <Empty class="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{tr("libraries.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {tr("libraries.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{addButton()}</EmptyContent>
            </Empty>
          </Match>
          <Match when={true}>
            <List>
              <For each={list()} keyed={(library) => library.id}>
                {(library) => (
                  <LibraryRow
                    library={library()}
                    onEdit={() => store.edit(library())}
                  />
                )}
              </For>
            </List>
          </Match>
        </Switch>
      </SettingsSubsection>

      <LibraryDialog
        library={store.library()}
        open={store.open()}
        onOpenChange={(open) => {
          if (!open) store.close()
        }}
      />
    </SettingsSections>
  )
}

function LibraryRow(props: { library: Library; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const context = useRouteContext({ from: "/_authed" })
  const mayScan = () => can(context().user, "library.scan")
  const mayEdit = () =>
    can(context().user, "library.update") && can(context().user, "folder.read")
  const mayRemove = () => can(context().user, "library.delete")
  const [confirming, setConfirming] = createSignal(false)
  const providers = useQuery(() => orpc.metadata.providers.queryOptions())
  const provider = () =>
    (providers.isSuccess ? providers.data : []).find(
      (p) => p.id === props.library.metadataProvider,
    )
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.libraries.key() })

  // The callbacks run outside tracking, so the options read the library.
  const scan = useMutation(() => {
    const id = props.library.id
    return {
      mutationFn: () => client.libraries.scan({ id }),
      onSuccess: refresh,
      onError: (error: Error) =>
        toast.error(tr("libraries.scanFailed"), {
          description: errorMessage(error),
        }),
    }
  })
  const refetchMetadata = useMutation(() => {
    const { id, name } = props.library
    return {
      mutationFn: () => client.libraries.refreshMetadata({ id }),
      onSuccess: async () => {
        await refresh()
        toast.success(tr("libraries.fetching"), { description: name })
      },
      onError: (error: Error) =>
        toast.error(tr("libraries.fetchFailed"), {
          description: errorMessage(error),
        }),
    }
  })
  const remove = useMutation(() => {
    const { id, name } = props.library
    return {
      mutationFn: () => client.libraries.remove({ id }),
      onSuccess: async () => {
        await refresh()
        toast.success(tr("libraries.removed", { name }), {
          description: tr("libraries.removed.description"),
        })
      },
      onError: (error: Error) =>
        toast.error(tr("libraries.removeFailed", { name }), {
          description: errorMessage(error),
        }),
    }
  })

  return (
    <ListItem class="items-center gap-3 py-2.5 pr-2">
      <RowIcon>
        <Icon icon={libraryIcons[props.library.kind]} />
      </RowIcon>
      <div class="min-w-0 flex-1">
        <h4 class="truncate text-sm leading-5 font-medium">
          {props.library.name}
        </h4>
        <Show when={props.library.scanning || props.library.refreshing}>
          <p class="text-muted-foreground text-13px flex items-center gap-1.5 leading-5">
            <Spinner class="size-3.5" />
            {props.library.scanning
              ? tr("libraries.scanning")
              : provider()
                ? tr("libraries.fetchingFrom", {
                    provider: provider()?.name ?? "",
                  })
                : tr("libraries.fetchingFromProvider")}
          </p>
        </Show>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          class={rowMenuButton}
          aria-label={tr("libraries.actions", { name: props.library.name })}
        >
          <Icon icon={Ellipsis} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} class="min-w-48">
          <Show when={mayScan()}>
            <DropdownMenuItem
              disabled={props.library.scanning || scan.isPending}
              onSelect={() => scan.mutate()}
            >
              <Icon icon={RefreshCw} />
              {tr("libraries.scanNow")}
            </DropdownMenuItem>
          </Show>
          <Show when={mayScan() && provider()}>
            <DropdownMenuItem
              disabled={props.library.refreshing || refetchMetadata.isPending}
              onSelect={() => refetchMetadata.mutate()}
            >
              <Icon icon={CloudDownload} />
              {tr("libraries.refreshMetadata")}
            </DropdownMenuItem>
          </Show>
          <Show when={mayEdit()}>
            <DropdownMenuItem onSelect={() => props.onEdit()}>
              <Icon icon={Pencil} />
              {tr("libraries.edit")}
            </DropdownMenuItem>
          </Show>
          <Show when={mayRemove() && (mayScan() || mayEdit())}>
            <DropdownMenuSeparator />
          </Show>
          <Show when={mayRemove()}>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirming(true)}
            >
              <Icon icon={Trash2} />
              {tr("libraries.remove")}
            </DropdownMenuItem>
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirming()}
        onOpenChange={(open) => setConfirming(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("libraries.remove.title", { name: props.library.name })}
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
