import type { Dialog } from "@base-ui/react/dialog"
import { type Ref, type RefCallback, useCallback, useRef } from "react"

type FinalFocus = Dialog.Popup.Props["finalFocus"]

/**
 * Where a popup puts focus when it closes. Base UI hands it back to
 * whatever opened the popup, and a browser draws the ring on an element
 * focused right after a key press. So a click and then Escape left a ring
 * on the button that was clicked, and that button kept focus, so Space
 * pressed it again instead of scrolling.
 *
 * Focus goes back only to an opener that showed a ring as the popup
 * opened: keyboard users land where they were, and after a click focus
 * stays where it falls. A `finalFocus` passed in wins.
 *
 * For popups that unmount when closed. The opener is read as the popup
 * element mounts, before Base UI moves focus into it.
 */
export function useReturnFocus<T extends Element>(
  ref: Ref<T> | undefined,
  finalFocus: FinalFocus,
) {
  const popup = useRef<T | null>(null)
  const openerRing = useRef(false)

  const popupRef = useCallback(
    (node: T | null) => {
      popup.current = node
      const opener = document.activeElement
      if (node && !node.contains(opener)) {
        openerRing.current = opener?.matches(":focus-visible") ?? false
      }
      return assignRef(ref, node)
    },
    [ref],
  )

  const returnFocus = useCallback(() => {
    if (!openerRing.current) return false
    // Focus already moved on, say into a dialog an item opened. Base UI
    // leaves it there when `finalFocus` is `true`, but not for a function.
    const active = document.activeElement
    return (
      !active ||
      active === document.body ||
      (popup.current?.contains(active) ?? false)
    )
  }, [])

  return { ref: popupRef, finalFocus: finalFocus ?? returnFocus }
}

function assignRef<T>(
  ref: Ref<T> | undefined,
  node: T | null,
): ReturnType<RefCallback<T>> {
  if (!ref) return
  if ("current" in ref) ref.current = node
  else return ref(node)
}
