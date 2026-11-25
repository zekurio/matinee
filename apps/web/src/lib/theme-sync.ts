import { setServerThemeAccents } from "@matinee/ui/lib/theme"
import { useQuery } from "@tanstack/solid-query"
import { createEffect, snapshot } from "solid-js"

import { orpc } from "./rpc"

/** Applies the server's accents for the Matinee theme, signed in or not. */
export function ServerThemeAccents() {
  const config = useQuery(() => orpc.auth.config.queryOptions())
  // Hands each config's accents to the theme engine, which paints them.
  createEffect(
    () => {
      // Read in the compute, as the engine reads plain objects.
      const accents = config.data?.themeAccents
      return accents ? snapshot(accents) : undefined
    },
    (accents) => {
      if (accents) setServerThemeAccents(accents)
    },
  )
  return null
}
