import { Button } from "@matinee/ui/components/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

/**
 * A titled row of cards that scrolls sideways, with arrow buttons for
 * mouse users. Touch screens swipe; keyboard users tab through the cards.
 */
export function Rail({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  const scroller = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

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
          className="truncate text-lg font-semibold tracking-tight"
        >
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div className="flex gap-1 [@media(pointer:coarse)]:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${title} back`}
              disabled={edges.start}
              onClick={() => page(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${title} forward`}
              disabled={edges.end}
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
        onScroll={measure}
        className="-mx-4 -my-1.5 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  )
}

/** One card in a rail. Widths step up with the screen. */
export function RailItem({ children }: { children: ReactNode }) {
  return (
    <li className="w-[44%] shrink-0 snap-start sm:w-[260px] lg:w-[268px]">
      {children}
    </li>
  )
}
