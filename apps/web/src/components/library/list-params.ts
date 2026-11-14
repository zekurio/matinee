import { getRouteApi } from "@tanstack/react-router"
import { useDeferredValue } from "react"

import { useUrlText } from "@/lib/use-url-text"

export const libraryRoute = getRouteApi("/_authed/_shell/libraries/$libraryId")

/**
 * The search box's text, mirrored into the URL's `q` after a pause so Back
 * from the player restores it. `query` is what to search for: the text
 * trimmed, deferred while typing.
 */
export function useSearchText(
  q: string | undefined,
  update: (patch: { q?: string }) => void,
) {
  const [search, setSearch] = useUrlText(q, (next) => update({ q: next }))
  const query = useDeferredValue(search.trim())
  return { search, setSearch, query }
}
