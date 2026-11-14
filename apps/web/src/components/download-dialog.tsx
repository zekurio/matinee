import type { MediaItem, TitleSummary } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { DropdownMenuItem } from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useQuery } from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"
import { lazy, Suspense } from "react"

import { tr } from "@/i18n"
import { downloadOriginals } from "@/lib/download"
import { formatBytes } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"

import { FormAlert } from "./form-alert"

// The form library and the track lists load when the dialog first opens.
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
export function useDownloadsAllowed(once = false): boolean {
  const query = orpc.playback.options.queryOptions({
    select: (data) => data.downloads,
  })
  const options = useQuery(once ? { ...query, staleTime: Infinity } : query)
  return options.data ?? false
}

/** In a dialog that opened while downloads were allowed, and no longer are. */
function DownloadsOff({ onDone }: { onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("downloads.off.title")}
        </DialogTitle>
        <DialogDescription>{tr("downloads.off.description")}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" onClick={onDone}>
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
export function DownloadDialog({
  item,
  name,
  open,
  onOpenChange,
}: {
  item: MediaItem
  /** The movie or episode, for the title. */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const allowed = useDownloadsAllowed()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {/* The dialog unmounts its content when closed, so each opening
            starts from the defaults again. */}
        {allowed ? (
          <Suspense
            fallback={<Spinner className="mx-auto my-16 size-6 opacity-60" />}
          >
            <DownloadForm
              item={item}
              name={name}
              onDone={() => onOpenChange(false)}
            />
          </Suspense>
        ) : (
          <DownloadsOff onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Save every file of a show, or of one of its seasons, as it is. A
 * version made for this device stays one file at a time, since the server
 * makes each while the browser saves it.
 */
export function DownloadFilesDialog({
  title,
  season,
  name,
  open,
  onOpenChange,
}: {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        {allowed ? (
          <DownloadFiles
            title={title}
            season={season}
            name={name}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <DownloadsOff onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DownloadFiles({
  title,
  season,
  name,
  onDone,
}: {
  title: TitleSummary
  season: number | null | undefined
  name: string
  onDone: () => void
}) {
  const items = useQuery(
    orpc.titles.items.queryOptions({
      input: season === undefined ? { id: title.id } : { id: title.id, season },
    }),
  )
  const files = items.data ?? []
  const size = files.reduce((total, item) => total + item.sizeBytes, 0)
  const save = () => {
    downloadOriginals(files)
    toast.success(tr("downloads.all.started", { count: files.length }), {
      description: tr("downloads.all.started.description"),
    })
    onDone()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("downloads.title", { name })}
        </DialogTitle>
        <DialogDescription>{tr("downloads.all.description")}</DialogDescription>
      </DialogHeader>

      {items.isPending ? (
        <Spinner className="mx-auto my-4 size-6 opacity-60" />
      ) : items.isError ? (
        <FormAlert
          message={tr("downloads.all.loadFailed", {
            error: errorMessage(items.error),
          })}
        />
      ) : files.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {tr("downloads.all.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium tabular-nums">
            {[
              tr("downloads.all.files", { count: files.length }),
              formatBytes(size),
            ].join(" · ")}
          </p>
          {files.length > 1 && (
            <p className="text-muted-foreground text-sm">
              {tr("downloads.all.browser")}
            </p>
          )}
        </div>
      )}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" disabled={files.length === 0} onClick={save}>
          <DownloadIcon />
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
export function DownloadMenuItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onClick={onSelect}>
      <DownloadIcon />
      {tr("downloads.menuItem")}
    </DropdownMenuItem>
  )
}
