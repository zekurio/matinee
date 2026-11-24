import { follow } from "../realtime/follow"
import * as lifecycle from "../requests/lifecycle"
import { authed } from "./base"

export const adminRequests = {
  queue: authed.admin.requests.queue.handler(({ context, input }) =>
    lifecycle.queue(context.user, input),
  ),
  live: authed.admin.requests.live.handler(({ context, input, signal }) =>
    follow({
      topics: ["requests", "library", "fulfilment"],
      load: () => lifecycle.queue(context.user, input),
      signal,
    }),
  ),
  approve: authed.admin.requests.approve.handler(({ context, input }) =>
    lifecycle.moderate(context.user, [input.id], "approve", input.libraryId),
  ),
  approveAll: authed.admin.requests.approveAll.handler(({ context, input }) =>
    lifecycle.moderate(context.user, input.ids, "approve"),
  ),
  decline: authed.admin.requests.decline.handler(({ context, input }) =>
    lifecycle.decline(context.user, input.id, {
      operation: "decline",
      note: input.note,
    }),
  ),
  giveUp: authed.admin.requests.giveUp.handler(({ context, input }) =>
    lifecycle.decline(context.user, input.id, {
      operation: "giveUp",
      note: input.note,
    }),
  ),
  allowAgain: authed.admin.requests.allowAgain.handler(({ context, input }) =>
    lifecycle.reopen(context.user, input.id, "allowAgain"),
  ),
  addAfterAll: authed.admin.requests.addAfterAll.handler(({ context, input }) =>
    lifecycle.reopen(context.user, input.id, "addAfterAll"),
  ),
  retry: authed.admin.requests.retry.handler(({ context, input }) =>
    lifecycle.moderate(context.user, [input.id], "retry"),
  ),
}
