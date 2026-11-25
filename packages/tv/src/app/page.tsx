import type { JSX } from "@solidjs/web"
import { createEffect, onSettled, useContext } from "solid-js"

import {
  bindMemory,
  findLeaf,
  focused,
  focusLost,
  FocusMemory,
  focusOn,
} from "../input/focus"
import type { Direction } from "../input/keys"
import { useRefocus } from "../input/navigation"
import type { ImageSource } from "../model/format"
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
  style?: JSX.CSSProperties
  start?: () => Start | null | undefined
  /** An arrow found nothing that way, as Left from the first column. */
  onEdge?: (direction: Direction) => void
  children?: JSX.Element
}) {
  let root: HTMLDivElement | undefined
  const entry = useContext(PageContext)
  const own = new FocusMemory()
  const memory = entry?.scope.memory ?? own
  let landed = false

  const restore = (): boolean => {
    const node = root
    if (!node) return false
    const last = memory.last
    if (
      last &&
      focusOn(findLeaf(node, last.group, last.leaf), { instant: true })
    ) {
      return true
    }
    if (!props.start) return focusOn(node, { instant: true })
    const wanted = props.start()
    if (wanted === null) return false
    if (wanted === undefined) return focusOn(node, { instant: true })
    return focusOn(findLeaf(node, wanted[0], wanted[1]), { instant: true })
  }

  // After every change to what's on screen until it lands: what focus
  // starts on may come later, and what had focus may go, as a card of a
  // list that loaded again, so a page never sits with nothing focused.
  onSettled(() => {
    const node = root
    if (!node) return
    bindMemory(node, memory)
    const check = () => {
      if (landed) {
        if (focusLost()) restore()
        return
      }
      const inside = focused()
      if (inside && node.contains(inside)) {
        landed = true
        return
      }
      if (restore()) landed = true
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(node, { childList: true, subtree: true })
    return () => observer.disconnect()
  })

  useRefocus(() => {
    restore()
  })

  onSettled(() => {
    const node = root
    if (!node) return
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) {
        // SAFETY: Only moveFocus sends this event, with a direction.
        props.onEdge?.(event.detail as Direction)
      }
    }
    node.addEventListener("focusedge", listener)
    return () => node.removeEventListener("focusedge", listener)
  })

  return (
    <div
      ref={(node) => (root = node)}
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
export function useBackdrop(sources: () => readonly ImageSource[]) {
  const chrome = useContext(ChromeContext)
  const entry = useContext(PageContext)
  createEffect(
    () => sources(),
    (next) => {
      chrome?.showBackdrop(entry?.id ?? 0, next)
    },
  )
}
