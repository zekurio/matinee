import { useRouterState } from "@tanstack/solid-router"
import { createEffect, createMemo, createSignal, onSettled } from "solid-js"

import { tr } from "@/i18n"
import { toast } from "@/kit/toast"
import { watchForNewBuild } from "@/lib/new-build"

const TOAST_ID = "new-build"
/** The player, which a toast must not cover. A party plays there too. */
const PLAYER_ROUTE = "/_authed/watch/$itemId"

/**
 * Offers to reload once the server has a newer build than this tab, in one
 * toast that stays until it's answered. While the player is open the toast
 * waits, and it shows when the player closes. Each build is offered once:
 * a dismissed one doesn't come back, but a later one does. The root route
 * calls it.
 */
export function useNewBuildNotice() {
  const [build, setBuild] = createSignal<string | null>(null)
  const playing = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === PLAYER_ROUTE),
  })
  onSettled(() => watchForNewBuild(setBuild))
  const offered = createMemo(() => (playing() ? null : build()))

  /** The build the toast is up for. */
  let showing: string | null = null
  /** The last build someone closed the toast for. */
  let dismissed: string | null = null
  createEffect(offered, (next) => {
    if (next === showing) return
    if (next === null || next === dismissed) {
      // Cleared first, so the dismissal this causes isn't taken as theirs.
      showing = null
      toast.dismiss(TOAST_ID)
      return
    }
    showing = next
    toast.info(tr("shell.newBuild.title"), {
      id: TOAST_ID,
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: tr("shell.newBuild.reload"),
        onClick: () => location.reload(),
      },
      onDismiss: () => {
        if (showing !== next) return
        showing = null
        dismissed = next
      },
    })
  })
}
