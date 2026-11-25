import type { JSX } from "@solidjs/web"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
} from "solid-js"

/** How many items a grid shows before it has measured itself. */
const PROBE = 24

type Layout = { readonly columns: number; readonly stride: number }
type Rows = { readonly first: number; readonly last: number }

/**
 * The layout each grid class last measured. A page someone comes back to
 * starts at its full height from this, so the router can put the scroll
 * back where it was. The grid measures again once it's on the page.
 */
const remembered = new Map<string, Layout>()

/**
 * A CSS grid of same-height items that keeps only the rows near the window
 * in the page, with padding standing in for the rest. The page scrolls,
 * not the grid. A library of thousands of titles costs what two screens of
 * them cost.
 *
 * The class lays the grid out, and the grid reads the column count and the
 * row height back from the browser. Rows must be one height.
 *
 * What it gives up: the browser's find-in-page sees only the rows that are
 * there, and Tab reaches the rows beyond the window one `overscan` at a
 * time.
 */
export function WindowedGrid<Item>(props: {
  items: readonly Item[]
  keyed: (item: Item) => string
  class: string
  /** Rows kept beyond each edge of the window. Two unless set. */
  overscan?: number
  "data-slot"?: string
  children: (item: Accessor<Item>) => JSX.Element
}) {
  let node: HTMLUListElement | undefined
  // Mirrors of the two signals, for the scroll handler to read.
  let measured: Layout | undefined
  let placed: Rows = { first: 0, last: 0 }
  let width = 0
  const rowsOnScreen = (stride: number) =>
    Math.ceil(window.innerHeight / stride) + (props.overscan ?? 2)
  const [layout, setLayout] = createSignal<Layout | undefined>(() => {
    measured = remembered.get(props.class)
    if (measured) placed = { first: 0, last: rowsOnScreen(measured.stride) }
    return measured
  })
  const [rows, setRows] = createSignal<Rows>(() => {
    // After `layout`, which sets `placed` from what's remembered.
    layout()
    return placed
  })

  /** Which rows the window is over, from where the grid sits on screen. */
  const place = () => {
    if (!node || !measured) return
    const overscan = props.overscan ?? 2
    const above = -node.getBoundingClientRect().top
    const first = Math.max(0, Math.floor(above / measured.stride) - overscan)
    const last = Math.max(
      first,
      Math.ceil((above + window.innerHeight) / measured.stride) + overscan - 1,
    )
    if (first === placed.first && last === placed.last) return
    placed = { first, last }
    setRows(placed)
  }

  /** The column count and row height the browser gave the grid. */
  const measure = () => {
    if (!node) return
    const item = node.firstElementChild
    if (item) {
      const style = getComputedStyle(node)
      const columns = style.gridTemplateColumns.split(" ").length
      const stride =
        item.getBoundingClientRect().height + Number.parseFloat(style.rowGap)
      if (
        stride > 0 &&
        (measured?.columns !== columns || measured.stride !== stride)
      ) {
        measured = { columns, stride }
        remembered.set(props.class, measured)
        setLayout(measured)
      }
    }
    width = node.clientWidth
    place()
  }

  onSettled(() => {
    measure()
    let frame = 0
    const schedule = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        place()
      })
    }
    // The rows change the grid's height all the time. Only a new width
    // can change its columns.
    const resized = new ResizeObserver(() => {
      if (node && node.clientWidth !== width) measure()
    })
    if (node) resized.observe(node)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  })
  // A list that was empty has its first item to measure, and a shorter one
  // may have left the window past its end.
  createEffect(
    () => props.items.length,
    () => {
      measure()
    },
  )

  const shown = createMemo(() => {
    const at = layout()
    if (!at) return props.items.slice(0, PROBE)
    const { first, last } = rows()
    return props.items.slice(first * at.columns, (last + 1) * at.columns)
  })
  const padding = createMemo(() => {
    const at = layout()
    if (!at) return { top: 0, bottom: 0 }
    const count = Math.ceil(props.items.length / at.columns)
    const first = Math.min(rows().first, Math.max(0, count - 1))
    const last = Math.min(rows().last, count - 1)
    return {
      top: first * at.stride,
      bottom: Math.max(0, count - 1 - last) * at.stride,
    }
  })

  return (
    <ul
      ref={(element) => {
        node = element
      }}
      data-slot={props["data-slot"]}
      class={props.class}
      style={{
        "padding-top": `${padding().top}px`,
        "padding-bottom": `${padding().bottom}px`,
      }}
    >
      <For each={shown()} keyed={props.keyed}>
        {props.children}
      </For>
    </ul>
  )
}
