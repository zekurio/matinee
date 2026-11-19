import type { ComponentChildren, CSSProperties } from "preact"
import { useContext, useEffect, useLayoutEffect, useRef } from "preact/hooks"

import {
  bindMemory,
  findLeaf,
  focused,
  focusLost,
  FocusMemory,
  focusOn,
} from "@/input/focus"
import type { Direction } from "@/input/keys"
import { useRefocus } from "@/input/navigation"

import { ChromeContext } from "./chrome"
import { PageContext } from "./scope"

/** A leaf by its group's name and its own, as a page names where focus starts. */
export type Start = readonly [group: string, leaf: string]

/**
 * The root of a TV page: a trap the arrows stay in, with the page's focus
 * memory. Focus goes to the leaf that had it last, when the page comes
 * back, or to `start` the first time, once it's on screen. `start` is
 * asked again until a leaf shows, so a page still loading can name its
 * first card when it has one; null from it means not yet, and undefined
 * means anything that takes focus will do.
 */
export function Page(props: {
  class?: string
  style?: CSSProperties
  start?: () => Start | null | undefined
  /** An arrow found nothing that way, as Left from the first column. */
  onEdge?: (direction: Direction) => void
  children?: ComponentChildren
}) {
  const root = useRef<HTMLDivElement>(null)
  const entry = useContext(PageContext)
  const own = useRef<FocusMemory | null>(null)
  own.current ??= new FocusMemory()
  const memory = entry?.scope.memory ?? own.current
  const landed = useRef(false)
  const start = useRef(props.start)
  start.current = props.start

  useLayoutEffect(() => {
    if (root.current) bindMemory(root.current, memory)
  }, [memory])

  const restore = (): boolean => {
    const node = root.current
    if (!node) return false
    const last = memory.last
    if (
      last &&
      focusOn(findLeaf(node, last.group, last.leaf), { instant: true })
    ) {
      return true
    }
    if (!start.current) return focusOn(node, { instant: true })
    const wanted = start.current()
    if (wanted === null) return false
    if (wanted === undefined) return focusOn(node, { instant: true })
    return focusOn(findLeaf(node, wanted[0], wanted[1]), { instant: true })
  }

  // After every draw until it lands: what focus starts on may come later.
  // And again when what had focus is gone, as a card of a list that
  // loaded again, so a page never sits there with nothing focused.
  useEffect(() => {
    if (landed.current) {
      if (focusLost()) restore()
      return
    }
    const inside = focused()
    if (inside && root.current?.contains(inside)) {
      landed.current = true
      return
    }
    if (restore()) landed.current = true
  })
  useRefocus(() => {
    restore()
  })

  const onEdge = useRef(props.onEdge)
  onEdge.current = props.onEdge
  useEffect(() => {
    const node = root.current
    if (!node) return
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) {
        // SAFETY: Only moveFocus sends this event, with a direction.
        onEdge.current?.(event.detail as Direction)
      }
    }
    node.addEventListener("focusedge", listener)
    return () => node.removeEventListener("focusedge", listener)
  }, [])

  return (
    <div
      ref={root}
      class={props.class}
      style={props.style}
      data-ft=""
      data-page=""
    >
      {props.children}
    </div>
  )
}

/** Shows `sources` behind the page, the first that loads, while the page is on screen. */
export function useBackdrop(sources: readonly string[]) {
  const chrome = useContext(ChromeContext)
  const entry = useContext(PageContext)
  const key = sources.join(" ")
  useEffect(() => {
    chrome?.showBackdrop(entry?.id ?? 0, sources)
  }, [chrome, entry, key])
}
