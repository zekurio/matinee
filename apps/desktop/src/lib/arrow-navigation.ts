/*
 * Arrow keys move focus, for a remote that sends only arrows and Enter.
 * Up and down go to the nearest control above or below, left and right to
 * the nearest one beside it in the same row. A text field keeps left and
 * right for its caret. An open dialog keeps focus inside it.
 *
 * With nothing focused, as on a new screen, an arrow or Enter focuses the
 * screen's main control, marked `data-primary`, or else its first one.
 */

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'

type Direction = "up" | "down" | "left" | "right"

const DIRECTIONS = new Map<string, Direction>([
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
])

/** Widgets that use the arrow keys themselves. */
const OWN_ARROWS =
  '[role="listbox"], [role="menu"], [role="radiogroup"], [role="slider"], [role="tablist"]'

function candidates(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      !element.closest('[aria-hidden="true"], [inert]'),
  )
}

/** Where focus starts in `scope`: its main control, or its first one. */
function startingPoint(scope: HTMLElement): HTMLElement | null {
  const all = candidates(scope)
  return (
    all.find((element) => element.matches("[data-primary]")) ?? all[0] ?? null
  )
}

function overlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  return Math.min(endA, endB) - Math.max(startA, startB)
}

/**
 * How far `to` is from `from` going `direction`, or null when it isn't
 * that way. Distance along the way counts once, and off to the side
 * twice, so a control straight ahead wins over a closer one at an angle.
 */
function distance(
  from: DOMRect,
  to: DOMRect,
  direction: Direction,
): number | null {
  const vertical = direction === "up" || direction === "down"
  const ahead =
    direction === "down"
      ? to.top - from.bottom
      : direction === "up"
        ? from.top - to.bottom
        : direction === "right"
          ? to.left - from.right
          : from.left - to.right
  // A little overlap still counts as ahead, as for rows that share a border.
  if (ahead < -2) return null
  if (vertical) {
    const shared = overlap(from.left, from.right, to.left, to.right)
    const side = shared > 0 ? 0 : -shared
    return Math.max(0, ahead) + side * 2
  }
  // Left and right stay in the row.
  if (overlap(from.top, from.bottom, to.top, to.bottom) <= 0) return null
  return Math.max(0, ahead)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const direction = DIRECTIONS.get(event.key)
  if (!direction && event.key !== "Enter") return
  const active =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null
  if (!direction) {
    if (active) return
    const start = startingPoint(document.body)
    if (!start) return
    event.preventDefault()
    start.focus()
    return
  }
  if (active?.closest(OWN_ARROWS)) return
  const typing =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  if (typing && (direction === "left" || direction === "right")) return

  const dialog = document.querySelector<HTMLElement>(
    '[role="dialog"], [role="alertdialog"]',
  )
  const scope = dialog ?? document.body
  const all = candidates(scope)
  if (!active || !scope.contains(active)) {
    const start = startingPoint(scope)
    if (!start) return
    event.preventDefault()
    start.focus()
    return
  }

  const from = active.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestDistance = Infinity
  for (const element of all) {
    if (element === active || active.contains(element)) continue
    const away = distance(from, element.getBoundingClientRect(), direction)
    if (away !== null && away < bestDistance) {
      best = element
      bestDistance = away
    }
  }
  if (!best) return
  event.preventDefault()
  best.focus()
  best.scrollIntoView({ block: "nearest", inline: "nearest" })
}

/** Starts moving focus with the arrow keys, for the page's lifetime. */
export function installArrowNavigation(): void {
  document.addEventListener("keydown", onKeyDown)
}
