import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { CheckIcon, RotateCwIcon } from "lucide-react"
import type { Ref } from "react"

import { tr } from "@/i18n"
import type { QueueActions } from "@/lib/permissions"

import { CardMenu } from "./card-menu"
import { type Answer, DeclinePopover } from "./decline-popover"
import { KeyTip } from "./key-tip"
import { RequestCard, RequestStateBadge, requestProgress } from "./request-card"
import { Askers, queueDetail } from "./request-lines"

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
  may,
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
  /** What the viewer may do with it. */
  may: QueueActions
}) {
  const { state } = item
  const hasActions =
    state === "waiting"
      ? may.approve || may.decline
      : state === "needsAttention"
        ? may.retry || may.decline
        : state === "onTheWay"
          ? may.decline
          : state === "declined"
            ? may.approve
            : false
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
        className="focus-visible:ring-ring focus-visible:ring-2"
        state={
          <RequestStateBadge
            state={state}
            progress={requestProgress(item)}
            detail={queueDetail(item)}
          />
        }
        who={<Askers item={item} />}
        menu={
          <CardMenu
            item={item}
            onAdd={onAdd}
            onRemove={onRemove}
            onAllowAgain={() => onReopen("allowAgain")}
            may={may}
          />
        }
        actions={
          hasActions ? (
            <>
              {state === "waiting" && (
                <>
                  {may.decline && decline(false)}
                  {may.approve && (
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
                  )}
                </>
              )}
              {(state === "needsAttention" || state === "onTheWay") &&
                may.decline &&
                decline(true)}
              {state === "needsAttention" && may.retry && (
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
              {state === "declined" && may.approve && (
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
          ) : undefined
        }
      />
    </li>
  )
}
