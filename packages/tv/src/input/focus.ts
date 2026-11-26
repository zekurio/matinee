import type { Direction } from "./keys"
import { reveal } from "./scroll"

/*
 * Focus for a remote: which thing has it, and where an arrow takes it.
 * The browser's own focus holds it, so `:focus` styles what has it, and
 * this decides where it goes next, since browsers have no arrow keys of
 * their own to move it by.
 *
 * The page marks what it's made of:
 *
 * - `data-f`: something that takes focus, a leaf. Its value names it in
 *   its group, for the memory.
 * - `data-fg`: a group of leaves or of other groups, named by its value.
 *   `data-fk` says how it's laid out: `row`, `col`, `grid`, or nothing
 *   for anywhere.
 * - `data-ft`: a trap, like a page or an open panel. Arrows never leave
 *   it; whoever owns it moves focus out.
 * - `data-foff`: nothing under it takes focus, as while it slides away.
 *
 * An arrow looks for the next leaf in the focused one's group first, then
 * in the group around that, and so on out to the trap. Focus that comes
 * into a group lands on the leaf it left there, as `FocusMemory` kept it,
 * and otherwise on the one nearest to where it came from.
 */

const LEAF = "[data-f]"
const GROUP = "[data-fg]"
const NODE = `${LEAF},${GROUP}`
const BOUNDARY = "[data-fg],[data-ft],[data-foff]"

type Box = { left: number; top: number; right: number; bottom: number }

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

/**
 * Where focus was on a page: the child each group had it on last. A page
 * keeps one while it's on the back stack, so coming back to it, or into
 * one of its rows, lands where it was left.
 */
export class FocusMemory {
  /** By group name: `l:` and a leaf's name, or `g:` and a group's. */
  private readonly children = new Map<string, string>()
  /** The leaf that had focus last, as its group's name and its own. */
  last: { group: string; leaf: string } | null = null

  remember(group: string, child: string) {
    this.children.set(group, child)
  }

  recall(group: string): string | undefined {
    return this.children.get(group)
  }

  /** Where focus lands in `group` the first time, rather than on what's nearest. */
  seed(group: string, leaf: string) {
    if (!this.children.has(group)) this.children.set(group, `l:${leaf}`)
  }

  forget(group: string) {
    this.children.delete(group)
  }
}

const memories = new WeakMap<Element, FocusMemory>()

/** Gives the trap `root` its memory. */
export function bindMemory(root: Element, memory: FocusMemory) {
  memories.set(root, memory)
}

function memoryOf(element: Element): FocusMemory | undefined {
  const root = element.closest("[data-ft]")
  return root ? memories.get(root) : undefined
}

function isShown(element: Element): boolean {
  return element.getClientRects().length > 0
}

/** The group or trap right around `element`. */
function containerOf(element: Element): Element | null {
  return element.parentElement?.closest("[data-fg],[data-ft]") ?? null
}

/** What `container` holds directly: its leaves and groups, not theirs. */
function childrenOf(container: Element): HTMLElement[] {
  const found: HTMLElement[] = []
  for (const node of container.querySelectorAll<HTMLElement>(NODE)) {
    if (node.parentElement?.closest(BOUNDARY) !== container) continue
    if (!isShown(node)) continue
    found.push(node)
  }
  return found
}

function isLeaf(element: Element): boolean {
  return element.hasAttribute("data-f")
}

function tokenOf(element: Element, index: number): string {
  if (isLeaf(element)) {
    const name = element.getAttribute("data-f")
    return name ? `l:${name}` : `i:${index}`
  }
  return `g:${element.getAttribute("data-fg") ?? ""}`
}

// Android's FocusFinder, which the TV screens were laid out against.

function isCandidate(from: Box, to: Box, direction: Direction): boolean {
  switch (direction) {
    case "left":
      return (
        (from.right > to.right || from.left >= to.right) && from.left > to.left
      )
    case "right":
      return (
        (from.left < to.left || from.right <= to.left) && from.right < to.right
      )
    case "up":
      return (
        (from.bottom > to.bottom || from.top >= to.bottom) && from.top > to.top
      )
    case "down":
      return (
        (from.top < to.top || from.bottom <= to.top) && from.bottom < to.bottom
      )
  }
}

function inBeam(from: Box, to: Box, direction: Direction): boolean {
  return direction === "left" || direction === "right"
    ? to.bottom > from.top && to.top < from.bottom
    : to.right > from.left && to.left < from.right
}

function majorDistance(from: Box, to: Box, direction: Direction): number {
  switch (direction) {
    case "left":
      return Math.max(0, from.left - to.right)
    case "right":
      return Math.max(0, to.left - from.right)
    case "up":
      return Math.max(0, from.top - to.bottom)
    case "down":
      return Math.max(0, to.top - from.bottom)
  }
}

function minorDistance(from: Box, to: Box, direction: Direction): number {
  return direction === "left" || direction === "right"
    ? Math.abs((from.top + from.bottom) / 2 - (to.top + to.bottom) / 2)
    : Math.abs((from.left + from.right) / 2 - (to.left + to.right) / 2)
}

/** Whether `candidate` is a better move from `from` than `best`. */
function isBetter(
  from: Box,
  candidate: Box,
  best: Box,
  direction: Direction,
): boolean {
  const candidateInBeam = inBeam(from, candidate, direction)
  const bestInBeam = inBeam(from, best, direction)
  if (candidateInBeam !== bestInBeam) return candidateInBeam
  const weigh = (box: Box) => {
    const major = majorDistance(from, box, direction)
    const minor = minorDistance(from, box, direction)
    return 13 * major * major + minor * minor
  }
  return weigh(candidate) < weigh(best)
}

function nearestInDirection(
  from: Box,
  candidates: readonly HTMLElement[],
  direction: Direction,
): HTMLElement | null {
  let best: { element: HTMLElement; box: Box } | null = null
  for (const element of candidates) {
    const box = boxOf(element)
    if (!isCandidate(from, box, direction)) continue
    if (!best || isBetter(from, box, best.box, direction)) {
      best = { element, box }
    }
  }
  return best?.element ?? null
}

/** How much of `to` lies across from `from`, along the way focus didn't move. */
function overlap(from: Box, to: Box, vertical: boolean): number {
  return vertical
    ? Math.min(from.right, to.right) - Math.max(from.left, to.left)
    : Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top)
}

/** The child of a group focus comes into that's nearest to where it came from. */
function nearestOnEntry(
  from: Box,
  candidates: readonly HTMLElement[],
  direction: Direction | null,
): HTMLElement | null {
  const vertical = direction === "up" || direction === "down"
  let best: { element: HTMLElement; score: number } | null = null
  for (const element of candidates) {
    const box = boxOf(element)
    const across = overlap(from, box, vertical)
    const dx = (from.left + from.right) / 2 - (box.left + box.right) / 2
    const dy = (from.top + from.bottom) / 2 - (box.top + box.bottom) / 2
    // One across from where focus was beats any that isn't, then the nearer.
    const score =
      (across > 0 ? 0 : 1e9) +
      (direction === null
        ? dx * dx + dy * dy
        : vertical
          ? dx * dx * 13 + dy * dy
          : dy * dy * 13 + dx * dx)
    if (!best || score < best.score) best = { element, score }
  }
  return best?.element ?? null
}

/**
 * How many columns a grid's children sit in: those level with the first.
 * Measured by the cells they're in, since the focused one itself has
 * grown and no longer sits level with the rest.
 */
function columnsOf(
  container: Element,
  children: readonly HTMLElement[],
): number {
  const cellOf = (child: Element): Element => {
    let cell = child
    while (cell.parentElement && cell.parentElement !== container) {
      cell = cell.parentElement
    }
    return cell
  }
  const first = children[0]
  if (!first) return 1
  const top = cellOf(first).getBoundingClientRect().top
  let count = 0
  for (const child of children) {
    if (Math.abs(cellOf(child).getBoundingClientRect().top - top) > 1) break
    count += 1
  }
  return Math.max(1, count)
}

function stepInGrid(
  container: Element,
  children: readonly HTMLElement[],
  index: number,
  direction: Direction,
): HTMLElement | null {
  const columns = columnsOf(container, children)
  const column = index % columns
  switch (direction) {
    case "left":
      return column > 0 ? (children[index - 1] ?? null) : null
    case "right":
      return column < columns - 1 ? (children[index + 1] ?? null) : null
    case "up":
      return children[index - columns] ?? null
    case "down": {
      const below = children[index + columns]
      if (below) return below
      // A last row that's short still takes focus from the row above it.
      const lastRow = Math.floor((children.length - 1) / columns)
      const last = children.at(-1) ?? null
      return Math.floor(index / columns) < lastRow ? last : null
    }
  }
}

/** The child of `container` an arrow reaches from `node`, or null when it has none that way. */
function step(
  container: Element,
  node: HTMLElement,
  from: Box,
  direction: Direction,
): HTMLElement | null {
  const children = childrenOf(container)
  const kind = container.getAttribute("data-fk")
  const index = children.indexOf(node)
  const horizontal = direction === "left" || direction === "right"
  if (kind === "row" || kind === "col") {
    if ((kind === "row") !== horizontal) return null
    const next = direction === "left" || direction === "up" ? -1 : 1
    return index < 0 ? null : (children[index + next] ?? null)
  }
  if (kind === "grid" && index >= 0) {
    return stepInGrid(container, children, index, direction)
  }
  return nearestInDirection(
    from,
    children.filter((child) => child !== node),
    direction,
  )
}

/** The leaf focus lands on when it comes into `target`. */
function resolve(
  target: HTMLElement,
  from: Box | null,
  direction: Direction | null,
): HTMLElement | null {
  if (isLeaf(target)) return target
  const children = childrenOf(target)
  if (children.length === 0) return null
  const remembered = memoryOf(target)?.recall(
    target.getAttribute("data-fg") ?? "",
  )
  const kept =
    remembered === undefined
      ? undefined
      : children.find((child, index) => tokenOf(child, index) === remembered)
  const entry =
    kept ??
    (from ? nearestOnEntry(from, children, direction) : null) ??
    children[0]
  if (!entry) return null
  return (
    resolve(entry, from, direction) ??
    // The child it would have picked holds nothing that takes focus.
    children
      .map((child) => resolve(child, from, direction))
      .find((leaf) => leaf !== null) ??
    null
  )
}

/**
 * Everything around `element`, any of which the engine may scroll to show
 * what it focuses: what the app scrolls, and what only clips, like the
 * page a panel slides in over.
 */
function ancestorsOf(element: Element): HTMLElement[] {
  const found: HTMLElement[] = []
  let current = element.parentElement
  while (current) {
    found.push(current)
    current = current.parentElement
  }
  return found
}

function record(leaf: HTMLElement) {
  const memory = memoryOf(leaf)
  if (!memory) return
  let node: Element = leaf
  let container = containerOf(node)
  let first = true
  while (container && container.hasAttribute("data-fg")) {
    const group = container.getAttribute("data-fg") ?? ""
    const token = tokenOf(node, childrenOf(container).indexOf(asElement(node)))
    memory.remember(group, token)
    if (first) {
      memory.last = { group, leaf: leaf.getAttribute("data-f") ?? "" }
      first = false
    }
    node = container
    container = containerOf(node)
  }
  // A leaf right in the trap, in no group, as a chart on the profile: it's
  // still where focus was, for coming back from the drawer.
  if (first)
    memory.last = { group: "", leaf: leaf.getAttribute("data-f") ?? "" }
}

function asElement(node: Element): HTMLElement {
  // SAFETY: Only elements the app marks with data attributes get here,
  // and it marks nothing but HTML elements.
  return node as HTMLElement
}

/** The leaf that has focus, or null when nothing the app knows does. */
export function focused(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement && active.hasAttribute("data-f")
    ? active
    : null
}

/**
 * Nothing has focus at all, as after the focused leaf left the page with
 * a list that loaded again. A text field being typed in has it, so that
 * doesn't count.
 */
export function focusLost(): boolean {
  const active = document.activeElement
  return active === null || active === document.body
}

/**
 * Gives `target` focus, or the leaf focus lands on inside it when it's a
 * group or a trap. `instant` skips the scroll's glide, for a page that
 * comes back. False when nothing there takes focus.
 */
export function focusOn(
  target: HTMLElement | null | undefined,
  options: { instant?: boolean; from?: Box | null; direction?: Direction } = {},
): boolean {
  if (!target || !target.isConnected) return false
  const leaf = isLeaf(target)
    ? target
    : target.hasAttribute("data-fg")
      ? resolve(target, options.from ?? null, options.direction ?? null)
      : (childrenOf(target)
          .map((child) => resolve(child, null, null))
          .find((found) => found !== null) ?? null)
  // Nothing under `data-foff` takes focus, as a panel sliding shut.
  if (!leaf || !isShown(leaf) || leaf.closest("[data-foff]")) return false
  // Engines before Chromium 64 scroll what they focus into view whatever
  // they're told, so everything around it is put back where it was.
  const scrollers = ancestorsOf(leaf)
  const offsets = scrollers.map((scroller) => [
    scroller.scrollLeft,
    scroller.scrollTop,
  ])
  leaf.focus({ preventScroll: true })
  scrollers.forEach((scroller, index) => {
    const [left = 0, top = 0] = offsets[index] ?? []
    if (scroller.scrollLeft !== left) scroller.scrollLeft = left
    if (scroller.scrollTop !== top) scroller.scrollTop = top
  })
  if (document.activeElement !== leaf) return false
  record(leaf)
  reveal(leaf, options.instant ?? false)
  return true
}

/** The leaf of `group` named `leaf`, inside `root`. */
export function findLeaf(
  root: Element,
  group: string,
  leaf: string,
): HTMLElement | null {
  // No group: a leaf right in `root`.
  if (group === "") {
    return (
      childrenOf(root).find((child) => child.getAttribute("data-f") === leaf) ??
      null
    )
  }
  for (const container of root.querySelectorAll(GROUP)) {
    if (container.getAttribute("data-fg") !== group) continue
    const found = childrenOf(container).find(
      (child) => child.getAttribute("data-f") === leaf,
    )
    if (found) return found
  }
  return null
}

/**
 * Moves focus one step from the focused leaf. False when there's nothing
 * that way inside its trap, and then the leaf hears a `focusedge` event,
 * which bubbles, with the direction as its detail.
 */
export function moveFocus(direction: Direction): boolean {
  const from = focused()
  if (!from) return false
  const origin = boxOf(from)
  let node: HTMLElement = from
  while (true) {
    const container = containerOf(node)
    if (!container) break
    const target = step(container, node, origin, direction)
    if (target) {
      const leaf = resolve(target, origin, direction)
      if (leaf && focusOn(leaf)) return true
    }
    if (container.hasAttribute("data-ft")) break
    node = asElement(container)
  }
  from.dispatchEvent(
    new CustomEvent<Direction>("focusedge", {
      bubbles: true,
      detail: direction,
    }),
  )
  return false
}
