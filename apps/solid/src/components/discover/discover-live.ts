import { createSignal, onSettled } from "solid-js"

/** Cards in a block. */
const BLOCK = 12
/** Blocks followed at once: the ones on screen and one either side. */
const MAX_BLOCKS = 6

/**
 * start and end are accessors for the card range to follow, [start, end).
 * Call track once under each row's owner and attach its return value as the ref.
 */
export function useOnScreenCards() {
  const [range, setRange] = createSignal<[number, number]>([0, 0])
  const cards = new Map<Element, () => number>()
  const onScreen = new Set<Element>()
  let observer: IntersectionObserver | undefined

  onSettled(() => () => observer?.disconnect())

  const watch = (element: Element) => {
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!cards.has(entry.target)) continue
          if (entry.isIntersecting) onScreen.add(entry.target)
          else onScreen.delete(entry.target)
        }
        const shown = [...onScreen].flatMap((card) => {
          const index = cards.get(card)
          return index ? [index()] : []
        })
        if (shown.length === 0) return
        const low = Math.min(...shown)
        const high = Math.max(...shown)
        const first = Math.floor(low / BLOCK)
        const last = Math.floor(high / BLOCK)
        // Keep the existing stream while it still covers the visible cards.
        setRange((old) => {
          if (low >= old[0] && high < old[1]) return old
          const from = Math.max(0, first - 1)
          const to = Math.min(last + 1, from + MAX_BLOCKS - 1)
          return [from * BLOCK, Math.min((to + 1) * BLOCK, cards.size)]
        })
      },
      { rootMargin: "25% 0px" },
    )
    observer.observe(element)
  }

  const track = (index: () => number) => {
    let current: HTMLElement | undefined
    onSettled(() => () => {
      if (!current) return
      observer?.unobserve(current)
      cards.delete(current)
      onScreen.delete(current)
    })
    return (element: HTMLElement) => {
      current = element
      cards.set(element, index)
      watch(element)
    }
  }

  return { track, start: () => range()[0], end: () => range()[1] }
}
