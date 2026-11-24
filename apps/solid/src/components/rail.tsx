import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { ChevronLeft, ChevronRight } from "lucide"
import {
  createEffect,
  createSignal,
  createUniqueId,
  flush,
  onSettled,
  type ParentProps,
} from "solid-js"

import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"

/*
 * A titled row of cards that scrolls sideways past the page's gutter to
 * the content's edge, as the Flutter app's rails do. Mice drag it or use
 * the arrows by its heading, touch screens swipe, and keyboard users tab
 * through the cards.
 */

/**
 * Bleeds the row out over the page's gutter, so cards scroll off at the
 * content's edge rather than at the margin, and snap back to the margin.
 * The same steps as `pageGutter`.
 */
const bleed =
  "-mx-4 px-4 scroll-px-4 sm:-mx-6 sm:px-6 sm:scroll-px-6 xl:-mx-8 xl:px-8 xl:scroll-px-8"

/** A section's heading, the Flutter kit's `SectionTitle`. */
export const sectionTitle =
  "min-w-0 truncate text-xl font-semibold tracking-tight"

export function Rail(
  props: ParentProps<{
    title: string
    /** Shown in the header instead of the plain title, like a see-all link. */
    heading?: JSX.Element
    action?: JSX.Element
    ref?: (section: HTMLElement) => void
  }>,
) {
  const titleId = createUniqueId()
  let scroller: HTMLUListElement | undefined
  const [edges, setEdges] = createSignal(
    { atStart: true, atEnd: true },
    { equals: (a, b) => a.atStart === b.atStart && a.atEnd === b.atEnd },
  )
  const [dragging, setDragging] = createSignal(false)

  const measure = () => {
    const el = scroller
    // A row out of the page has no width; it keeps what it showed.
    if (!el || el.clientWidth === 0) return
    const max = el.scrollWidth - el.clientWidth
    // Within a pixel, for zoom levels that leave a fraction.
    setEdges({ atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 })
  }

  // Whether the row can scroll changes with its size and its cards, and
  // neither says so. The observer reports the box once it's laid out.
  onSettled(() => {
    const el = scroller
    if (!el) return
    const stopResize = onResize(el, measure)
    // Cards come in just before a paint, and reading the row's width then
    // would lay the page out an extra time; the frame after will do.
    let frame = 0
    const mutation = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    mutation.observe(el, { childList: true })
    return () => {
      stopResize()
      mutation.disconnect()
      cancelAnimationFrame(frame)
    }
  })

  const page = (direction: 1 | -1) => {
    const el = scroller
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" })
  }

  const drag = dragScroll(() => scroller, setDragging)

  return (
    <section ref={props.ref} aria-labelledby={titleId}>
      <div class="mb-3 flex items-center justify-between gap-4">
        <h2 id={titleId} class={sectionTitle}>
          {props.heading ?? props.title}
        </h2>
        <div class="flex shrink-0 items-center gap-1">
          {props.action}
          <div
            class={[
              "flex gap-1 [@media(pointer:coarse)]:hidden",
              { invisible: edges().atStart && edges().atEnd },
            ]}
          >
            <ArrowButton
              label={tr("media.rail.back", { title: props.title })}
              icon={ChevronLeft}
              disabled={edges().atStart}
              onClick={() => page(-1)}
            />
            <ArrowButton
              label={tr("media.rail.forward", { title: props.title })}
              icon={ChevronRight}
              disabled={edges().atEnd}
              onClick={() => page(1)}
            />
          </div>
        </div>
      </div>
      <ul
        ref={[
          (element) => (scroller = element),
          // Solid has no capture-phase prop; a listener of its own does it.
          (element) =>
            element.addEventListener("click", drag.onClickCapture, {
              capture: true,
            }),
        ]}
        onScroll={measure}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerEnd}
        onPointerCancel={drag.onPointerEnd}
        onDragStart={(event) => event.preventDefault()}
        class={[
          bleed,
          "-my-1.5 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto py-1.5 sm:gap-4 [&::-webkit-scrollbar]:hidden",
          // The cards ignore the pointer mid-drag, so hover effects stay
          // put and the cursor comes from the list.
          { "cursor-grabbing select-none *:pointer-events-none": dragging() },
        ]}
      >
        {props.children}
      </ul>
    </section>
  )
}

const arrowClass = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))

/**
 * The kit's small ghost icon button, as a plain button: a page has two per
 * rail, and the kit's takes several times as long to build.
 */
function ArrowButton(props: {
  label: string
  icon: typeof ChevronLeft
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      data-slot="button"
      type="button"
      disabled={props.disabled}
      data-disabled={props.disabled ? "" : undefined}
      aria-label={props.label}
      class={arrowClass}
      onClick={() => props.onClick()}
    >
      <Icon icon={props.icon} />
    </button>
  )
}

let resizeObserver: ResizeObserver | undefined
const resizeWatchers = new Map<Element, () => void>()

/**
 * Calls `measure` once `el` is laid out and whenever its size changes. The
 * rails and their reveal share one observer, so all of them read the
 * layout before any of them changes the page; their writes wait for Solid's
 * next flush. Observers of their own would each lay the page out again.
 */
function onResize(el: Element, measure: () => void) {
  resizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) resizeWatchers.get(entry.target)?.()
  })
  resizeWatchers.set(el, measure)
  resizeObserver.observe(el)
  return () => {
    resizeWatchers.delete(el)
    resizeObserver?.unobserve(el)
  }
}

/** How far past the window, as a share of its height, a held rail fills in. */
const REVEAL_MARGIN = 0.25

/**
 * Lets the rails of a long page hold back every card but the first until
 * the rail comes near the window. The first card sets the row's height, so
 * nothing moves when the rest come in. A rail fills in before the browser
 * paints it near the window: on its first layout, on a resize or a scroll,
 * and otherwise when an observer sees it come near, a frame later. Keyboard
 * focus anywhere on the page fills in every rail, so Tab goes card by card.
 * While the page is idle, held rails fill in a few cards at a time, so
 * find-in-page and a screen reader's browse mode reach every card.
 */
export type RailReveal = {
  /** Every rail shows all its cards from the start. */
  readonly eager: boolean
  /** Whether the page is in view; nothing is watched while it's kept out. */
  showing: () => boolean
  /** Calls `show` once `section` comes near the window, and stops watching. */
  watch: (section: Element, show: () => void) => () => void
  showAll: () => void
}

export function createRailReveal(
  eager: boolean,
  showing: () => boolean,
): RailReveal {
  const pending = new Map<Element, { reveal: () => void; stop: () => void }>()
  let intersect: IntersectionObserver | undefined

  const forget = (el: Element) => {
    pending.get(el)?.stop()
    pending.delete(el)
    intersect?.unobserve(el)
    if (pending.size === 0) removeEventListener("scroll", onScroll)
  }
  const show = (el: Element) => {
    const watch = pending.get(el)
    if (!watch) return
    forget(el)
    watch.reveal()
  }
  const near = (el: Element) => {
    if (!el.isConnected) return false
    const box = el.getBoundingClientRect()
    const margin = window.innerHeight * REVEAL_MARGIN
    return box.top < window.innerHeight + margin && box.bottom > -margin
  }
  // Applied at once, so the cards are in before this frame paints.
  const check = (targets: Element[]) => {
    const coming = targets.filter(near)
    for (const el of coming) show(el)
    if (coming.length > 0) flush()
  }
  const onScroll = () => check([...pending.keys()])

  onSettled(() => () => {
    for (const el of pending.keys()) forget(el)
    intersect?.disconnect()
  })

  // Rails out of the page come near nothing. Back in, each held rail's
  // observer reports its new size, which checks it.
  createEffect(showing, (shown) => {
    if (shown && pending.size > 0) {
      addEventListener("scroll", onScroll, { passive: true })
    } else removeEventListener("scroll", onScroll)
  })

  return {
    eager,
    showing,
    watch(section, reveal) {
      intersect ??= new IntersectionObserver(
        (entries) =>
          check(
            entries
              .filter((entry) => entry.isIntersecting)
              .map((entry) => entry.target),
          ),
        { rootMargin: `${REVEAL_MARGIN * 100}% 0px` },
      )
      if (pending.size === 0 && showing()) {
        addEventListener("scroll", onScroll, { passive: true })
      }
      // On its first layout and on a resize, before the paint.
      const stop = onResize(section, () => {
        if (near(section)) show(section)
      })
      pending.set(section, { reveal, stop })
      intersect.observe(section)
      return () => forget(section)
    },
    showAll() {
      if (pending.size === 0) return
      for (const el of pending.keys()) show(el)
      flush()
    },
  }
}

/** The cards a held rail adds each time the page is idle. */
const IDLE_STEP = 4

/**
 * A rail's part in a {@link RailReveal}: `ref` goes on the rail, and
 * `cards` cuts its list to the cards it holds. `list` is the rail's list,
 * or undefined while it loads.
 */
export function holdRail(
  reveal: RailReveal,
  list: () => readonly unknown[] | undefined,
) {
  const all = Number.POSITIVE_INFINITY
  const [count, setCount] = createSignal(reveal.eager ? all : 1)
  let section: HTMLElement | undefined
  let stop: (() => void) | undefined
  onSettled(() => {
    if (reveal.eager || !section) return
    stop = reveal.watch(section, () => setCount(all))
    return stop
  })
  // The next count to show when the page is next idle, one step at a time
  // so no step holds up a click.
  createEffect(
    () => {
      const shown = count()
      if (shown === all) return "done"
      const total = reveal.showing() ? (list()?.length ?? 0) : 0
      if (shown >= total) return "wait"
      return shown + IDLE_STEP >= total ? all : shown + IDLE_STEP
    },
    (next) => {
      if (next === "done") return stop?.()
      if (next === "wait" || !("requestIdleCallback" in window)) return
      const idle = requestIdleCallback(() => setCount(next))
      return () => cancelIdleCallback(idle)
    },
  )
  return {
    ref: (el: HTMLElement) => (section = el),
    cards: <T,>(items: readonly T[]) =>
      count() >= items.length ? items : items.slice(0, count()),
  }
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
 * A press that moves less than a few pixels stays a click.
 */
function dragScroll(
  scroller: () => HTMLElement | undefined,
  setDragging: (dragging: boolean) => void,
) {
  let drag: Drag | null = null
  // The click that ends a drag lands on whatever card is under the mouse.
  let swallowClick = false

  const onPointerDown = (event: PointerEvent) => {
    swallowClick = false
    const el = scroller()
    // Touch scrolls natively, with the browser's own momentum.
    if (!el || event.pointerType === "touch" || event.button !== 0) return
    if (el.scrollWidth <= el.clientWidth) return
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: el.scrollLeft,
      moved: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const state = drag
    const el = scroller()
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
      // The press focused the card under it, which would keep its hover
      // look up once the pointer leaves.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && el.contains(focused)) focused.blur()
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

  const onPointerEnd = (event: PointerEvent) => {
    const state = drag
    const el = scroller()
    if (!state || event.pointerId !== state.pointerId) return
    drag = null
    if (!state.moved || !el) return
    swallowClick = true
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
      if (!drag?.moved) el.style.scrollSnapType = ""
    }
    if (Math.abs(target - el.scrollLeft) < 1) {
      restoreSnap()
      return
    }
    el.scrollTo({ left: target, behavior: "smooth" })
    el.addEventListener("scrollend", restoreSnap, { once: true })
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onClickCapture: (event: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      event.preventDefault()
      event.stopPropagation()
    },
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
 * One card in a rail. Widths step up with the screen: a 16:9 card around
 * 300px wide on a big monitor, following the window's height from `lg` up
 * (`landscapeCardWidth` in `lib/showcase-layout.ts`), a 2:3 poster around 190px.
 *
 * Cards after the first skip their style, layout, and paint while they're
 * scrolled out of view, which most of a long row is. The first keeps the
 * row's height; the rest stretch to it. Their clip leaves room for a focus
 * ring.
 */
export function RailItem(
  props: ParentProps<{ artwork?: "landscape" | "poster" }>,
) {
  return (
    <li
      class={[
        "shrink-0 snap-start not-first:[contain-intrinsic-size:auto_0px] not-first:[content-visibility:auto] not-first:[overflow-clip-margin:8px]",
        (props.artwork ?? "landscape") === "landscape"
          ? "w-[min(80%,34svh)] sm:w-[300px] lg:w-[clamp(280px,30vh,360px)]"
          : "w-[44%] sm:w-[176px] lg:w-[188px] 2xl:w-[204px]",
      ]}
    >
      {props.children}
    </li>
  )
}
