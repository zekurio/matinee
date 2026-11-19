/*
 * Scrolling follows focus. Nothing here scrolls by wheel or by drag: what
 * scrolls is marked `data-scroll`, clips what it holds, and moves when a
 * leaf inside it takes focus, by its kind:
 *
 * - `row`: sideways, only as far as it takes to show the leaf clear of
 *   both edges, by `data-scroll-start` and `data-scroll-end`.
 * - `pin`: down a page of rows, so the focused leaf always sits
 *   `data-scroll-pivot` below the top, whichever row it's in. A leaf
 *   inside something marked `data-scroll-home` takes the page back to its
 *   top instead, as a page's header does.
 * - `grid`: down a grid by whole rows, so none is ever cut off at the top.
 * - `near`: up or down, only as far as it takes to show the leaf.
 *
 * Lengths in the attributes are in the design's units, 960 to the
 * screen's width, as everywhere in the styles.
 */

/** The pixels in one of the design's units. */
export function unit(): number {
  return window.innerWidth / 960
}

const GLIDE_MS = 220

type Glide = { frame: number; to: number }

const glides = new WeakMap<HTMLElement, { x?: Glide; y?: Glide }>()

function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3
}

/** Scrolls `scroller` to `target` along one axis, gliding unless `instant`. */
function scrollAxis(
  scroller: HTMLElement,
  axis: "x" | "y",
  target: number,
  instant: boolean,
) {
  const property = axis === "x" ? "scrollLeft" : "scrollTop"
  const limit =
    axis === "x"
      ? scroller.scrollWidth - scroller.clientWidth
      : scroller.scrollHeight - scroller.clientHeight
  const to = Math.max(0, Math.min(Math.round(target), Math.max(0, limit)))
  const running = glides.get(scroller) ?? {}
  glides.set(scroller, running)
  const previous = running[axis]
  if (previous) cancelAnimationFrame(previous.frame)
  const from = scroller[property]
  if (instant || Math.abs(to - from) < 2) {
    scroller[property] = to
    running[axis] = undefined
    return
  }
  const started = performance.now()
  const glide: Glide = { frame: 0, to }
  const tick = (now: number) => {
    const progress = Math.min(1, (now - started) / GLIDE_MS)
    scroller[property] = from + (to - from) * easeOut(progress)
    if (progress < 1) glide.frame = requestAnimationFrame(tick)
    else running[axis] = undefined
  }
  glide.frame = requestAnimationFrame(tick)
  running[axis] = glide
}

/**
 * Where `scroller` is headed along an axis: where its glide ends, or where
 * it rests. A second arrow press mid-glide counts from there, rather than
 * from wherever the glide happens to be.
 */
function headed(scroller: HTMLElement, axis: "x" | "y"): number {
  const glide = glides.get(scroller)?.[axis]
  if (glide) return glide.to
  return axis === "x" ? scroller.scrollLeft : scroller.scrollTop
}

function lengthOf(scroller: HTMLElement, name: string, fallback = 0): number {
  const value = Number.parseFloat(scroller.getAttribute(name) ?? "")
  return (Number.isFinite(value) ? value : fallback) * unit()
}

/** Where `leaf` sits in what `scroller` holds, along each axis. */
function placeIn(scroller: HTMLElement, leaf: HTMLElement) {
  const outer = scroller.getBoundingClientRect()
  const inner = leaf.getBoundingClientRect()
  return {
    left: inner.left - outer.left + scroller.scrollLeft,
    top: inner.top - outer.top + scroller.scrollTop,
    width: inner.width,
    height: inner.height,
  }
}

function revealInRow(
  scroller: HTMLElement,
  leaf: HTMLElement,
  instant: boolean,
) {
  const start = lengthOf(scroller, "data-scroll-start")
  const end = lengthOf(scroller, "data-scroll-end")
  const place = placeIn(scroller, leaf)
  const shown = headed(scroller, "x")
  const trailing = place.left + place.width
  if (place.left - shown < start) {
    scrollAxis(scroller, "x", place.left - start, instant)
  } else if (trailing - shown > scroller.clientWidth - end) {
    scrollAxis(scroller, "x", trailing - (scroller.clientWidth - end), instant)
  }
}

function revealNear(
  scroller: HTMLElement,
  leaf: HTMLElement,
  instant: boolean,
) {
  const start = lengthOf(scroller, "data-scroll-start")
  const end = lengthOf(scroller, "data-scroll-end")
  const place = placeIn(scroller, leaf)
  const shown = headed(scroller, "y")
  const trailing = place.top + place.height
  if (place.top - shown < start) {
    scrollAxis(scroller, "y", place.top - start, instant)
  } else if (trailing - shown > scroller.clientHeight - end) {
    scrollAxis(scroller, "y", trailing - (scroller.clientHeight - end), instant)
  }
}

function revealPinned(
  scroller: HTMLElement,
  leaf: HTMLElement,
  instant: boolean,
) {
  if (leaf.closest("[data-scroll-home]")) {
    scrollAxis(scroller, "y", 0, instant)
    return
  }
  const pivot = lengthOf(scroller, "data-scroll-pivot")
  scrollAxis(scroller, "y", placeIn(scroller, leaf).top - pivot, instant)
}

/** From one row of a grid to the next, by where its cells sit: null while it has one row. */
function rowPitch(leaf: HTMLElement): number | null {
  const cells = leaf.closest("[data-fg]")?.children
  const first = cells?.[0]
  if (!cells || !first) return null
  const top = first.getBoundingClientRect().top
  for (const cell of cells) {
    const next = cell.getBoundingClientRect().top
    if (next - top > 1) return next - top
  }
  return null
}

/**
 * A grid of rows the same height, by whole rows: a leaf in full view
 * stays where it is, and one that isn't comes in with as many rows above
 * it as fit, every one of them whole. `data-scroll-start` is the room
 * kept above the top row, and `data-scroll-pitch` a row's height with the
 * gap under it.
 */
function revealInGrid(
  scroller: HTMLElement,
  leaf: HTMLElement,
  instant: boolean,
) {
  const edge = lengthOf(scroller, "data-scroll-start")
  const place = placeIn(scroller, leaf)
  const pitch = rowPitch(leaf) ?? place.height
  const offset = place.top - headed(scroller, "y")
  const bottom = scroller.clientHeight - edge
  const rows = (offset - edge) / pitch
  const aligned = rows - Math.floor(rows + 0.01) < 0.02
  if (offset >= edge - 1 && offset + place.height <= bottom + 1 && aligned) {
    return
  }
  if (offset < edge) {
    scrollAxis(scroller, "y", place.top - edge, instant)
    return
  }
  const fit = Math.floor((bottom - edge - place.height) / pitch)
  const above = Math.max(0, Math.min(fit, Math.floor(rows + 0.01)))
  scrollAxis(scroller, "y", place.top - (edge + above * pitch), instant)
}

/** Scrolls everything around `leaf` that scrolls, so it shows. */
export function reveal(leaf: HTMLElement, instant: boolean) {
  let current = leaf.parentElement
  while (current) {
    switch (current.getAttribute("data-scroll")) {
      case "row":
        revealInRow(current, leaf, instant)
        break
      case "near":
        revealNear(current, leaf, instant)
        break
      case "pin":
        revealPinned(current, leaf, instant)
        break
      case "grid":
        revealInGrid(current, leaf, instant)
        break
      default:
        break
    }
    current = current.parentElement
  }
}

/** Takes `scroller` back to its start, as when what it lists changes. */
export function scrollToStart(scroller: HTMLElement | null) {
  if (!scroller) return
  scrollAxis(scroller, "x", 0, true)
  scrollAxis(scroller, "y", 0, true)
}
