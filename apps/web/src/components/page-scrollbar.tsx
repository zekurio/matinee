import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { type PointerEvent, useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/shallow"

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
  const mouse = useMediaQuery(MOUSE_QUERY)
  return mouse ? <OverlayScrollbar /> : null
}

function OverlayScrollbar() {
  const thumb = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; scroll: number } | null>(null)
  const [store] = useState(createScrollbarStore)
  const { scrollable, scrolling, dragging } = useStore(
    store,
    useShallow((state) => ({
      scrollable: state.scrollable,
      scrolling: state.scrolling,
      dragging: state.dragging,
    })),
  )
  const { setScrollable, scrolled, setDragging, stop } = store.getState()

  // Follows the window's scroll position and the page's height.
  useEffect(() => {
    let frame = 0
    // Writes the thumb's style directly, so scrolling doesn't re-render.
    const paint = () => {
      frame = 0
      const { size, travel, maxScroll } = geometry()
      setScrollable(maxScroll > 1)
      const el = thumb.current
      if (!el) return
      const offset = maxScroll > 0 ? (window.scrollY / maxScroll) * travel : 0
      el.style.height = `${size}px`
      el.style.transform = `translateY(${Math.min(travel, Math.max(0, offset))}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onScroll = () => {
      schedule()
      scrolled()
    }
    paint()
    // The body grows and shrinks with the page's content.
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", schedule)
    }
  }, [setScrollable, scrolled, stop])

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { y: event.clientY, scroll: window.scrollY }
    setDragging(true)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    const { travel, maxScroll } = geometry()
    if (travel <= 0) return
    const top = start.scroll + ((event.clientY - start.y) * maxScroll) / travel
    window.scrollTo({ top, behavior: "instant" })
  }
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }
  // A click on the track pages toward the pointer, like a native scrollbar.
  const pageToward = (event: PointerEvent<HTMLDivElement>) => {
    const el = thumb.current
    if (event.button !== 0 || !el) return
    const { top } = el.getBoundingClientRect()
    const direction = event.clientY < top ? -1 : 1
    window.scrollBy({
      top: direction * window.innerHeight * 0.9,
      behavior: "smooth",
    })
  }

  return (
    <div
      aria-hidden
      onPointerDown={pageToward}
      className={cn(
        "group/scrollbar fixed inset-y-0 right-0 z-40 w-3",
        !scrollable && "pointer-events-none invisible",
      )}
    >
      <div
        ref={thumb}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ top: INSET }}
        className={cn(
          "bg-foreground/25 hover:bg-foreground/40 absolute right-0.5 w-1.5 rounded-full transition-[opacity,width,background-color] duration-200 group-hover/scrollbar:w-2 motion-reduce:transition-none",
          dragging && "bg-foreground/40 w-2",
          scrolling || dragging
            ? "opacity-100"
            : "opacity-0 group-hover/scrollbar:opacity-100",
        )}
      />
    </div>
  )
}
