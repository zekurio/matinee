import type { JSX } from "@solidjs/web"
import type { IconNode } from "lucide"
import { createEffect, onSettled } from "solid-js"

/** The roles an element may take, as the DOM's own list. */
export type AriaRole = JSX.HTMLAttributes<HTMLElement>["role"]

/** Joins the class names that are there. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ")
}

/** A lucide icon, `size` units across, drawn in the text color around it. */
export function Icon(props: {
  icon: IconNode
  size?: number
  class?: string
  /** Filled in, as a heart that's a favorite. */
  filled?: boolean
}) {
  let svg: SVGSVGElement | undefined
  createEffect(
    () => props.icon,
    (nodes) => {
      if (!svg) return
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      for (const [tag, attributes] of nodes) {
        const node = document.createElementNS("http://www.w3.org/2000/svg", tag)
        for (const [name, value] of Object.entries(attributes)) {
          node.setAttribute(name, String(value))
        }
        svg.appendChild(node)
      }
    },
  )
  return (
    <svg
      ref={(node) => (svg = node)}
      class={cx("icon", props.class)}
      viewBox="0 0 24 24"
      fill={props.filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{
        width: `${props.size ?? 20}rem`,
        height: `${props.size ?? 20}rem`,
      }}
      aria-hidden="true"
    />
  )
}

export function Spinner(props: { size?: number; class?: string }) {
  return (
    <div
      class={cx("spinner", props.class)}
      style={{
        width: `${props.size ?? 28}rem`,
        height: `${props.size ?? 28}rem`,
      }}
      role="progressbar"
    />
  )
}

export type TapProps = {
  /** Names it in its group, for the page's focus memory. */
  fid?: string
  class?: string
  style?: JSX.CSSProperties
  /** Named for a screen reader, where the content doesn't say. */
  label?: string
  role?: AriaRole
  /** It shows, but takes no focus and does nothing. */
  disabled?: boolean
  /** Select, or a click. */
  onPress?: () => void
  /** Select held, or the remote's menu key. */
  onMenu?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: KeyboardEvent) => void
  /** The element, to give it focus by. */
  tapRef?: (element: HTMLDivElement | null) => void
  children?: JSX.Element
}

/**
 * Something on a TV page that takes focus and a press: every button,
 * card, and row is one. Focus comes by the arrows (see input/focus.ts),
 * and a click focuses it before it presses, so the pointer and the arrows
 * share one focus.
 */
export function Tap(props: TapProps) {
  let own: HTMLDivElement | undefined
  onSettled(() => {
    const node = own
    if (!node) return
    const listener = () => props.onMenu?.()
    node.addEventListener("longpress", listener)
    return () => node.removeEventListener("longpress", listener)
  })
  return (
    <div
      ref={(node) => {
        own = node
        props.tapRef?.(node)
      }}
      aria-disabled={props.disabled ? "true" : undefined}
      data-f={props.disabled ? undefined : (props.fid ?? "")}
      tabindex={props.disabled ? undefined : -1}
      class={props.class}
      style={props.style}
      role={props.role ?? "button"}
      aria-label={props.label}
      onClick={() => {
        if (!props.disabled) props.onPress?.()
      }}
      onFocus={() => props.onFocus?.()}
      onBlur={() => props.onBlur?.()}
      onKeyDown={(event) => props.onKeyDown?.(event)}
    >
      {props.children}
    </div>
  )
}
