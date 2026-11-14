import * as lifecycle from "../requests/lifecycle"
import { liveRequests } from "../requests/live"
import { authed } from "./base"
import { catalogFailure } from "./catalog-errors"

export const requests = {
  live: authed.requests.live.handler(({ context, input, signal }) =>
    liveRequests(context.user, input.titles, signal),
  ),
  ask: authed.requests.ask.handler(({ context, input }) =>
    lifecycle.ask(context.user, input).catch(catalogFailure),
  ),
  addSeasons: authed.requests.addSeasons.handler(({ context, input }) =>
    lifecycle.addSeasons(context.user, input).catch(catalogFailure),
  ),
  cancel: authed.requests.cancel.handler(({ context, input }) =>
    lifecycle.membership(context.user, input.id, "cancel"),
  ),
  follow: authed.requests.follow.handler(({ context, input }) =>
    lifecycle.membership(context.user, input.id, "follow"),
  ),
  unfollow: authed.requests.unfollow.handler(({ context, input }) =>
    lifecycle.membership(context.user, input.id, "unfollow"),
  ),
  mine: authed.requests.mine.handler(({ context, input }) =>
    lifecycle.mine(context.user, input),
  ),
}
