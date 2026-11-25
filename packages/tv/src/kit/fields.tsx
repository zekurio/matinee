import { Search, X } from "lucide"
import { createSignal } from "solid-js"

import { focusOn, moveFocus } from "../input/focus"
import { cx, Icon, Tap, type TapProps } from "./base"
import { RoundButton } from "./buttons"

/** What the TV's keyboard sends for its Done and Cancel keys. */
const IME_DONE = 65376
const IME_CANCEL = 65385

type FieldProps = Pick<TapProps, "fid" | "tapRef"> & {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** The keyboard's Done or Enter. */
  onDone?: () => void
  class?: string
  /** `url` for an address, which the TV's keyboard then lays out for. */
  type?: "text" | "url"
  icon?: boolean
}

/**
 * A text field for TV pages. Focus rests on it like on a button, so
 * moving past it with the arrows doesn't pop the keyboard up; Select
 * opens the TV's keyboard into it. The keyboard's Done closes it and
 * hands focus back to the field; Back closes it too, and Up and Down
 * leave it as they'd leave the field.
 */
export function Field(props: FieldProps) {
  let own: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  const [editing, setEditing] = createSignal(false)

  const stop = () => {
    setEditing(false)
    focusOn(own ?? null)
  }
  const start = () => {
    setEditing(true)
    input?.focus()
  }
  const setPill = (element: HTMLDivElement | null) => {
    own = element ?? undefined
    props.tapRef?.(element)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const code = event.keyCode
    if (code === 13 || code === IME_DONE) {
      event.preventDefault()
      stop()
      props.onDone?.()
    } else if (code === IME_CANCEL || code === 27 || code === 10009) {
      event.preventDefault()
      stop()
    } else if (code === 38 || code === 40) {
      event.preventDefault()
      stop()
      moveFocus(code === 38 ? "up" : "down")
    }
  }

  return (
    <Tap
      fid={props.fid}
      tapRef={setPill}
      class={cx("ctl field", editing() && "lit", props.class)}
      label={props.placeholder}
      onPress={start}
    >
      {props.icon && <Icon icon={Search} size={22} />}
      <input
        ref={(element) => (input = element)}
        value={props.value}
        // A plain text field, with the keyboard an address wants where the TV has one.
        type="text"
        inputmode={props.type === "url" ? "url" : "text"}
        placeholder={props.placeholder}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        // The pill takes focus; the text only while it's being typed in.
        tabindex={-1}
        style={{ "pointer-events": editing() ? "auto" : "none" }}
        onInput={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setEditing(false)}
      />
    </Tap>
  )
}

/**
 * A search field: a `Field` with the search icon, and with text in it, a
 * clear button at its end, to the right.
 */
export function SearchField(
  props: FieldProps & { clearLabel: string; height?: number; large?: boolean },
) {
  let pill: HTMLDivElement | undefined
  const height = props.height ?? 48
  return (
    <div class="center" style={{ "justify-content": "flex-start" }}>
      <div style={{ flex: 1, "min-width": 0 }}>
        <Field
          {...props}
          tapRef={(element) => (pill = element ?? undefined)}
          icon
          class={cx(props.large ? "t-title" : "t-facts", "search")}
        />
      </div>
      {props.value !== "" && (
        <div style={{ "margin-left": "14rem" }}>
          <RoundButton
            fid="clear"
            icon={X}
            label={props.clearLabel}
            size={height}
            onPress={() => {
              props.onChange("")
              // It goes with the text, so focus goes back to the field.
              focusOn(pill ?? null)
            }}
          />
        </div>
      )}
    </div>
  )
}
