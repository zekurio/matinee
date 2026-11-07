import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/shallow"

import { createRailStore } from "@/stores/browse-rail"

/**
 * A titled row of cards that scrolls sideways. Mice drag it or use the
 * arrow buttons, touch screens swipe, and keyboard users tab through the
 * cards.
 */
export function Rail({
  title,
  heading,
  action,
  startIndex = 0,
  children,
}: {
  title: string
  /** Shown in the header instead of the plain title, like a see-all link. */
  heading?: ReactNode
  action?: ReactNode
  /** The card that starts the row when it mounts. */
  startIndex?: number
  children: ReactNode
}) {
  const titleId = useId()
  const scroller = useRef<HTMLUListElement>(null)
  const [store] = useState(createRailStore)
  const { atStart, atEnd, dragging } = useStore(
    store,
    useShallow((state) => ({
      atStart: state.atStart,
      atEnd: state.atEnd,
      dragging: state.dragging,
    })),
  )
  const { measure, setDragging } = store.getState()

  // Before paint, so the row doesn't jump. The measure below picks it up.
  useLayoutEffect(() => {
    const el = scroller.current
    const card = el?.children[startIndex]
    if (!el || !card || startIndex === 0) return
    el.scrollLeft = cardStop(el, card)
  }, [startIndex])

  const handlers = useDragScroll(scroller, setDragging)

  // Whether the row can scroll changes with its size and its cards, and
  // neither tells React.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => measure(el)
    update()
    // The list keeps its size when cards arrive, say when skeletons give
    // way to data, so watch the cards as well as the box.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    const mutation = new MutationObserver(update)
    mutation.observe(el, { childList: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [measure])

  const scrollable = !(atStart && atEnd)

  const page = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" })
  }

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2
          id={titleId}
          className="min-w-0 truncate text-xl font-semibold tracking-tight"
        >
          {heading ?? title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div
            className={cn(
              "flex gap-1 [@media(pointer:coarse)]:hidden",
              !scrollable && "invisible",
            )}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${title} back`}
              disabled={atStart}
              onClick={() => page(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${title} forward`}
              disabled={atEnd}
              onClick={() => page(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>
      {/* Bleeds to the page edge on phones, so cards can scroll off it. */}
      <ul
        ref={scroller}
        onScroll={(event) => measure(event.currentTarget)}
        {...handlers}
        className={cn(
          "-mx-4 -my-1.5 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0 [&::-webkit-scrollbar]:hidden",
          // The cards ignore the pointer mid-drag, so hover effects stay
          // put and the cursor comes from the list.
          dragging && "cursor-grabbing select-none *:pointer-events-none",
        )}
      >
        {children}
      </ul>
    </section>
  )
}

/** How far the mouse moves before a press becomes a drag, in pixels. */
const DRAG_THRESHOLD = 5
/** How long the row keeps the release speed when it glides on, in ms. */
const GLIDE_MS = 250
/** The window of pointer moves the release speed is taken over, in ms. */
const VELOCITY_WINDOW_MS = 80

type Drag = {
  pointerId: number
  startX: number
  startLeft: number
  moved: boolean
  samples: { x: number; t: number }[]
}

/**
 * Lets a mouse or pen drag the row sideways, the way a finger swipes it.
 * On release the row glides on at the drag's speed and settles on a card.
 * A press that moves less than a few pixels stays a click. Says when a
 * drag starts and ends through `setDragging`.
 */
function useDragScroll(
  scroller: RefObject<HTMLUListElement | null>,
  setDragging: (dragging: boolean) => void,
) {
  const drag = useRef<Drag | null>(null)
  // The click that ends a drag lands on whatever card is under the mouse.
  const swallowClick = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    swallowClick.current = false
    const el = scroller.current
    // Touch scrolls natively, with the browser's own momentum.
    if (!el || event.pointerType === "touch" || event.button !== 0) return
    if (el.scrollWidth <= el.clientWidth) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: el.scrollLeft,
      moved: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const state = drag.current
    const el = scroller.current
    if (!state || !el || event.pointerId !== state.pointerId) return
    const dx = event.clientX - state.startX
    if (!state.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      state.moved = true
      // Captured only now, so a plain click still reaches its card.
      el.setPointerCapture(event.pointerId)
      // Snapping would fight every scrollLeft write below.
      el.style.scrollSnapType = "none"
      window.getSelection()?.removeAllRanges()
      setDragging(true)
    }
    el.scrollLeft = state.startLeft - dx
    state.samples = [
      ...state.samples.filter(
        (sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS,
      ),
      { x: event.clientX, t: event.timeStamp },
    ]
  }

  const onPointerEnd = (event: PointerEvent<HTMLUListElement>) => {
    const state = drag.current
    const el = scroller.current
    if (!state || event.pointerId !== state.pointerId) return
    drag.current = null
    if (!state.moved || !el) return
    swallowClick.current = true
    setDragging(false)

    const first = state.samples[0]
    const last = state.samples.at(-1)
    // A mouse held still before release carries no speed.
    const velocity =
      first &&
      last &&
      last.t > first.t &&
      event.timeStamp - last.t <= VELOCITY_WINDOW_MS
        ? (last.x - first.x) / (last.t - first.t)
        : 0
    const target = nearestStop(el, el.scrollLeft - velocity * GLIDE_MS)

    // Snapping comes back once the glide ends, unless a new drag began.
    const restoreSnap = () => {
      if (!drag.current?.moved) el.style.scrollSnapType = ""
    }
    if (Math.abs(target - el.scrollLeft) < 1) {
      restoreSnap()
      return
    }
    el.scrollTo({ left: target, behavior: "smooth" })
    if ("onscrollend" in el) {
      el.addEventListener("scrollend", restoreSnap, { once: true })
    } else {
      window.setTimeout(restoreSnap, 600)
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture: (event: MouseEvent<HTMLUListElement>) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    // Links and posters are draggable by default, which would hijack the
    // gesture.
    onDragStart: (event: DragEvent<HTMLUListElement>) => event.preventDefault(),
  }
}

/** The scroll position that starts the row at `card`, as snapping would. */
function cardStop(el: HTMLElement, card: Element) {
  const padding = Number.parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0
  return (
    el.scrollLeft +
    card.getBoundingClientRect().left -
    el.getBoundingClientRect().left -
    padding
  )
}

/** The card start, or the row's end, closest to `target`. */
function nearestStop(el: HTMLElement, target: number) {
  const max = el.scrollWidth - el.clientWidth
  let best = max
  for (const card of el.children) {
    const stop = Math.min(max, Math.max(0, cardStop(el, card)))
    if (Math.abs(stop - target) < Math.abs(best - target)) best = stop
  }
  return best
}

/**
 * One card in a rail. Widths step up with the screen, at about the density
 * of Jellyfin's home screen: a 16:9 card around 300px wide on a big monitor,
 * a 2:3 poster around 175px, a round portrait around 130px. On phones and
 * desktop, 16:9 cards also follow the window's height, so Home's first two
 * rows fit under the banner.
 */
export function RailItem({
  artwork = "landscape",
  children,
}: {
  artwork?: "landscape" | "poster" | "person"
  children: ReactNode
}) {
  return (
    <li
      className={cn(
        "shrink-0 snap-start",
        artwork === "landscape" &&
          "w-[min(80%,34svh)] sm:w-[300px] lg:w-[clamp(280px,30vh,360px)]",
        artwork === "poster" &&
          "w-[44%] sm:w-[176px] lg:w-[188px] 2xl:w-[204px]",
        artwork === "person" && "w-[28%] sm:w-[116px] lg:w-[128px]",
      )}
    >
      {children}
    </li>
  )
}
