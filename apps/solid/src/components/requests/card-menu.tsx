import type { AdminRequestItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useNavigate } from "@tanstack/solid-router"
import {
  Check,
  Ellipsis,
  ExternalLink,
  Info,
  LibraryBig,
  Play,
  RotateCcw,
  Trash2,
} from "lucide"
import { createMemo, For, Show } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { QueueActions } from "@/lib/permissions"
import { useRequestActionsStore } from "@/stores/request-actions"

import { choosesLibrary, useGoesTo } from "./goes-to"
import { askers, titleLink } from "./request-queue"

/*
 * The "…" on an admin's request card, which holds what the card leaves
 * out: who asked and when each did, each opening their profile, the
 * library it goes to, which opens it, and for a waiting request, adding
 * it to another library than its own. The card's Add
 * keeps to the one it goes to now.
 */

/** A line in the menu that only says something, which keys still reach. */
const fact = "cursor-default items-start whitespace-normal"

const triggerClass = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "text-muted-foreground hover:text-foreground hover:bg-foreground/10 data-popup-open:text-foreground data-popup-open:bg-foreground/10 [@media(pointer:coarse)]:size-10",
)

export function CardMenu(props: {
  item: AdminRequestItem
  /** Adds it, once a library is chosen under "Add to". */
  onAdd?: () => void
  /** On the requests page: removal, or lifting a decline. */
  onRemove?: () => void
  onAllowAgain?: () => void
  /** What the viewer may do with it. */
  may: QueueActions
}) {
  const navigate = useNavigate()
  const everyone = createMemo(() => {
    const { first, rest } = askers(props.item)
    return first ? [first, ...rest] : []
  })
  const waiting = () => props.item.state === "waiting"
  const choosing = () =>
    waiting() &&
    props.may.approve &&
    props.onAdd !== undefined &&
    choosesLibrary(props.item)
  // A waiting request isn't routed yet: what fills it is its library's.
  const goesTo = useGoesTo(() => props.item)
  const libraryId = () => (waiting() ? goesTo().id : props.item.library.id)
  const where = () =>
    [
      waiting() ? goesTo().library : props.item.library.name,
      (waiting() ? goesTo().connection : props.item.connection?.name) ??
        (waiting() ? tr("requests.noConnection") : undefined),
    ]
      .filter(Boolean)
      .join(" · ")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tr("requests.more", { name: props.item.title.name })}
        class={triggerClass}
      >
        <Icon icon={Ellipsis} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        class="w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-56"
      >
        <DropdownMenuItem onSelect={() => void navigate(titleLink(props.item))}>
          <Icon icon={props.item.availability.libraryTitleId ? Play : Info} />
          {tr("requests.openTitle")}
        </DropdownMenuItem>
        <Show when={props.item.remoteUrl ? props.item.connection : null}>
          {(connection) => (
            <DropdownMenuItem
              render={(item) => (
                <a
                  {...item}
                  href={props.item.remoteUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                />
              )}
            >
              <Icon icon={ExternalLink} />
              {tr("requests.openRemote", {
                connection: connection().sourceName,
              })}
            </DropdownMenuItem>
          )}
        </Show>
        <Show when={everyone().length > 0}>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{tr("requests.askedBy")}</DropdownMenuLabel>
            <For each={everyone()}>
              {(asker) => (
                <DropdownMenuItem
                  onSelect={() =>
                    void navigate({
                      to: "/profiles/$username",
                      params: { username: asker.username },
                    })
                  }
                >
                  <UserAvatar
                    user={{
                      avatarUrl: asker.avatarUrl,
                      displayName: asker.name,
                      username: asker.username,
                    }}
                    class="text-11px size-5 shrink-0"
                  />
                  <span class="min-w-0 flex-1 truncate">{asker.name}</span>
                  <span
                    class="text-muted-foreground shrink-0 text-xs"
                    title={formatDateTime(asker.createdAt)}
                  >
                    {formatRelative(asker.createdAt)}
                  </span>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuGroup>
        </Show>
        <DropdownMenuSeparator />
        <Show
          when={choosing()}
          fallback={
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {waiting()
                  ? tr("requests.goesTo.title")
                  : tr("requests.menu.library")}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  void navigate({
                    to: "/libraries/$libraryId",
                    params: { libraryId: libraryId() },
                  })
                }
                class="items-start whitespace-normal"
              >
                <Icon icon={LibraryBig} />
                <span class="min-w-0">{where()}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          }
        >
          {/* Each library it could go to adds it there, with the same Undo. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{tr("requests.menu.addTo")}</DropdownMenuLabel>
            <For each={props.item.destinations}>
              {(library) => (
                <DropdownMenuItem
                  onSelect={() => {
                    // The add takes the library as it's held, and the
                    // card's Add keeps to its own after.
                    const { move } = useRequestActionsStore.getState()
                    move(props.item.id, library.selected ? null : library.id)
                    props.onAdd?.()
                    move(props.item.id, null)
                  }}
                  class="items-start whitespace-normal"
                >
                  <Icon icon={LibraryBig} />
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span>{library.name}</span>
                    <span class="text-muted-foreground text-xs">
                      {library.connection ?? tr("requests.noConnection")}
                    </span>
                  </span>
                  {/* Where the card's Add sends it. */}
                  <Show when={library.selected}>
                    <Icon icon={Check} class="text-primary" />
                  </Show>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuGroup>
        </Show>
        <Show when={props.item.diagnostics.length > 0 && props.item.connection}>
          {(connection) => (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {tr("requests.menu.connection", {
                    connection: connection().sourceName,
                  })}
                </DropdownMenuLabel>
                <For each={props.item.diagnostics}>
                  {(entry) => (
                    <DropdownMenuItem closeOnSelect={false} class={fact}>
                      <span class="flex min-w-0 flex-col">
                        <span class="text-muted-foreground text-xs">
                          {entry.label}
                        </span>
                        <span class="font-mono text-xs break-all">
                          {entry.value}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuGroup>
            </>
          )}
        </Show>
        {/* A declined request's removal lifts the decline, so it can be
            asked for again. */}
        <Show
          when={
            props.item.state === "declined" &&
            props.may.decline &&
            props.onAllowAgain
          }
        >
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => props.onAllowAgain?.()}>
            <Icon icon={RotateCcw} />
            {tr("requests.allowAgain")}
          </DropdownMenuItem>
        </Show>
        <Show
          when={
            props.item.state !== "declined" &&
            props.may.remove &&
            props.onRemove
          }
        >
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => props.onRemove?.()}
          >
            <Icon icon={Trash2} />
            {tr("requests.remove")}
          </DropdownMenuItem>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
