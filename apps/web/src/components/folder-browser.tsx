import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  FolderIcon,
  PlusIcon,
} from "lucide-react"
import { useState } from "react"

import { tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"

function folderName(path: string): string {
  return path.split("/").findLast(Boolean) ?? "/"
}

/**
 * The server's folders in a dialog of their own, over the library dialog.
 * A path typed in opens that folder; a row opens its folder or adds it
 * straight away; the footer adds the one that's open. Adding closes it.
 */
export function FolderPicker({
  open,
  onOpenChange,
  onPick,
  picked,
  initialPath,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (path: string) => void
  picked: string[]
  /** Where to open. The server root when unset. */
  initialPath?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-6 sm:max-w-lg [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        {open && (
          <FolderBrowser
            initialPath={initialPath}
            picked={picked}
            onCancel={() => onOpenChange(false)}
            onPick={(path) => {
              onPick(path)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FolderBrowser({
  onPick,
  onCancel,
  picked,
  initialPath,
}: {
  onPick: (path: string) => void
  onCancel: () => void
  picked: string[]
  initialPath?: string
}) {
  const [path, setPath] = useState<string | undefined>(initialPath)
  const listing = useQuery({
    ...orpc.admin.browse.queryOptions({ input: { path } }),
    staleTime: 5_000,
  })
  const current = listing.data?.path ?? path ?? "/"
  const root = listing.data ? listing.data.parent === null : current === "/"
  const alreadyPicked = picked.includes(current)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("libraries.dialog.browse")}
        </DialogTitle>
      </DialogHeader>

      {/* Keyed by the folder, so opening another one shows its path. */}
      <PathField key={current} path={current} onOpen={setPath} />

      <div className="h-72 overflow-y-auto rounded-lg border p-1">
        {listing.isPending ? (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : listing.error ? (
          <p className="text-destructive p-3 text-sm">
            {errorMessage(listing.error)}
          </p>
        ) : (
          <ul>
            {listing.data?.parent && (
              <li>
                <button
                  type="button"
                  aria-label={tr("libraries.browser.parent")}
                  className="hover:bg-foreground/[0.06] focus-visible:ring-ring flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  onClick={() => setPath(listing.data.parent ?? undefined)}
                >
                  <ArrowLeftIcon className="text-muted-foreground size-4 shrink-0" />
                  <span>..</span>
                </button>
              </li>
            )}
            {listing.data?.directories.length === 0 && (
              <li className="text-muted-foreground p-2.5 text-sm">
                {tr("libraries.browser.empty")}
              </li>
            )}
            {listing.data?.directories.map((dir) => {
              const added = picked.includes(dir.path)
              return (
                <li
                  key={dir.path}
                  className="group/row hover:bg-foreground/[0.06] relative rounded-md"
                >
                  <button
                    type="button"
                    aria-label={tr("libraries.browser.open", {
                      name: dir.name,
                    })}
                    className="focus-visible:ring-ring flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                    onClick={() => setPath(dir.path)}
                  >
                    <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{dir.name}</span>
                    <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={tr("libraries.browser.addNamed", {
                      name: dir.name,
                    })}
                    disabled={added}
                    className="absolute top-1/2 right-8 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100"
                    onClick={() => onPick(dir.path)}
                  >
                    {added
                      ? tr("libraries.browser.added")
                      : tr("libraries.browser.add")}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-muted-foreground text-[13px]">
        {root
          ? tr("libraries.browser.openRoot")
          : alreadyPicked
            ? tr("libraries.browser.alreadyAdded", { path: current })
            : tr("libraries.browser.adds", { path: current })}
      </p>

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tr("libraries.dialog.cancel")}
        </Button>
        <Button
          type="button"
          disabled={root || alreadyPicked || !listing.data}
          onClick={() => onPick(current)}
        >
          <PlusIcon />
          {alreadyPicked
            ? tr("libraries.browser.added")
            : tr("libraries.browser.addCurrent", { name: folderName(current) })}
        </Button>
      </DialogFooter>
    </>
  )
}

/** The open folder's path, which a path typed in and Enter replace. */
function PathField({
  path,
  onOpen,
}: {
  path: string
  onOpen: (path: string) => void
}) {
  const [draft, setDraft] = useState(path)
  const open = () => {
    const typed = draft.trim()
    if (typed) onOpen(typed)
  }
  return (
    <div className="flex gap-2">
      <Input
        aria-label={tr("libraries.browser.path")}
        value={draft}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        className="font-mono"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter opens the folder; it mustn't submit the library form behind.
          if (event.key !== "Enter") return
          event.preventDefault()
          open()
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={!draft.trim() || draft.trim() === path}
        onClick={open}
      >
        <CornerDownLeftIcon />
        {tr("libraries.browser.go")}
      </Button>
    </div>
  )
}
