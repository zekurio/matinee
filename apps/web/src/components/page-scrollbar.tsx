import { onSettled, Show } from "solid-js"

import { mediaQuery } from "@/lib/viewport"
import { createScrollbarStore } from "@/stores/shell-scrollbar"

// Keep in sync with the globals.css query that hides the native scrollbar.
const MOUSE_QUERY = "(hover: hover) and (pointer: fine)"
const MIN_THUMB = 40
// Gap between the thumb's ends and the window's top and bottom.
const INSET = 2

function geometry() {
  const viewport = window.innerHeight
  const content = document.documentElement.scrollHeight
  const track = viewport - INSET * 2
  const size = Math.max(MIN_THUMB, (track * viewport) / Math.max(content, 1))
  return {
    size,
    travel: Math.max(0, track - size),
    maxScroll: Math.max(0, content - viewport),
  }
}

/**
 * The window's scrollbar, drawn over the content so it takes no room. The
 * native one is hidden for mouse users in globals.css. It shows while the
 * page scrolls or the pointer is at the window's right edge, and drags like
 * the real thing. Keyboard and wheel scrolling stay native.
 */
export function PageScrollbar() {
  return (
    <Show when={mediaQuery(MOUSE_QUERY)()}>
      <OverlayScrollbar />
    </Show>
  )
}

function OverlayScrollbar() {
  let thumb: HTMLDivElement | undefined
  let drag: { y: number; scroll: number } | null = null
  const store = createScrollbarStore()

  // Follows the window's scroll position and the page's height.
  onSettled(() => {
    let frame = 0
    // Writes the thumb's style directly, so scrolling doesn't re-render.
    const paint = () => {
      frame = 0
      const { size, travel, maxScroll } = geometry()
      store.setScrollable(maxScroll > 1)
      if (!thumb) return
      const offset = maxScroll > 0 ? (window.scrollY / maxScroll) * travel : 0
      thumb.style.height = `${size}px`
      thumb.style.transform = `translateY(${Math.min(travel, Math.max(0, offset))}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onScroll = () => {
      schedule()
      store.scrolled()
    }
    paint()
    // The body grows and shrinks with the page's content.
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      store.stop()
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", schedule)
    }
  })

  const startDrag = (
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag = { y: event.clientY, scroll: window.scrollY }
    store.setDragging(true)
  }
  const moveDrag = (event: PointerEvent) => {
    const start = drag
    if (!start) return
    const { travel, maxScroll } = geometry()
    if (travel <= 0) return
    const top = start.scroll + ((event.clientY - start.y) * maxScroll) / travel
    window.scrollTo({ top, behavior: "instant" })
  }
  const endDrag = () => {
    drag = null
    store.setDragging(false)
  }
  // A click on the track pages toward the pointer, like a native scrollbar.
  const pageToward = (event: PointerEvent) => {
    if (event.button !== 0 || !thumb) return
    const { top } = thumb.getBoundingClientRect()
    const direction = event.clientY < top ? -1 : 1
    window.scrollBy({
      top: direction * window.innerHeight * 0.9,
      behavior: "smooth",
    })
  }

  return (
    <div
      aria-hidden="true"
      onPointerDown={pageToward}
      class={[
        "group/scrollbar fixed inset-y-0 right-0 z-40 w-3",
        { "pointer-events-none invisible": !store.scrollable() },
      ]}
    >
      <div
        ref={(element) => (thumb = element)}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ top: `${INSET}px` }}
        class={[
          "bg-foreground/25 hover:bg-foreground/40 absolute right-0.5 w-1.5 rounded-full transition-[opacity,width,background-color] duration-200 group-hover/scrollbar:w-2 motion-reduce:transition-none",
          { "bg-foreground/40 w-2": store.dragging() },
          store.scrolling() || store.dragging()
            ? "opacity-100"
            : "opacity-0 group-hover/scrollbar:opacity-100",
        ]}
      />
    </div>
  )
}
