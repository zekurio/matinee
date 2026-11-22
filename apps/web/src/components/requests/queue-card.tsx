import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  InfoIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import type { Ref } from "react"

import { tr } from "@/i18n"

import { type Answer, DeclinePopover } from "./decline-popover"
import { KeyTip } from "./key-tip"
import { RequestCard, RequestStateBadge, requestProgress } from "./request-card"
import { Askers, QueueLine } from "./request-lines"
import { titleLink } from "./request-queue"

/*
 * A request on the requests page: the card every list draws, with what
 * its state lets an admin do. The page keeps one card in the tab order,
 * the one J and K are on, and its keys act on that card by its state.
 */

/** A button on a card: compact under a mouse, a full touch target on phones. */
const cardButton = "[@media(pointer:coarse)]:h-10"

/** Lift a decline: allow requests again, or add it after all. */
export type Reopen = "allowAgain" | "addAfterAll"

export function QueueCard({
  item,
  collapsed,
  cardRef,
  focusable,
  declineOpen,
  onDeclineOpenChange,
  declineFinalFocus,
  onDeclineClosed,
  onFocusCard,
  onAdd,
  onAnswer,
  onRetry,
  onReopen,
  onRemove,
}: {
  item: AdminRequestItem
  /** Held for Undo or on its way: out of the list, and inert. */
  collapsed: boolean
  cardRef: Ref<HTMLElement>
  /** The card J and K landed on, which Tab enters the list at. */
  focusable: boolean
  /** The popover that declines it, or gives it up. */
  declineOpen: boolean
  onDeclineOpenChange: (open: boolean) => void
  declineFinalFocus?: () => HTMLElement | boolean
  onDeclineClosed?: () => void
  onFocusCard: () => void
  onAdd: () => void
  onAnswer: (answer: Answer) => void
  onRetry: () => void
  onReopen: (kind: Reopen) => void
  onRemove: () => void
}) {
  const { state } = item
  // A finished card's line says when; who asked needs no time of its own.
  const finished = state === "here" || state === "declined"
  const decline = (giveUp: boolean) => (
    <DeclinePopover
      item={item}
      giveUp={giveUp}
      open={declineOpen}
      onOpenChange={onDeclineOpenChange}
      onAnswer={onAnswer}
      finalFocus={declineFinalFocus}
      onClosed={onDeclineClosed}
      trigger={
        <KeyTip
          label={tr(giveUp ? "requests.giveUp" : "requests.decline")}
          keys={giveUp ? "G" : "D"}
        >
          <Button
            variant="ghost"
            size="sm"
            aria-keyshortcuts={giveUp ? "G" : "D"}
            aria-label={tr(
              giveUp ? "requests.giveUpNamed" : "requests.decline.title",
              { name: item.title.name },
            )}
            className={cn(
              cardButton,
              "hover:bg-foreground/10 data-popup-open:bg-foreground/10",
            )}
          >
            {tr(giveUp ? "requests.giveUp" : "requests.decline")}
          </Button>
        </KeyTip>
      }
    />
  )

  return (
    <li
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className={cn("min-w-0", collapsed && "hidden")}
    >
      <RequestCard
        ref={cardRef}
        item={item}
        size="wide"
        tabIndex={focusable ? 0 : -1}
        onFocus={onFocusCard}
        className={cn(
          // The card J and K are on: a ring in the accent while focus is in it.
          "focus-within:ring-ring/70 focus-visible:ring-ring focus-within:ring-1 focus-visible:ring-2",
        )}
        state={
          <RequestStateBadge
            state={state}
            progress={requestProgress(item)}
            urgent
          />
        }
        line={<QueueLine item={item} />}
        who={<Askers item={item} when={!finished} />}
        whoUp={<Askers item={item} when={!finished} faces />}
        menu={
          <CardMenu
            item={item}
            onRemove={onRemove}
            onAllowAgain={() => onReopen("allowAgain")}
          />
        }
        actions={
          <>
            {state === "waiting" && (
              <>
                {decline(false)}
                <KeyTip label={tr("requests.add")} keys="A">
                  <Button
                    size="sm"
                    aria-keyshortcuts="A"
                    aria-label={tr("requests.addNamed", {
                      name: item.title.name,
                    })}
                    className={cardButton}
                    onClick={onAdd}
                  >
                    <CheckIcon strokeWidth={2.5} />
                    {tr("requests.add")}
                  </Button>
                </KeyTip>
              </>
            )}
            {(state === "needsAttention" || state === "onTheWay") &&
              decline(true)}
            {state === "needsAttention" && (
              <KeyTip label={tr("requests.retry")} keys="R">
                <Button
                  variant="outline"
                  size="sm"
                  aria-keyshortcuts="R"
                  aria-label={tr("requests.retryNamed", {
                    name: item.title.name,
                  })}
                  className={cardButton}
                  onClick={onRetry}
                >
                  <RotateCwIcon />
                  {tr("requests.retry")}
                </Button>
              </KeyTip>
            )}
            {state === "declined" && (
              // "Allow requests again" is in the menu, where the other
              // states' removal is: both don't fit a card's line.
              <Button
                variant="outline"
                size="sm"
                aria-label={tr("requests.addAfterAllNamed", {
                  name: item.title.name,
                })}
                className={cardButton}
                onClick={() => onReopen("addAfterAll")}
              >
                <CheckIcon />
                {tr("requests.addAfterAll")}
              </Button>
            )}
          </>
        }
      />
    </li>
  )
}

function CardMenu({
  item,
  onRemove,
  onAllowAgain,
}: {
  item: AdminRequestItem
  onRemove: () => void
  onAllowAgain: () => void
}) {
  const navigate = useNavigate()
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
        className="w-max max-w-[calc(100vw-2rem)] min-w-48"
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
        <DropdownMenuSeparator />
        {/* A declined request's removal lifts the decline, so it can be
            asked for again. */}
        {item.state === "declined" ? (
          <DropdownMenuItem onClick={onAllowAgain}>
            <RotateCcwIcon />
            {tr("requests.allowAgain")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2Icon />
            {tr("requests.remove")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
