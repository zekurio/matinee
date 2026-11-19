import type { IconNode } from "lucide"
import {
  type AriaRole,
  type ComponentChildren,
  type CSSProperties,
  h,
  type RefObject,
} from "preact"
import { useEffect, useRef } from "preact/hooks"

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
  const size = `${props.size ?? 20}rem`
  return (
    <svg
      class={cx("icon", props.class)}
      viewBox="0 0 24 24"
      fill={props.filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {props.icon.map(([tag, attributes], index) =>
        h(tag, { ...attributes, key: index }),
      )}
    </svg>
  )
}

export function Spinner(props: { size?: number; class?: string }) {
  const size = `${props.size ?? 28}rem`
  return (
    <div
      class={cx("spinner", props.class)}
      style={{ width: size, height: size }}
      role="progressbar"
    />
  )
}

export type TapProps = {
  /** Names it in its group, for the page's focus memory. */
  fid?: string
  class?: string
  style?: CSSProperties
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
  tapRef?: RefObject<HTMLDivElement | null>
  children?: ComponentChildren
}

/**
 * Something on a TV page that takes focus and a press: every button,
 * card, and row is one. Focus comes by the arrows (see input/focus.ts),
 * and a click focuses it before it presses, so the pointer and the arrows
 * share one focus.
 */
export function Tap(props: TapProps) {
  const own = useRef<HTMLDivElement>(null)
  const element = props.tapRef ?? own
  const onMenu = useRef(props.onMenu)
  onMenu.current = props.onMenu
  useEffect(() => {
    const node = element.current
    if (!node) return
    const listener = () => onMenu.current?.()
    node.addEventListener("longpress", listener)
    return () => node.removeEventListener("longpress", listener)
  }, [element])
  const focusable = props.disabled
    ? { "aria-disabled": true }
    : { "data-f": props.fid ?? "", tabIndex: -1 }
  return (
    <div
      ref={element}
      {...focusable}
      class={props.class}
      style={props.style}
      role={props.role ?? "button"}
      aria-label={props.label}
      onClick={props.disabled ? undefined : props.onPress}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
    >
      {props.children}
    </div>
  )
}
