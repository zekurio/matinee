import { createEffect, createMemo, createSignal } from "solid-js"

type Pin = { top: number; height: number }

/**
 * More and Less for a hero's overview. The hero's art lines up with its
 * row, sitting on the bottom or stretched to its height, so a longer
 * overview would carry the art down or grow it. Expanding pins the art's
 * place and size until the overview collapses or the window changes size.
 */
// expanded, artClass and artStyle are accessors.
export function useOverviewToggle() {
  let element: HTMLElement | undefined
  // Null while collapsed. Expanded, `pin` is where the art sat in its row
  // and how tall it was before expanding, or null once the art lets go.
  const [expanded, setExpanded] = createSignal<{ pin: Pin | null } | null>(null)
  const pin = createMemo(() => expanded()?.pin ?? null)

  // A resize reflows the row, so the art stops holding its old spot.
  createEffect(pin, (current) => {
    if (current === null) return
    const unpin = () =>
      setExpanded((current) => (current ? { pin: null } : current))
    window.addEventListener("resize", unpin)
    return () => window.removeEventListener("resize", unpin)
  })

  const toggle = () => {
    if (expanded()) {
      setExpanded(null)
      return
    }
    const art = element?.getBoundingClientRect()
    const row = element?.parentElement?.getBoundingClientRect()
    setExpanded({
      pin: art && row ? { top: art.top - row.top, height: art.height } : null,
    })
  }

  return {
    expanded: () => expanded() !== null,
    toggle,
    artRef: (node: HTMLElement) => {
      element = node
    },
    artClass: () => (pin() !== null ? "sm:self-start" : undefined),
    artStyle: () => {
      const current = pin()
      return current
        ? { "margin-top": `${current.top}px`, height: `${current.height}px` }
        : undefined
    },
  }
}
