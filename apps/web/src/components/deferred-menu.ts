import { type FocusEvent, type PointerEvent, useState } from "react"

/** How a deferred menu mounted: open at once, and whether its trigger takes focus. */
type Mounted = { open: boolean; focus: boolean }

function focusOnMount(element: HTMLElement | null) {
  element?.focus()
}

/**
 * Puts off mounting a menu, with the dialogs and queries that come with
 * it, until someone reaches for its button. A card has a menu or two, and
 * a page has dozens of cards, so mounting them closed made up most of what
 * a card cost to render.
 *
 * Until then the button renders bare, with `bare` spread on it. A mouse
 * over it, or keyboard focus on it, mounts the menu closed with the same
 * button as its trigger, so the press lands on the real one; `focusRef` on
 * the trigger hands the focus over. A press that comes first, as a tap
 * does with no hover before it, mounts the menu open.
 */
export function useDeferredMenu() {
  const [mounted, setMounted] = useState<Mounted | null>(null)
  return {
    mounted: mounted !== null,
    defaultOpen: mounted?.open ?? false,
    focusRef: mounted?.focus ? focusOnMount : undefined,
    bare: {
      "aria-haspopup": "menu",
      "aria-expanded": false,
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        // A tap's pointer arrives with its press, too late to swap the
        // button under it; its click opens the menu instead.
        if (event.pointerType === "touch") return
        setMounted({ open: false, focus: false })
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        // Focus from a press is followed by its click, which opens.
        if (!event.currentTarget.matches(":focus-visible")) return
        setMounted({ open: false, focus: true })
      },
      onClick: () => setMounted({ open: true, focus: false }),
    } as const,
  }
}
