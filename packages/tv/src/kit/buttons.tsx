import type { JSX } from "@solidjs/web"
import { Check, ChevronRight, type IconNode } from "lucide"

import { type AriaRole, cx, Icon, Tap, type TapProps } from "./base"

type Shared = Pick<
  TapProps,
  "fid" | "onFocus" | "onBlur" | "onKeyDown" | "tapRef" | "onMenu"
>

/**
 * A pill button for TV pages and the player: its `icon`, if any, and
 * `label`, with `detail` after it, dimmer, like the time left, and a
 * `trailing` icon at its end, like the chevron of one that opens a
 * choice. `active` marks one whose choice is in force, in the accent.
 * `onPicture` is for one on the moving picture, which rests dark.
 */
export function Button(
  props: Shared & {
    label: string
    onPress: () => void
    icon?: IconNode
    detail?: string | null
    trailing?: IconNode
    active?: boolean
    disabled?: boolean
    onPicture?: boolean
    minWidth?: number
    class?: string
  },
) {
  return (
    <Tap
      fid={props.fid}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      tapRef={props.tapRef}
      onMenu={props.onMenu}
      onPress={props.onPress}
      disabled={props.disabled}
      class={cx(
        "ctl btn t-facts",
        props.icon && "has-icon",
        props.trailing && "has-trailing",
        props.active && "active",
        props.onPicture && "on-picture",
        props.class,
      )}
      style={
        props.minWidth ? { "min-width": `${props.minWidth}rem` } : undefined
      }
    >
      {props.icon && <Icon icon={props.icon} size={20} />}
      <span class="one-line">{props.label}</span>
      {props.detail && <span class="detail">{props.detail}</span>}
      {props.trailing && (
        <Icon icon={props.trailing} size={16} class="trailing" />
      )}
    </Tap>
  )
}

/**
 * A round button beside a `Button`, its icon alone until it takes focus,
 * when it opens to say `label`. `tint` colors the icon while it's not
 * focused, like the accent on a watched mark. `small` is the player's.
 */
export function IconButton(
  props: Shared & {
    icon: IconNode
    label: string
    onPress: () => void
    tint?: string
    filled?: boolean
    small?: boolean
    children?: JSX.Element
  },
) {
  const style = (): JSX.CSSProperties | undefined =>
    props.tint ? { "--tint": props.tint } : undefined
  return (
    <Tap
      fid={props.fid}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      tapRef={props.tapRef}
      onMenu={props.onMenu}
      onPress={props.onPress}
      label={props.label}
      class={cx("ctl icon-btn", props.small ? "small t-label" : "t-facts")}
      style={style()}
    >
      <span class="tint center" style={{ position: "relative" }}>
        <Icon icon={props.icon} size={20} filled={props.filled} />
        {props.children}
      </span>
      <span class="label">{props.label}</span>
    </Tap>
  )
}

/**
 * A round button that stays an icon, like the search field's clear or the
 * player's play and pause, `size` across. `lit` gives it the focused look
 * ahead of focus, for one that is about to take it as it appears.
 */
export function RoundButton(
  props: Shared & {
    label: string
    onPress: () => void
    size?: number
    lit?: boolean
    icon?: IconNode
    children?: JSX.Element
  },
) {
  const size = props.size ?? 48
  return (
    <Tap
      fid={props.fid}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      tapRef={props.tapRef}
      onMenu={props.onMenu}
      onPress={props.onPress}
      label={props.label}
      class={cx("ctl round-btn", props.lit && "lit")}
      style={{ width: `${size}rem`, height: `${size}rem` }}
    >
      {props.icon ? (
        <Icon icon={props.icon} size={size * 0.42} />
      ) : (
        props.children
      )}
    </Tap>
  )
}

/**
 * A small pill, like a genre or a studio that leads to its titles, or a
 * season's tab. `selected` marks the one in force, in the accent.
 */
export function Chip(
  props: Shared & {
    label: string
    onPress: () => void
    selected?: boolean
    role?: AriaRole
  },
) {
  return (
    <Tap
      fid={props.fid}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      tapRef={props.tapRef}
      onMenu={props.onMenu}
      onPress={props.onPress}
      role={props.role}
      class={cx("ctl chip t-label", props.selected && "active")}
    >
      {props.label}
    </Tap>
  )
}

/**
 * A row of a TV list, like a server to connect to or a setting: an icon,
 * a title and a line under it, and `trailing` at its end, such as a value
 * or a switch. `quiet` rows have no fill until focused, for long lists
 * like Settings. A `selected` row, like the category whose rows show
 * beside it, keeps a fill and the accent while focus is elsewhere. A
 * `checked` row, the choice in force in a panel, has a check at its end.
 */
export function ListItem(
  props: Shared & {
    title: string
    onPress: () => void
    subtitle?: string | null
    /** The line under the title in the list's label size, as for an address. */
    subtitleLabel?: boolean
    icon?: IconNode
    quiet?: boolean
    selected?: boolean
    destructive?: boolean
    disabled?: boolean
    checked?: boolean
    minHeight?: number
    leading?: JSX.Element
    trailing?: JSX.Element
    class?: string
  },
) {
  return (
    <Tap
      fid={props.fid}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      tapRef={props.tapRef}
      onMenu={props.onMenu}
      onPress={props.onPress}
      disabled={props.disabled}
      class={cx(
        "ctl item",
        props.quiet && "quiet",
        props.selected && "selected",
        props.destructive && "destructive",
        props.class,
      )}
      style={
        props.minHeight ? { "min-height": `${props.minHeight}rem` } : undefined
      }
    >
      {props.leading ??
        (props.icon && <Icon icon={props.icon} size={24} class="lead" />)}
      <div class="words">
        <div class="t-facts one-line">{props.title}</div>
        {props.subtitle && (
          <div
            class={cx(
              "sub lines",
              props.subtitleLabel ? "t-label" : "t-caption",
            )}
          >
            {props.subtitle}
          </div>
        )}
      </div>
      {props.trailing}
      {props.checked && <Icon icon={Check} size={22} class="check" />}
    </Tap>
  )
}

/** A setting's value at the end of its row, with the chevron of a row that opens a choice. */
export function ListValue(props: { value: string; chevron?: boolean }) {
  return (
    <>
      <span class="value t-label one-line">{props.value}</span>
      {props.chevron !== false && (
        <Icon icon={ChevronRight} size={20} class="chevron" />
      )}
    </>
  )
}

/** An on and off switch at the end of a row, drawn in the row's content color. */
export function ListSwitch(props: { checked: boolean }) {
  return (
    <span class={cx("switch", props.checked && "on")}>
      <i />
    </span>
  )
}

/** A heading over a group of rows in a TV list. */
export function ListHeading(props: { text: string; top?: number }) {
  return (
    <div
      class="item-heading t-label one-line"
      style={props.top ? { "padding-top": `${props.top}rem` } : undefined}
    >
      {props.text}
    </div>
  )
}
