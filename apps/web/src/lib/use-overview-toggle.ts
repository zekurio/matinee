import { useEffect, useRef, useState } from "react"

type Pin = { top: number; height: number }

/**
 * More and Less for a hero's overview. The hero's art lines up with its
 * row, sitting on the bottom or stretched to its height, so a longer
 * overview would carry the art down or grow it. Expanding pins the art's
 * place and size until the overview collapses or the window changes size.
 */
export function useOverviewToggle<T extends HTMLElement>() {
  const artRef = useRef<T>(null)
  // Null while collapsed. Expanded, `pin` is where the art sat in its row
  // and how tall it was before expanding, or null once the art lets go.
  const [expanded, setExpanded] = useState<{ pin: Pin | null } | null>(null)
  const pin = expanded?.pin ?? null

  // A resize reflows the row, so the art stops holding its old spot.
  useEffect(() => {
    if (pin === null) return
    const unpin = () =>
      setExpanded((current) => (current ? { pin: null } : current))
    window.addEventListener("resize", unpin)
    return () => window.removeEventListener("resize", unpin)
  }, [pin])

  const toggle = () => {
    if (expanded) {
      setExpanded(null)
      return
    }
    const art = artRef.current?.getBoundingClientRect()
    const row = artRef.current?.parentElement?.getBoundingClientRect()
    setExpanded({
      pin: art && row ? { top: art.top - row.top, height: art.height } : null,
    })
  }

  return {
    expanded: expanded !== null,
    toggle,
    artRef,
    artClass: pin !== null ? "sm:self-start" : undefined,
    artStyle:
      pin !== null ? { marginTop: pin.top, height: pin.height } : undefined,
  }
}
