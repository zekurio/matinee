import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  InfoIcon,
  LibraryBigIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { QueueActions } from "@/lib/permissions"
import { useRequestActionsStore } from "@/stores/request-actions"

import { choosesLibrary, useGoesTo } from "./goes-to"
import { askers, titleLink } from "./request-queue"

/*
 * The "…" on an admin's request card, which holds what the card leaves
 * out: who asked and when each did, where it goes, and for a waiting
 * request, adding it to another library than its own. The card's Add
 * keeps to the one it goes to now.
 */

/** A line in the menu that only says something, which keys still reach. */
const fact = "cursor-default items-start whitespace-normal"

export function CardMenu({
  item,
  onAdd,
  onRemove,
  onAllowAgain,
  may,
}: {
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
  const move = useRequestActionsStore((state) => state.move)
  const { first, rest } = askers(item)
  const everyone = first ? [first, ...rest] : []
  const waiting = item.state === "waiting"
  const choosing =
    waiting && may.approve && onAdd !== undefined && choosesLibrary(item)
  // A waiting request isn't routed yet: what fills it is its library's.
  const goesTo = useGoesTo(item)
  const where = [
    waiting ? goesTo.library : item.library.name,
    (waiting ? goesTo.connection : item.connection?.name) ??
      (waiting ? tr("requests.noConnection") : undefined),
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tr("requests.more", { name: item.title.name })}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 data-popup-open:text-foreground data-popup-open:bg-foreground/10 [@media(pointer:coarse)]:size-10"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-56"
      >
        <DropdownMenuItem onClick={() => void navigate(titleLink(item))}>
          {item.availability.libraryTitleId ? <PlayIcon /> : <InfoIcon />}
          {tr("requests.openTitle")}
        </DropdownMenuItem>
        {item.remoteUrl && item.connection && (
          <DropdownMenuItem
            render={
              <a href={item.remoteUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLinkIcon />
            {tr("requests.openRemote", {
              connection: item.connection.sourceName,
            })}
          </DropdownMenuItem>
        )}
        {everyone.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("requests.askedBy")}</DropdownMenuLabel>
              {everyone.map((asker) => (
                <DropdownMenuItem
                  key={asker.id}
                  closeOnClick={false}
                  className={fact}
                >
                  <UserAvatar
                    user={{
                      avatarId: asker.avatarId,
                      displayName: asker.name,
                      username: asker.name,
                    }}
                    className="text-11px size-5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{asker.name}</span>
                  <span
                    className="text-muted-foreground shrink-0 text-xs"
                    title={formatDateTime(asker.createdAt)}
                  >
                    {formatRelative(asker.createdAt)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        {choosing ? (
          // Each library it could go to adds it there, with the same Undo.
          <DropdownMenuGroup>
            <DropdownMenuLabel>{tr("requests.menu.addTo")}</DropdownMenuLabel>
            {item.destinations.map((library) => (
              <DropdownMenuItem
                key={library.id}
                onClick={() => {
                  // The add takes the library as it's held, and the card's
                  // Add keeps to its own after.
                  move(item.id, library.selected ? null : library.id)
                  onAdd()
                  move(item.id, null)
                }}
                className="items-start whitespace-normal"
              >
                <LibraryBigIcon />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{library.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {library.connection ?? tr("requests.noConnection")}
                  </span>
                </span>
                {/* Where the card's Add sends it. */}
                {library.selected && (
                  <CheckIcon aria-hidden className="text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {waiting
                ? tr("requests.goesTo.title")
                : tr("requests.menu.library")}
            </DropdownMenuLabel>
            <DropdownMenuItem closeOnClick={false} className={fact}>
              <LibraryBigIcon />
              <span className="min-w-0">{where}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        {item.diagnostics.length > 0 && item.connection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {tr("requests.menu.connection", {
                  connection: item.connection.sourceName,
                })}
              </DropdownMenuLabel>
              {item.diagnostics.map((entry, index) => (
                <DropdownMenuItem
                  key={`${entry.label}-${index}`}
                  closeOnClick={false}
                  className={fact}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-muted-foreground text-xs">
                      {entry.label}
                    </span>
                    <span className="font-mono text-xs break-all">
                      {entry.value}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        {/* A declined request's removal lifts the decline, so it can be
            asked for again. */}
        {item.state === "declined" && may.decline && onAllowAgain && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAllowAgain}>
              <RotateCcwIcon />
              {tr("requests.allowAgain")}
            </DropdownMenuItem>
          </>
        )}
        {item.state !== "declined" && may.remove && onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2Icon />
              {tr("requests.remove")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
