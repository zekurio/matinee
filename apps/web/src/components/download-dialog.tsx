import type { MediaItem, TitleSummary } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import { Download } from "lucide"
import { createMemo, lazy, Loading, Match, Show, Switch } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { DropdownMenuItem } from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { downloadOriginals } from "@/lib/download"
import { formatBytes } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"

import { FormAlert } from "./form-alert"

// The track lists and their logic load when the dialog first opens.
const DownloadForm = lazy(() =>
  import("./download-form").then((module) => ({
    default: module.DownloadForm,
  })),
)

/**
 * Whether the account may download, as the server says. False until it
 * has, so nothing offers a download the server would refuse. With `once`,
 * an answer from earlier in the visit will do, as for a card deciding
 * whether it has a menu at all; an open menu or dialog asks again once the
 * answer is stale.
 */
// Returns an accessor.
export function useDownloadsAllowed(once = false): () => boolean {
  const options = useQuery(() => {
    const query = orpc.playback.options.queryOptions({
      select: (data) => data.downloads,
    })
    return once ? { ...query, staleTime: Infinity } : query
  })
  return () => (options.isSuccess ? options.data : false)
}

/** In a dialog that opened while downloads were allowed, and no longer are. */
function DownloadsOff(props: { onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("downloads.off.title")}
        </DialogTitle>
        <DialogDescription>{tr("downloads.off.description")}</DialogDescription>
      </DialogHeader>
      <DialogFooter class="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" onClick={() => props.onDone()}>
          {tr("downloads.off.done")}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Save a file to watch offline: as it is, or a version the server makes
 * for this device while the browser saves it.
 */
export function DownloadDialog(props: {
  item: MediaItem
  /** The movie or episode, for the title. */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const allowed = useDownloadsAllowed()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        class="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg"
      >
        {/* The dialog unmounts its content when closed, so each opening
            starts from the defaults again. */}
        <Show
          when={allowed()}
          fallback={<DownloadsOff onDone={() => props.onOpenChange(false)} />}
        >
          <Loading
            fallback={<Spinner class="mx-auto my-16 size-6 opacity-60" />}
          >
            <DownloadForm
              item={props.item}
              name={props.name}
              onDone={() => props.onOpenChange(false)}
            />
          </Loading>
        </Show>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Save every file of a show, or of one of its seasons, as it is. A
 * version made for this device stays one file at a time, since the server
 * makes each while the browser saves it.
 */
export function DownloadFilesDialog(props: {
  title: TitleSummary
  /** As in `titles.items`: one season, null for the files without one. Unset is every file. */
  season?: number | null | undefined
  /** The show or season, for the title. */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const allowed = useDownloadsAllowed()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent showCloseButton={false} class="gap-5 p-6 sm:max-w-md">
        <Show
          when={allowed()}
          fallback={<DownloadsOff onDone={() => props.onOpenChange(false)} />}
        >
          <DownloadFiles
            title={props.title}
            season={props.season}
            name={props.name}
            onDone={() => props.onOpenChange(false)}
          />
        </Show>
      </DialogContent>
    </Dialog>
  )
}

function DownloadFiles(props: {
  title: TitleSummary
  season: number | null | undefined
  name: string
  onDone: () => void
}) {
  const items = useQuery(() =>
    orpc.titles.items.queryOptions({
      input:
        props.season === undefined
          ? { id: props.title.id }
          : { id: props.title.id, season: props.season },
    }),
  )
  const files = createMemo(() => (items.isSuccess ? items.data : []))
  const size = () => files().reduce((total, item) => total + item.sizeBytes, 0)
  const save = () => {
    downloadOriginals(files())
    toast.success(tr("downloads.all.started", { count: files().length }), {
      description: tr("downloads.all.started.description"),
    })
    props.onDone()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("downloads.title", { name: props.name })}
        </DialogTitle>
        <DialogDescription>{tr("downloads.all.description")}</DialogDescription>
      </DialogHeader>

      <Switch>
        <Match when={items.isPending}>
          <Spinner class="mx-auto my-4 size-6 opacity-60" />
        </Match>
        <Match when={items.isError}>
          <FormAlert
            message={tr("downloads.all.loadFailed", {
              error: errorMessage(items.error),
            })}
          />
        </Match>
        <Match when={files().length === 0}>
          <p class="text-muted-foreground text-sm">
            {tr("downloads.all.empty")}
          </p>
        </Match>
        <Match when={files().length > 0}>
          <div class="flex flex-col gap-1">
            <p class="text-sm font-medium tabular-nums">
              {[
                tr("downloads.all.files", { count: files().length }),
                formatBytes(size()),
              ].join(" · ")}
            </p>
            <Show when={files().length > 1}>
              <p class="text-muted-foreground text-sm">
                {tr("downloads.all.browser")}
              </p>
            </Show>
          </div>
        </Match>
      </Switch>

      <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" disabled={files().length === 0} onClick={save}>
          <Icon icon={Download} />
          {tr("downloads.submit")}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * "Download" in a menu, for an account that may download. Its owner
 * renders the dialog.
 */
export function DownloadMenuItem(props: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={() => props.onSelect()}>
      <Icon icon={Download} />
      {tr("downloads.menuItem")}
    </DropdownMenuItem>
  )
}
