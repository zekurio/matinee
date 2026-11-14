import type { AdminRequestItem, Availability } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { useRouteContext } from "@tanstack/react-router"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useRef, useState } from "react"

import type { BadgeTip } from "@/components/catalog/catalog-card"
import { tr } from "@/i18n"
import { formatRelative } from "@/lib/format"
import {
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
 * and while nothing waits.
 *
 * Call it once in a part of the page that outlives the answer: anything
 * held is sent as that part goes, since Undo is only for while the admin
 * is still looking.
 */
export function useWaitingRequest(
  availability: Availability,
): { item: AdminRequestItem; answered: boolean } | null {
  const { user } = useRouteContext({ from: "/_authed/_shell" })
  const admin = user.role === "admin"
  const queue = useRequestQueue(admin)
  const hidden = useHiddenRequests()
  useSendHeldOnLeave()
  const { requestId, state } = availability
  if (!admin || !requestId || state !== "asked") return null
  const item = queue.data?.waiting.find((entry) => entry.id === requestId)
  if (!item) return null
  return { item, answered: hidden.has(item.id) }
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
 * Request does there; `poster`, along a poster's lower edge, stacked; or
 * `plain`, off a picture.
 */
export type AnswerLook = "page" | "poster" | "plain"

// On a poster, over its shade, as a poster's secondary button is drawn.
const glass =
  "border-white/15 bg-white/15 text-white backdrop-blur-md hover:bg-white/25 hover:text-white data-popup-open:bg-white/25"

/**
 * Add, in the main button's place and style, and Decline beside it, as
 * the quiet button. Add holds the call with an Undo toast, as the queue
 * does; when the request could go to more than one library, it names the
 * one and a chevron beside it chooses another, as "Goes to" does in the
 * queue's row. Decline opens the queue's form. Once either is pressed,
 * focus moves to what takes their place beside them.
 */
export function AdminAnswer({
  item,
  look,
  className,
}: {
  item: AdminRequestItem
  look: AnswerLook
  className?: string
}) {
  const hold = useRequestActionsStore((state) => state.hold)
  const [declining, setDeclining] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { library } = useGoesTo(item)
  const choice = choosesLibrary(item)
  const page = look === "page"
  const poster = look === "poster"
  const size = page ? "lg" : "sm"

  // The buttons go once answered; focus moves on to whatever the row
  // shows in their place, else the page keeps it.
  const answered = () => {
    const box = root.current?.parentElement
    requestAnimationFrame(() =>
      box
        ?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
        ?.focus(),
    )
  }

  const add = (
    <Button
      size={size}
      onClick={() => {
        hold(addAction([item]))
        answered()
      }}
      className={cn(
        "min-w-0",
        page && "max-sm:h-11 max-sm:flex-1",
        poster && "w-full px-2 shadow-lg shadow-black/30 max-sm:[&>svg]:hidden",
        choice && "rounded-r-none",
      )}
    >
      <CheckIcon aria-hidden strokeWidth={page ? 2 : 2.5} />
      <span className="truncate">
        {/* A poster has no room for the library; its chevron names it. */}
        {choice && !poster
          ? tr("requests.addTo", { library })
          : tr("requests.add")}
      </span>
    </Button>
  )

  return (
    <div
      ref={root}
      className={cn(
        "flex min-w-0 gap-2",
        page && "contents",
        poster && "flex-col gap-1.5",
        className,
      )}
    >
      {choice ? (
        <div
          className={cn(
            "flex min-w-0",
            page && "max-sm:flex-1",
            poster && "w-full",
          )}
        >
          {add}
          <GoesToChooser
            item={item}
            trigger={
              <Button
                size={size}
                aria-label={tr("requests.goesTo.change", {
                  name: item.title.name,
                  library,
                })}
                className={cn(
                  "border-l-primary-foreground/25 shrink-0 rounded-l-none",
                  page ? "px-2.5 max-sm:h-11" : "px-1.5",
                  poster && "shadow-lg shadow-black/30",
                )}
              >
                <ChevronDownIcon aria-hidden />
              </Button>
            }
          />
        </div>
      ) : (
        add
      )}
      <DeclinePopover
        item={item}
        open={declining}
        onOpenChange={setDeclining}
        onAnswer={(answer) => {
          setDeclining(false)
          hold({ ...answer, ids: [item.id], names: [item.title.name] })
          answered()
        }}
        trigger={
          <Button
            variant="ghost"
            size={size}
            className={cn(
              page &&
                "hover:bg-foreground/10 data-popup-open:bg-foreground/10 max-sm:h-11",
              poster && glass,
              look === "plain" && "hover:bg-muted data-popup-open:bg-muted",
            )}
          >
            {tr("requests.decline")}
          </Button>
        }
      />
    </div>
  )
}
