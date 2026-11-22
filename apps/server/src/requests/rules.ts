import type { Availability, RequestLimit } from "@matinee/contracts"

import { can, type Viewer } from "../access/viewer"

const DAY = 86400000

/** Rolling usage counts the asks of requests that aren't declined. */
export function requestLimit(
  limit: RequestLimit,
  asks: Date[],
  now = new Date(),
): Availability["limit"] {
  if (!limit) return null
  const active = asks
    .filter((date) => date.getTime() > now.getTime() - limit.days * DAY)
    .sort((a, b) => a.getTime() - b.getTime())
  return {
    left: Math.max(0, limit.titles - active.length),
    resetsAt: new Date(
      (active[Math.max(0, active.length - limit.titles)]?.getTime() ??
        now.getTime()) +
        limit.days * DAY,
    ),
  }
}

/**
 * Whether the one person who asked may still take an approved request
 * back: nothing has been sent for it. This is what makes "Undo" work for
 * someone whose asks need no approval.
 */
export function undoable(
  row: {
    status: "asked" | "approved" | "declined"
    fulfilmentState: "queued" | "sent" | "failed" | null
    sentAt: Date | null
  },
  askers: number,
): boolean {
  return (
    row.status === "approved" &&
    row.fulfilmentState === "queued" &&
    row.sentAt === null &&
    askers === 1
  )
}

/** Used by mutations too. Cancelling does not spend quota. */
export function requestAction(
  viewer: Viewer,
  input: {
    destination: boolean
    /**
     * An admin declined the title's request. That closes the title for
     * everyone, whatever part of it they'd ask for, until an admin lifts
     * the decline.
     */
    declined: boolean
    limit: Availability["limit"]
    status: "asked" | "approved" | "declined" | null
    asked: boolean
    here: boolean
    /** See `undoable`. */
    undoable?: boolean
    /** Extending an existing title costs no second title debit. */
    existingTitle?: boolean
    approvedTitle?: boolean
  },
): Pick<Availability, "action" | "disabledReason"> {
  if (input.here) return { action: null, disabledReason: null }
  if (input.declined) return { action: null, disabledReason: "declined" }
  if (input.status === "asked" || input.status === "approved") {
    // Someone who asked can take the ask back until it is approved, or
    // until an approved one is sent, and after that only an admin removes
    // it. Everyone else has nothing to do with a title already requested.
    const action =
      input.asked && (input.status === "asked" || input.undoable)
        ? "cancel"
        : null
    return { action, disabledReason: null }
  }
  const disabledReason = !input.destination
    ? "noDestination"
    : !can(viewer, "request.create")
      ? "off"
      : input.limit?.left === 0 && !input.existingTitle
        ? "limit"
        : null
  return {
    action: disabledReason
      ? null
      : can(viewer, "request.autoApprove") || input.approvedTitle
        ? "add"
        : "ask",
    disabledReason,
  }
}
