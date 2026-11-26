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

/** Wears the accent of the server in use, from the app's root. */
export function useServerAccent(state: () => AuthState) {
  // The server in use and whether it answered, so the accent isn't asked
  // for again on every change to the session.
  const reached = createMemo(
    () => {
      const current = state()
      if (current.kind === "noServer") return null
      return {
        server: current.server,
        kind: current.kind,
        adding: current.kind === "signedOut" && current.adding,
      }
    },
    {
      equals: (a, b) =>
        a?.server === b?.server &&
        a?.kind === b?.kind &&
        a?.adding === b?.adding,
    },
  )
  let asked = 0
  createEffect(reached, (current) => {
    const mine = ++asked
    // A server being added isn't the one in use yet: its color waits for the sign-in.
    if (current === null || current.adding) return
    const { server } = current
    wear(stored(server))
    if (current.kind === "signedOut") {
      // Its sign-in screen has the answer already.
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
