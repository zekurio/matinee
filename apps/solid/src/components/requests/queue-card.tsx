import type { AdminRequestItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Check, RotateCw } from "lucide"
import { Show } from "solid-js"

import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
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

const declineClass = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  cardButton,
  "hover:bg-foreground/10 data-popup-open:bg-foreground/10",
)
const addClass = cn(buttonVariants({ size: "sm" }), cardButton)
const retryClass = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  cardButton,
)

/** Lift a decline: allow requests again, or add it after all. */
export type Reopen = "allowAgain" | "addAfterAll"

export function QueueCard(props: {
  item: AdminRequestItem
  /** Held for Undo or on its way: out of the list, and inert. */
  collapsed: boolean
  cardRef: (element: HTMLElement) => void
  /** The card J and K landed on, which Tab enters the list at. */
  focusable: boolean
  /** The popover that declines it, or gives it up. */
  declineOpen: boolean
  onDeclineOpenChange: (open: boolean) => void
  declineFinalFocus?: () => HTMLElement | null | undefined
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
  const state = () => props.item.state
  const hasActions = () => {
    switch (state()) {
      case "waiting":
        return props.may.approve || props.may.decline
      case "needsAttention":
        return props.may.retry || props.may.decline
      case "onTheWay":
        return props.may.decline
      case "declined":
        return props.may.approve
      case "here":
        return false
    }
  }
  const decline = (giveUp: boolean) => (
    <DeclinePopover
      item={props.item}
      giveUp={giveUp}
      open={props.declineOpen}
      onOpenChange={props.onDeclineOpenChange}
      onAnswer={props.onAnswer}
      finalFocus={props.declineFinalFocus}
      onClosed={props.onDeclineClosed}
      renderTrigger={(popover) => (
        <KeyTip
          {...popover}
          label={tr(giveUp ? "requests.giveUp" : "requests.decline")}
          keys={giveUp ? "G" : "D"}
          aria-keyshortcuts={giveUp ? "G" : "D"}
          aria-label={tr(
            giveUp ? "requests.giveUpNamed" : "requests.decline.title",
            { name: props.item.title.name },
          )}
          class={declineClass}
        >
          {tr(giveUp ? "requests.giveUp" : "requests.decline")}
        </KeyTip>
      )}
    />
  )

  return (
    <li
      aria-hidden={props.collapsed ? "true" : undefined}
      inert={props.collapsed}
      class={cn("min-w-0", props.collapsed && "hidden")}
    >
      <RequestCard
        ref={props.cardRef}
        item={props.item}
        size="wide"
        tabindex={props.focusable ? 0 : -1}
        onFocus={props.onFocusCard}
        class="focus-visible:ring-ring focus-visible:ring-2"
        state={
          <RequestStateBadge
            state={state()}
            progress={requestProgress(props.item)}
            detail={queueDetail(props.item)}
          />
        }
        who={<Askers item={props.item} />}
        menu={
          <CardMenu
            item={props.item}
            onAdd={props.onAdd}
            onRemove={props.onRemove}
            onAllowAgain={() => props.onReopen("allowAgain")}
            may={props.may}
          />
        }
        actions={
          <Show when={hasActions()}>
            <Show when={state() === "waiting"}>
              <Show when={props.may.decline}>{decline(false)}</Show>
              <Show when={props.may.approve}>
                <KeyTip
                  label={tr("requests.add")}
                  keys="A"
                  aria-keyshortcuts="A"
                  aria-label={tr("requests.addNamed", {
                    name: props.item.title.name,
                  })}
                  class={addClass}
                  onClick={() => props.onAdd()}
                >
                  <Icon icon={Check} stroke-width={2.5} />
                  {tr("requests.add")}
                </KeyTip>
              </Show>
            </Show>
            <Show
              when={
                (state() === "needsAttention" || state() === "onTheWay") &&
                props.may.decline
              }
            >
              {decline(true)}
            </Show>
            <Show when={state() === "needsAttention" && props.may.retry}>
              <KeyTip
                label={tr("requests.retry")}
                keys="R"
                aria-keyshortcuts="R"
                aria-label={tr("requests.retryNamed", {
                  name: props.item.title.name,
                })}
                class={retryClass}
                onClick={() => props.onRetry()}
              >
                <Icon icon={RotateCw} />
                {tr("requests.retry")}
              </KeyTip>
            </Show>
            <Show when={state() === "declined" && props.may.approve}>
              {/* "Allow requests again" is in the menu, where the other
                  states' removal is: both don't fit a card's line. */}
              <Button
                variant="outline"
                size="sm"
                aria-label={tr("requests.addAfterAllNamed", {
                  name: props.item.title.name,
                })}
                class={cardButton}
                onClick={() => props.onReopen("addAfterAll")}
              >
                <Icon icon={Check} />
                {tr("requests.addAfterAll")}
              </Button>
            </Show>
          </Show>
        }
      />
    </li>
  )
}
