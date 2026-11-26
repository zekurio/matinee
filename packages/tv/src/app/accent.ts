import type { ThemeAccents } from "@matinee/contracts"
import { colorOr } from "@matinee/ui/lib/theme-color-math"
import { withThemeAccent } from "@matinee/ui/lib/theme-colors"
import { MATINEE_THEME } from "@matinee/ui/lib/theme-presets"
import { createEffect, createMemo } from "solid-js"

import type { AuthState } from "../auth/session"
import { session } from "../auth/session"
import { isText } from "../lib/decode"
import { readStored, writeStored } from "../lib/storage"

/*
 * The accent an admin picked for the server (`auth.config`'s
 * `themeAccents`), as the web and the Flutter app wear it. The TV is
 * always dark, so it takes the dark one, fitted to the dark background as
 * the web fits it. A server with none keeps Matinee's own, in kit.css.
 *
 * It is the accent of the server on screen: the one in use, or the one
 * whose sign-in shows while it's being added.
 *
 * Each server's last answer is kept on the TV, so its color shows at once
 * on the next start and stays while the server can't be reached. The
 * server is asked again whenever the one in use changes or is reached.
 */

const STORED_PREFIX = "matinee.accent."
const PROPERTIES = ["--accent", "--accent-rgb", "--accent-fg"] as const

/** Wears `seed` as the accent, or Matinee's own for null. */
function wear(seed: string | null) {
  const root = document.documentElement.style
  if (seed === null) {
    for (const property of PROPERTIES) root.removeProperty(property)
    return
  }
  const colors = withThemeAccent(MATINEE_THEME.dark, seed)
  const accent = colorOr(colors.accent, seed)
  root.setProperty("--accent", colors.accent)
  root.setProperty("--accent-rgb", `${accent.r}, ${accent.g}, ${accent.b}`)
  root.setProperty("--accent-fg", colors.accentForeground)
}

function stored(server: string): string | null {
  const value = readStored(STORED_PREFIX + server)
  return isText(value) ? value : null
}

/** Wears the server's accent and keeps it for the next start. */
function keep(server: string, accents: ThemeAccents) {
  writeStored(STORED_PREFIX + server, accents.dark)
  wear(accents.dark)
}

/** Wears the accent of the server on screen, from the app's root. */
export function useServerAccent(state: () => AuthState) {
  // The server on screen and whether it answered, so the accent isn't asked
  // for again on every change to the session.
  const reached = createMemo(
    () => {
      const current = state()
      if (current.kind === "noServer") return null
      return { server: current.server, kind: current.kind }
    },
    { equals: (a, b) => a?.server === b?.server && a?.kind === b?.kind },
  )
  let asked = 0
  createEffect(reached, (current) => {
    const mine = ++asked
    // With no server on screen, as while picking one, the accent is Matinee's own.
    if (current === null) {
      wear(null)
      return
    }
    const { server } = current
    wear(stored(server))
    if (current.kind === "signedOut") {
      // Its sign-in screen has the answer already, and wears it: the
      // screen is that server's, one being added as much as the one in use.
      const now = session.state
      if (now.kind === "signedOut") keep(server, now.config.themeAccents)
      return
    }
    if (current.kind !== "signedIn") return
    void session.api.auth.config().then(
      (config) => {
        if (mine === asked) keep(server, config.themeAccents)
      },
      () => {
        // Unanswered: the kept accent stays.
      },
    )
  })
}
