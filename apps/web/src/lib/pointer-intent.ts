/** How long after the last scroll something under the pointer got there by scrolling, in ms. */
const SETTLE_MS = 200

let scrolledAt = Number.NEGATIVE_INFINITY
const scrolled = () => {
  scrolledAt = performance.now()
}
// Capturing, so a rail that scrolls sideways counts as the page does. The
// wheel too: its scroll event comes a frame later, after the browser has
// already said what the pointer is over now.
addEventListener("scroll", scrolled, { capture: true, passive: true })
addEventListener("wheel", scrolled, { capture: true, passive: true })

/**
 * Runs `work` once the pointer has rested on something for `delay` ms, to
 * load ahead what a click there would need. A card that scrolls under a
 * pointer hasn't been pointed at, so the wait holds on while the page
 * moves. Without that, scrolling a grid loads a title for every row that
 * passes.
 */
export function pointerIntent(work: () => void, delay: () => number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let target: Element | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const due = () => {
    timer = undefined
    // A windowed grid takes rows out as they scroll by, and a card that
    // has left the page isn't one to load for.
    if (target?.isConnected !== true) return
    const wait = SETTLE_MS - (performance.now() - scrolledAt)
    if (wait > 0) {
      timer = setTimeout(due, wait)
      return
    }
    work()
  }
  return {
    /** The pointer or the focus came to it. */
    enter: (event: { currentTarget: Element }) => {
      target = event.currentTarget
      timer ??= setTimeout(due, delay())
    },
    /** It left, or the click came first. */
    cancel,
  }
}
