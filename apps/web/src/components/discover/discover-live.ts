import { useCallback, useEffect, useRef, useState } from "react"

/*
 * A row's grid can hold hundreds of cards, and the stream of what changed
 * takes at most a hundred titles, each of which the server checks again
 * on every change. So the grid follows only the cards around the screen,
 * in blocks, and the stream opens again only when the reader scrolls into
 * another block.
 */

/** Cards in a block. */
const BLOCK = 12
/** Blocks followed at once: the ones on screen and one either side. */
const MAX_BLOCKS = 6

/**
 * The cards of a long grid worth following, as `[start, end)`. Give each
 * card `track(index)` as its ref.
 */
export function useOnScreenCards() {
  // Cards, not blocks: a window set when the grid had fewer cards keeps
  // its end, so a new page under it doesn't open the stream again.
  const [range, setRange] = useState<[number, number]>([0, 0])
  // How many cards there are, from their refs.
  const cards = useRef(new Set<number>())
  const onScreen = useRef(new Set<number>())
  const indexes = useRef(new WeakMap<Element, number>())
  const observer = useRef<IntersectionObserver | null>(null)
  const refs = useRef(new Map<number, (el: HTMLElement | null) => void>())

  // What's on screen changes as the page scrolls, and only the browser
  // knows. The cards' refs make the observer, since they run before any
  // effect; this lets it go when the grid does.
  useEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
    },
    [],
  )

  const watch = useCallback((el: Element) => {
    observer.current ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = indexes.current.get(entry.target)
          if (index === undefined) continue
          if (entry.isIntersecting) onScreen.current.add(index)
          else onScreen.current.delete(index)
        }
        if (onScreen.current.size === 0) return
        const shown = [...onScreen.current]
        const low = Math.min(...shown)
        const high = Math.max(...shown)
        const first = Math.floor(low / BLOCK)
        const last = Math.floor(high / BLOCK)
        // Stays put while what's on screen is inside it, so scrolling
        // within the followed blocks doesn't open the stream again.
        setRange((old) => {
          if (low >= old[0] && high < old[1]) return old
          const from = Math.max(0, first - 1)
          const to = Math.min(last + 1, from + MAX_BLOCKS - 1)
          return [from * BLOCK, Math.min((to + 1) * BLOCK, cards.current.size)]
        })
      },
      // A little past the edges, so a block is followed before it shows.
      { rootMargin: "25% 0px" },
    )
    observer.current.observe(el)
  }, [])

  const track = useCallback(
    (index: number) => {
      let ref = refs.current.get(index)
      if (!ref) {
        let current: HTMLElement | null = null
        ref = (el) => {
          if (current) {
            observer.current?.unobserve(current)
            onScreen.current.delete(index)
            cards.current.delete(index)
          }
          current = el
          if (el) {
            indexes.current.set(el, index)
            cards.current.add(index)
            watch(el)
          }
        }
        refs.current.set(index, ref)
      }
      return ref
    },
    [watch],
  )

  return { track, start: range[0], end: range[1] }
}
