import { useRouter } from "@tanstack/solid-router"
import { createSignal, onSettled } from "solid-js"

/** Where the furthest entry is kept, so a reload mid-history still knows it. */
const FURTHEST_KEY = "matinee.history.furthest"

function readFurthest(): number {
  try {
    return Number(window.sessionStorage.getItem(FURTHEST_KEY) ?? -1)
  } catch {
    return -1
  }
}

function writeFurthest(index: number) {
  try {
    window.sessionStorage.setItem(FURTHEST_KEY, String(index))
  } catch {
    // Storage that's blocked: Forward forgets on reload.
  }
}

/**
 * Whether Back and Forward lead anywhere, as a desktop app's buttons show
 * it. The browser says neither, so this follows the router's history: the
 * entry it's on, and the furthest one ahead of it that a push hasn't cut
 * off.
 */
export function useHistorySteps() {
  const history = useRouter().history
  const at = () => history.location.state.__TSR_index
  const [steps, setSteps] = createSignal({
    index: at(),
    furthest: Math.max(at(), readFurthest()),
  })
  onSettled(() =>
    history.subscribe(({ action }) => {
      const index = at()
      setSteps((last) => {
        // A new entry drops whatever was ahead.
        const furthest =
          action.type === "PUSH" ? index : Math.max(last.furthest, index)
        writeFurthest(furthest)
        return { index, furthest }
      })
    }),
  )
  return {
    canGoBack: () => steps().index > 0,
    canGoForward: () => steps().furthest > steps().index,
    back: () => history.back(),
    forward: () => history.forward(),
  }
}
