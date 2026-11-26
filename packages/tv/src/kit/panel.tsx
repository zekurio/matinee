import type { JSX } from "@solidjs/web"
import {
  For,
  Show,
  createEffect,
  createSignal,
  onSettled,
  useContext,
} from "solid-js"

import { ChromeContext } from "../app/chrome"
import { findLeaf, focused, focusOn } from "../input/focus"
import { refocus, useBack, useRefocus } from "../input/navigation"
import { cx, Spinner } from "./base"
import { ListItem, ListValue } from "./buttons"

/**
 * The panel at the right edge of a TV screen, for a choice or a question:
 * a card's actions, a sort, a setting, the player's menus. While `open`
 * it slides in over the dimmed screen with `title` and `description` at
 * its top and `children` as a list of rows. Focus goes to the row marked
 * `initial`, or the first one, and stays in the panel; Back calls
 * `onBack`. Once it closes, focus goes back to what had it when it
 * opened, unless `returnFocus` puts it elsewhere.
 *
 * A new `focusKey` while open, like the panel turning to another
 * question, focuses `initial` again. While `loading`, a spinner in place
 * of the rows.
 */
export function SidePanel(props: {
  open: boolean
  title: string | null
  onBack: () => void
  description?: string | null
  /** The name, as `fid`, of the row focus starts on. */
  initial?: string
  focusKey?: string
  loading?: boolean
  /** Puts focus back in place of the panel's own way; false to leave it where it is. */
  returnFocus?: (() => void) | false
  children?: JSX.Element
}) {
  let list: HTMLDivElement | undefined
  let opener: HTMLElement | null = null
  // Where the opener sat, by its page, its group, and its name, to find
  // it again if it was drawn afresh while the panel was open.
  let openerPlace: { trap: Element; group: string; leaf: string } | null = null
  const chrome = useContext(ChromeContext)
  // Once opened, what it showed stays drawn while it slides away and after.
  const [shown, setShown] = createSignal(false)

  useBack(props.onBack, () => props.open)

  // `initial` is passed in rather than read here, since an effect reads
  // its props in its compute: a prop the parent works out builds a memo
  // when it's read, and one built while an effect applies stops Solid.
  const toStart = (initial: string | undefined) => {
    const root = list
    if (!root) return false
    const wanted =
      initial === undefined
        ? null
        : root.querySelector<HTMLElement>(
            `[data-f="${initial.replace(/["\\]/g, "\\$&")}"]`,
          )
    return focusOn(wanted, { instant: true }) || focusOn(root)
  }
  useRefocus(
    () => {
      toStart(props.initial)
    },
    () => props.open,
  )

  // Remembers what had focus as it opens, before the panel takes it.
  createEffect(
    () => props.open,
    (open) => {
      if (!open) return
      setShown(true)
      opener = focused()
      const trap = opener?.closest("[data-ft]")
      const group = opener?.parentElement?.closest("[data-fg]")
      const leaf = opener?.getAttribute("data-f")
      openerPlace =
        trap && group && leaf
          ? { trap, group: group.getAttribute("data-fg") ?? "", leaf }
          : null
    },
  )

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return
      chrome?.panelOpened(1)
      return () => chrome?.panelOpened(-1)
    },
  )

  // `shown` too: the first time it opens, the rows are drawn only once
  // `shown` turns on, after the update that opened it, and there's no row
  // to focus before then.
  createEffect(
    () =>
      [
        props.open,
        props.loading,
        props.focusKey,
        shown(),
        props.initial,
      ] as const,
    ([open, loading, , , initial]) => {
      if (open && !loading) toStart(initial)
    },
  )

  let wasOpen = false
  createEffect(
    () => [props.open, props.returnFocus] as const,
    ([open, back]) => {
      if (open) {
        wasOpen = true
        return
      }
      if (!wasOpen) return
      wasOpen = false
      if (back !== false) {
        if (back) back()
        else if (!focusOn(opener) && !focusOn(redrawnOpener())) refocus()
      }
      opener = null
      openerPlace = null
    },
  )

  onSettled(() => {
    if (props.open) setShown(true)
  })

  /** The opener as drawn again, in its place, when the first one is gone. */
  function redrawnOpener(): HTMLElement | null {
    const place = openerPlace
    return place ? findLeaf(place.trap, place.group, place.leaf) : null
  }

  return (
    <>
      <div
        class={cx("panel-shade fill", props.open && "open")}
        onClick={() => props.onBack()}
      />
      <div
        class={cx("panel", props.open && "open")}
        data-ft={props.open ? "" : undefined}
        data-foff={props.open ? undefined : ""}
      >
        <Show when={shown()}>
          <div class="panel-head">
            {props.title && (
              <div class="t-headline lines" role="heading" aria-level={2}>
                {props.title}
              </div>
            )}
            {props.description && (
              <div class="t-body muted lines">{props.description}</div>
            )}
          </div>
          {props.loading ? (
            <div class="center" style={{ "padding-top": "40rem" }}>
              <Spinner class="muted" />
            </div>
          ) : (
            <div
              ref={(node) => (list = node)}
              class="panel-list"
              data-fg="panel"
              data-fk="col"
              data-scroll="near"
              data-scroll-start="20"
              data-scroll-end="43"
            >
              {props.children}
            </div>
          )}
        </Show>
      </div>
    </>
  )
}

/** A choice in an `OptionsPanel`: `detail` at its end, like a count. */
export type PanelOption = {
  key: string
  label: string
  detail?: string
  subtitle?: string | null
  disabled?: boolean
}

/**
 * A `SidePanel` to pick one of `options` while `open`, as a sort, a
 * filter, or a setting, focus starting on the `current` one, which is
 * checked. `onPick` gets the option's key, `onClose` runs on Back, and
 * both should close it.
 */
export function OptionsPanel(props: {
  open: boolean
  title: string
  options: readonly PanelOption[]
  current: string | null
  onPick: (key: string) => void
  onClose: () => void
  description?: string | null
  loading?: boolean
}) {
  return (
    <SidePanel
      open={props.open}
      title={props.title}
      description={props.description}
      onBack={props.onClose}
      initial={props.current ?? undefined}
      loading={props.loading}
    >
      <For each={props.options}>
        {(option) => (
          <ListItem
            fid={option.key}
            title={option.label}
            subtitle={option.subtitle}
            onPress={() => props.onPick(option.key)}
            quiet
            disabled={option.disabled}
            checked={option.key === props.current}
            trailing={
              option.detail ? (
                <ListValue value={option.detail} chevron={false} />
              ) : undefined
            }
          />
        )}
      </For>
    </SidePanel>
  )
}
