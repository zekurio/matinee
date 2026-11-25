import type { AdminRequestItem, Availability } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useRouteContext } from "@tanstack/solid-router"
import { Check, ChevronDown } from "lucide"
import { createMemo, createSignal, Show } from "solid-js"

import type { BadgeTip } from "@/components/catalog/catalog-card"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { formatRelative } from "@/lib/format"
import { can, runsQueue } from "@/lib/permissions"
import {
  type QueueAction,
  useHiddenRequests,
  useRequestActionsStore,
  useSendHeldOnLeave,
} from "@/stores/request-actions"

import { DeclinePopover } from "./decline-popover"
import { choosesLibrary, GoesToChooser, useGoesTo } from "./goes-to"
import {
  addAction,
  askers,
  formatNames,
  scopeLabel,
  useRequestQueue,
} from "./request-queue"

/*
 * An admin's answer on a title's page, where everyone else's Request
 * sits: Add and Decline as the queue has them, with the same Undo, for a
 * request that waits for them. Who requested it goes in the poster's
 * badge, as its tooltip.
 */

/**
 * For an admin, the waiting request behind a title's or a season's
 * "Requested", from the same live queue the avatar's dot reads, so this
 * opens no stream. A season outside the request, which only shares its
 * id, has none. `answered` while an Add or a Decline is held for Undo or
 * on its way, when the page shows what anyone sees. Null for anyone else
 * and while nothing waits. An accessor, read where it's shown.
 *
 * Call it once in a part of the page that outlives the answer: anything
 * held is sent as that part goes, since Undo is only for while the admin
 * is still looking.
 */
export function useWaitingRequest(
  availability: () => Availability,
): () => { item: AdminRequestItem; answered: boolean } | null {
  const context = useRouteContext({ from: "/_authed/_shell" })
  const admin = () => runsQueue(context().user)
  const queue = useRequestQueue(admin)
  const hidden = useHiddenRequests()
  useSendHeldOnLeave()
  return createMemo(() => {
    const { requestId, state } = availability()
    if (!admin() || !requestId || state !== "asked") return null
    const item = queue()?.data?.waiting.find((entry) => entry.id === requestId)
    if (!item) return null
    return { item, answered: hidden().has(item.id) }
  })
}

/**
 * Who requested it, for the badge's tooltip: "anna requested this last
 * week", or "anna and ben requested this", with what a show's request
 * covers under it.
 */
export function requestedTip(item: AdminRequestItem): BadgeTip {
  const { first, rest } = askers(item)
  let text: string
  if (!first) text = tr("requests.badge.waiting")
  else if (rest.length === 0) {
    text = tr("requests.badge.requested", {
      name: first.name,
      when: formatRelative(first.createdAt),
    })
  } else {
    text = tr("requests.badge.requestedMany", {
      names: formatNames([first, ...rest].map((entry) => entry.name)),
    })
  }
  return { text, detail: scopeLabel(item.scope) }
}

/**
 * Where the buttons are drawn: `page`, leading a title page's row as
 * Request does there; `plain`, off a picture; or `fill`, one line across
 * a request's card, Add taking the room Decline leaves, where the card's
 * "Goes to" names and chooses the library instead.
 */
export type AnswerLook = "page" | "plain" | "fill"

/**
 * Add, in the main button's place and style, and Decline beside it, as
 * the quiet button. Add holds the call with an Undo toast, as the queue
 * does; when the request could go to more than one library, it names the
 * one and a chevron beside it chooses another, as "Goes to" does in the
 * queue's row. Decline opens the queue's form. Once either is pressed,
 * focus moves to what takes their place beside them.
 */
export function AdminAnswer(props: {
  item: AdminRequestItem
  look: AnswerLook
  class?: string
}) {
  const [declining, setDeclining] = createSignal(false)
  let root: HTMLDivElement | undefined
  const context = useRouteContext({ from: "/_authed/_shell" })
  const canApprove = () => can(context().user, "adminRequest.approve")
  const canDecline = () => can(context().user, "adminRequest.decline")
  const goesTo = useGoesTo(() => props.item)
  const fill = () => props.look === "fill"
  const choice = () => !fill() && choosesLibrary(props.item)
  const page = () => props.look === "page"
  const size = () => (page() ? "lg" : "sm")
  const hold = (action: QueueAction) =>
    useRequestActionsStore.getState().hold(action)

  // The buttons go once answered; focus moves on to whatever the row
  // shows in their place, else the page keeps it.
  const answered = () => {
    const box = root?.parentElement
    requestAnimationFrame(() =>
      box
        ?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
        ?.focus(),
    )
  }

  const add = () => (
    <Button
      size={size()}
      onClick={() => {
        hold(addAction([props.item]))
        answered()
      }}
      class={cn(
        "min-w-0",
        page() && "max-sm:h-11 max-sm:flex-1",
        fill() && "flex-1",
        choice() && "rounded-r-none",
      )}
    >
      <Icon
        icon={Check}
        stroke-width={page() ? 2 : 2.5}
        // On a card too narrow for both words, the words stay.
        class={cn(fill() && "@max-[12rem]/card:hidden")}
      />
      <span class="truncate">
        {choice()
          ? tr("requests.addTo", { library: goesTo().library })
          : tr("requests.add")}
      </span>
    </Button>
  )

  // Nothing to offer, so the row leaves no empty space.
  return (
    <Show when={canApprove() || canDecline()}>
      <div
        ref={(element) => {
          root = element
        }}
        class={cn(
          "flex min-w-0 gap-2",
          page() && "contents",
          fill() && "w-full gap-1.5",
          props.class,
        )}
      >
        <Show when={canApprove()}>
          <Show when={choice()} fallback={add()}>
            <div class={cn("flex min-w-0", page() && "max-sm:flex-1")}>
              {add()}
              <GoesToChooser
                item={props.item}
                renderTrigger={(trigger) => (
                  <button
                    {...trigger}
                    type="button"
                    aria-label={tr("requests.goesTo.change", {
                      name: props.item.title.name,
                      library: goesTo().library,
                    })}
                    class={cn(
                      buttonVariants({ size: size() }),
                      "border-l-primary-foreground/25 shrink-0 rounded-l-none",
                      page() ? "px-2.5 max-sm:h-11" : "px-1.5",
                    )}
                  >
                    <Icon icon={ChevronDown} />
                  </button>
                )}
              />
            </div>
          </Show>
        </Show>
        <Show when={canDecline()}>
          <DeclinePopover
            item={props.item}
            open={declining()}
            onOpenChange={setDeclining}
            onAnswer={(answer) => {
              setDeclining(false)
              hold({
                ...answer,
                ids: [props.item.id],
                names: [props.item.title.name],
              })
              answered()
            }}
            renderTrigger={(trigger) => (
              <button
                {...trigger}
                type="button"
                class={cn(
                  buttonVariants({ variant: "ghost", size: size() }),
                  page() &&
                    "hover:bg-foreground/10 data-popup-open:bg-foreground/10 max-sm:h-11",
                  props.look === "plain" &&
                    "hover:bg-muted data-popup-open:bg-muted",
                  fill() &&
                    "hover:bg-foreground/10 data-popup-open:bg-foreground/10 shrink-0 px-2",
                )}
              >
                {tr("requests.decline")}
              </button>
            )}
          />
        </Show>
      </div>
    </Show>
  )
}
