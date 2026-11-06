import { useCallback, useSyncExternalStore } from "react"

/** Whether a media query matches, kept current as the viewport changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Below Tailwind's `md`: phones, where settings fill the screen. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)")
}
