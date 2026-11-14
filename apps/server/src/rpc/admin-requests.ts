import { follow } from "../realtime/follow"
import * as lifecycle from "../requests/lifecycle"
import { admin } from "./base"

export const adminRequests = {
  queue: admin.admin.requests.queue.handler(({ context, input }) =>
    lifecycle.queue(context.user, input),
  ),
  live: admin.admin.requests.live.handler(({ context, input, signal }) =>
    follow({
      topics: ["requests", "library", "fulfilment"],
      load: () => lifecycle.queue(context.user, input),
      signal,
    }),
  ),
  approve: admin.admin.requests.approve.handler(({ context, input }) =>
    lifecycle.moderate(context.user, [input.id], "approve", input.libraryId),
  ),
  approveAll: admin.admin.requests.approveAll.handler(({ context, input }) =>
    lifecycle.moderate(context.user, input.ids, "approve"),
  ),
  decline: admin.admin.requests.decline.handler(({ context, input }) =>
    lifecycle.decline(context.user, input.id, {
      operation: "decline",
      reason: input.reason,
      note: input.note,
    }),
  ),
  giveUp: admin.admin.requests.giveUp.handler(({ context, input }) =>
    lifecycle.decline(context.user, input.id, {
      operation: "giveUp",
      note: input.note,
    }),
  ),
  allowAgain: admin.admin.requests.allowAgain.handler(({ context, input }) =>
    lifecycle.reopen(context.user, input.id, "allowAgain"),
  ),
  addAfterAll: admin.admin.requests.addAfterAll.handler(({ context, input }) =>
    lifecycle.reopen(context.user, input.id, "addAfterAll"),
  ),
  retry: admin.admin.requests.retry.handler(({ context, input }) =>
    lifecycle.moderate(context.user, [input.id], "retry"),
  ),
}
