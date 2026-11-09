import { setServerThemeAccents } from "@matinee/ui/lib/theme"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"

import { orpc } from "./rpc"

/** Applies the server's accents for the Matinee theme, signed in or not. */
export function ServerThemeAccents() {
  const config = useQuery(orpc.auth.config.queryOptions())
  const accents = config.data?.themeAccents
  // Hands each config's accents to the theme engine, which paints them.
  useEffect(() => {
    if (accents) setServerThemeAccents(accents)
  }, [accents])
  return null
}
