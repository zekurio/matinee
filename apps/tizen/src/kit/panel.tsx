import type { ComponentChildren } from "preact"
import { useContext, useEffect, useLayoutEffect, useRef } from "preact/hooks"

import { ChromeContext } from "@/app/chrome"
import { focused, focusOn } from "@/input/focus"
import { refocus, useBack, useRefocus } from "@/input/navigation"

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
  children?: ComponentChildren
}) {
  const { open } = props
  const list = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const chrome = useContext(ChromeContext)
  // Once opened, what it showed stays drawn while it slides away and after.
  const opened = useRef(false)
  if (open) opened.current = true
  const shown = opened.current

  useBack(props.onBack, open)

  const toStart = () => {
    const root = list.current
    if (!root) return false
    const wanted =
      props.initial === undefined
        ? null
        : root.querySelector<HTMLElement>(
            `[data-f="${props.initial.replace(/["\\]/g, "\\$&")}"]`,
          )
    return focusOn(wanted, { instant: true }) || focusOn(root)
  }
  useRefocus(() => {
    toStart()
  }, open)

  // Remembers what had focus as it opens, before the panel takes it.
  useLayoutEffect(() => {
    if (open) opener.current = focused()
  }, [open])

  useEffect(() => {
    if (!open) return
    chrome?.panelOpened(1)
    return () => chrome?.panelOpened(-1)
  }, [open, chrome])

  const { loading, focusKey, returnFocus } = props
  useEffect(() => {
    if (open && !loading) toStart()
  }, [open, loading, focusKey])

  const restore = useRef(returnFocus)
  restore.current = returnFocus
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const back = restore.current
    if (back !== false) {
      if (back) back()
      else if (!focusOn(opener.current)) refocus()
    }
    opener.current = null
  }, [open])

  return (
    <>
      <div
        class={cx("panel-shade fill", open && "open")}
        onClick={props.onBack}
      />
      <div
        class={cx("panel", open && "open")}
        data-ft={open ? "" : undefined}
        data-foff={open ? undefined : ""}
      >
        {shown && (
          <>
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
              <div class="center" style={{ paddingTop: "40rem" }}>
                <Spinner class="muted" />
              </div>
            ) : (
              <div
                ref={list}
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
          </>
        )}
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
      {props.options.map((option) => (
        <ListItem
          key={option.key}
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
      ))}
    </SidePanel>
  )
}
