/**
 * A route's `shouldReload`: its loader runs when the route is entered or
 * preloaded, not on a navigation that stays on it. Opening settings over a
 * page is one: it changes only the history entry's state, and the router
 * ran every loader again for it, refetching whatever had gone stale under
 * the dialog. The loaders only start queries early; a page's queries
 * still refetch on their own when they mount stale.
 */
export function reloadOnEnter({
  cause,
}: {
  cause: "enter" | "stay" | "preload"
}): boolean {
  return cause !== "stay"
}
