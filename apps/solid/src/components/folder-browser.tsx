import { useQuery } from "@tanstack/solid-query"
import { ArrowLeft, ChevronRight, CornerDownLeft, Folder, Plus } from "lucide"
import { createSignal, For, Match, Repeat, Show, Switch } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Skeleton } from "@/kit/skeleton"
import { errorMessage, orpc } from "@/lib/rpc"

function folderName(path: string): string {
  return path.split("/").findLast(Boolean) ?? "/"
}

/**
 * The server's folders in a dialog of their own, over the library dialog.
 * A path typed in opens that folder; a row opens its folder or adds it
 * straight away; the footer adds the one that's open. Adding closes it.
 */
export function FolderPicker(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (path: string) => void
  picked: string[]
  /** Where to open. The server root when unset. */
  initialPath?: string
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogContent showCloseButton={false} class="gap-4 p-6 sm:max-w-lg">
        <FolderBrowser
          initialPath={props.initialPath}
          picked={props.picked}
          onCancel={() => props.onOpenChange(false)}
          onPick={(path) => {
            props.onPick(path)
            props.onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function FolderBrowser(props: {
  onPick: (path: string) => void
  onCancel: () => void
  picked: string[]
  initialPath?: string
}) {
  const [path, setPath] = createSignal<string | undefined>(
    () => props.initialPath,
  )
  const listing = useQuery(() => ({
    ...orpc.admin.browse.queryOptions({ input: { path: path() } }),
    staleTime: 5_000,
  }))
  const data = () => (listing.isSuccess ? listing.data : undefined)
  const current = () => data()?.path ?? path() ?? "/"
  const root = () => {
    const found = data()
    return found ? found.parent === null : current() === "/"
  }
  const alreadyPicked = () => props.picked.includes(current())

  return (
    <>
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("libraries.dialog.browse")}
        </DialogTitle>
      </DialogHeader>

      {/* Keyed by the folder, so opening another one shows its path. */}
      <Show when={current()} keyed>
        {(shown) => <PathField path={shown} onOpen={setPath} />}
      </Show>

      <div class="h-72 overflow-y-auto rounded-lg border p-1">
        <Switch>
          <Match when={listing.isPending}>
            <div class="flex flex-col gap-1 p-1">
              <Repeat count={4}>{() => <Skeleton class="h-8" />}</Repeat>
            </div>
          </Match>
          <Match when={listing.isError}>
            <p class="text-destructive p-3 text-sm">
              {errorMessage(listing.error)}
            </p>
          </Match>
          <Match when={data()}>
            {(found) => (
              <ul>
                <Show when={found().parent}>
                  {(parent) => (
                    <li>
                      <button
                        type="button"
                        aria-label={tr("libraries.browser.parent")}
                        class="hover:bg-foreground/[0.06] focus-visible:ring-ring flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                        onClick={() => setPath(parent())}
                      >
                        <Icon
                          icon={ArrowLeft}
                          class="text-muted-foreground size-4 shrink-0"
                        />
                        <span>..</span>
                      </button>
                    </li>
                  )}
                </Show>
                <Show when={found().directories.length === 0}>
                  <li class="text-muted-foreground p-2.5 text-sm">
                    {tr("libraries.browser.empty")}
                  </li>
                </Show>
                <For each={found().directories}>
                  {(dir) => {
                    const added = () => props.picked.includes(dir.path)
                    return (
                      <li class="group/row hover:bg-foreground/[0.06] relative rounded-md">
                        <button
                          type="button"
                          aria-label={tr("libraries.browser.open", {
                            name: dir.name,
                          })}
                          class="focus-visible:ring-ring flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                          onClick={() => setPath(dir.path)}
                        >
                          <Icon
                            icon={Folder}
                            class="text-muted-foreground size-4 shrink-0"
                          />
                          <span class="min-w-0 flex-1 truncate">
                            {dir.name}
                          </span>
                          <Icon
                            icon={ChevronRight}
                            class="text-muted-foreground size-4 shrink-0"
                          />
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={tr("libraries.browser.addNamed", {
                            name: dir.name,
                          })}
                          disabled={added()}
                          class="absolute top-1/2 right-8 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100"
                          onClick={() => props.onPick(dir.path)}
                        >
                          {added()
                            ? tr("libraries.browser.added")
                            : tr("libraries.browser.add")}
                        </Button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            )}
          </Match>
        </Switch>
      </div>

      <p class="text-muted-foreground text-13px">
        {root()
          ? tr("libraries.browser.openRoot")
          : alreadyPicked()
            ? tr("libraries.browser.alreadyAdded", { path: current() })
            : tr("libraries.browser.adds", { path: current() })}
      </p>

      <DialogFooter class="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={() => props.onCancel()}>
          {tr("libraries.dialog.cancel")}
        </Button>
        <Button
          type="button"
          disabled={root() || alreadyPicked() || !data()}
          onClick={() => props.onPick(current())}
        >
          <Icon icon={Plus} />
          {alreadyPicked()
            ? tr("libraries.browser.added")
            : tr("libraries.browser.addCurrent", {
                name: folderName(current()),
              })}
        </Button>
      </DialogFooter>
    </>
  )
}

/** The open folder's path, which a path typed in and Enter replace. */
function PathField(props: { path: string; onOpen: (path: string) => void }) {
  const [typed, setTyped] = createSignal(() => props.path)
  const open = () => {
    const next = typed().trim()
    if (next) props.onOpen(next)
  }
  return (
    <div class="flex gap-2">
      <Input
        aria-label={tr("libraries.browser.path")}
        value={typed()}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        class="font-mono"
        onValueChange={setTyped}
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
        disabled={!typed().trim() || typed().trim() === props.path}
        onClick={open}
      >
        <Icon icon={CornerDownLeft} />
        {tr("libraries.browser.go")}
      </Button>
    </div>
  )
}
