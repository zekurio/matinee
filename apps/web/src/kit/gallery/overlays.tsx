import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Bookmark, CircleHelp, Copy, Pencil, Trash2 } from "lucide"
import { createSignal, For } from "solid-js"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/kit/alert-dialog"
import { Button, buttonVariants } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/kit/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@/kit/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { toast } from "@/kit/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/kit/tooltip"

const trigger = buttonVariants({ variant: "outline" })
const languages = [
  {
    type: "group",
    label: "Original audio",
    items: [{ value: "en", label: "English" }],
  },
  {
    type: "group",
    label: "Dubs",
    items: [
      { value: "de", label: "German" },
      { value: "fr", label: "French" },
    ],
  },
] satisfies import("@ui-sdk/solid/select").ListData

function Example(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex min-w-0 flex-col items-start gap-2">
      <h2 class="text-lg font-semibold">{props.title}</h2>
      {props.children}
    </section>
  )
}

/** Dialogs, menus and what else opens over the page, for checking by eye. */
export function KitOverlays() {
  const [editing, setEditing] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)
  const [playlist, setPlaylist] = createSignal("Weekend films")
  return (
    <div class="grid items-start gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      <Example title="Dialog">
        <Dialog open={editing()} onOpenChange={setEditing}>
          <DialogTrigger class={trigger} data-testid="kit-dialog-trigger">
            Rename playlist
          </DialogTrigger>
          <DialogContent initialFocus="#kit-playlist-name">
            <DialogHeader>
              <DialogTitle>Rename playlist</DialogTitle>
              <DialogDescription>
                Pick a name that makes this playlist easy to find.
              </DialogDescription>
            </DialogHeader>
            <form
              class="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const name = new FormData(event.currentTarget).get("name")
                if (name !== null && !(name instanceof File) && name.trim()) {
                  setPlaylist(name.trim())
                  setEditing(false)
                  toast.success("Playlist renamed")
                }
              }}
            >
              <label class="grid gap-1.5 text-sm" for="kit-playlist-name">
                Playlist name
                <input
                  class={cn(FIELD_CLASS_NAME, "h-9 rounded-lg px-2.5")}
                  id="kit-playlist-name"
                  name="name"
                  defaultValue={playlist()}
                  required
                />
              </label>
              <DialogFooter showCancelButton>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Example>
      <Example title="Alert dialog">
        <AlertDialog open={deleting()} onOpenChange={setDeleting}>
          <AlertDialogTrigger
            class={trigger}
            data-testid="kit-alert-dialog-trigger"
          >
            Delete playlist
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Icon icon={Trash2} />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete {playlist()}?</AlertDialogTitle>
              <AlertDialogDescription>
                The playlist will be removed. Its films will stay in the
                library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setDeleting(false)
                  toast.success("Playlist deleted")
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Example>
      <Example title="Drawer">
        <Drawer>
          <DrawerTrigger class={trigger} data-testid="kit-drawer-trigger">
            Playback options
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHandle />
            <div class="mx-auto grid w-full max-w-md gap-4 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div class="grid gap-1">
                <DrawerTitle>Playback options</DrawerTitle>
                <DrawerDescription class="text-muted-foreground text-sm">
                  Choose how this title plays on this device.
                </DrawerDescription>
              </div>
              <DrawerClose class={buttonVariants({ variant: "secondary" })}>
                Use original quality
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      </Example>
      <Example title="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger class={trigger} data-testid="kit-menu-trigger">
            Playlist actions
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{playlist()}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Icon icon={Pencil} /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => toast.success("Playlist duplicated")}
              >
                <Icon icon={Copy} /> Duplicate{" "}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem defaultChecked>
              <Icon icon={Bookmark} /> Show on Home
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={() => toast.success("Link ready to share")}
                >
                  Copy link
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleting(true)}
            >
              <Icon icon={Trash2} /> Delete playlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Example>
      <Example title="Popover">
        <Popover>
          <PopoverTrigger class={trigger} data-testid="kit-popover-trigger">
            About this library
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader class="-mx-2.5 -mt-2.5">
              <PopoverTitle>Films</PopoverTitle>
            </PopoverHeader>
            <PopoverDescription class="text-muted-foreground px-0.5">
              Titles in this library are available to everyone with library
              access.
            </PopoverDescription>
          </PopoverContent>
        </Popover>
      </Example>
      <Example title="Tooltip">
        <TooltipProvider>
          <Tooltip toggleable>
            <TooltipTrigger
              class={buttonVariants({ variant: "outline", size: "icon" })}
              data-testid="kit-tooltip-trigger"
              aria-label="About subtitles"
            >
              <Icon icon={CircleHelp} />
            </TooltipTrigger>
            <TooltipContent>Subtitles depend on the file</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Example>
      <Example title="Select">
        <Select items={languages} defaultValue="en">
          <SelectTrigger
            class="min-w-40"
            aria-label="Audio language"
            data-testid="kit-select-trigger"
          >
            <SelectValue placeholder="Audio language" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Original audio</SelectLabel>
              <SelectItem value="en">English</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Dubs</SelectLabel>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="fr">French</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Example>
      <Example title="Toast">
        <div class="flex flex-wrap gap-2">
          <For
            each={[
              {
                kind: "success",
                label: "Success",
                open: () =>
                  toast.success("Added to your watchlist", {
                    action: {
                      label: "Undo",
                      onClick: () =>
                        toast.message("Removed from your watchlist"),
                    },
                  }),
              },
              {
                kind: "error",
                label: "Error",
                open: () =>
                  toast.error("Couldn't play this title", {
                    description: "Try choosing a different file.",
                  }),
              },
              {
                kind: "message",
                label: "Message",
                open: () => toast.message("Library scan scheduled"),
              },
              {
                kind: "loading",
                label: "Loading",
                open: () =>
                  toast.loading("Scanning the library", { id: "kit-scan" }),
              },
              {
                kind: "info",
                label: "Info",
                open: () =>
                  toast.info("Your download is ready", {
                    position: "top-center",
                  }),
              },
              {
                kind: "warning",
                label: "Warning",
                open: () => toast.warning("Storage is nearly full"),
              },
            ]}
          >
            {(example) => (
              <Button
                variant="outline"
                size="sm"
                data-testid={`kit-toast-${example.kind}-trigger`}
                onClick={() => {
                  example.open()
                }}
              >
                {example.label}
              </Button>
            )}
          </For>
        </div>
      </Example>
    </div>
  )
}
