import { cn } from "@matinee/ui/lib/utils"
import { createSignal } from "solid-js"

import { ColorPicker } from "@/kit/color-picker"
import { Input } from "@/kit/input"

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

/**
 * A `#rrggbb` text field beside a color picker. Typing reports only complete
 * colors. Leaving the field keeps what `commit` turns into a color and
 * otherwise restores `value`.
 */
export function HexColorInput(props: {
  id: string
  value: string
  /** Names the color for the picker. */
  label: string
  class?: string
  commit: (draft: string) => string | null
  onChange: (color: string) => void
}) {
  // A new value from outside (the picker, a guided change) replaces whatever
  // is typed.
  const [draft, setDraft] = createSignal(() => props.value)

  function updateDraft(next: string) {
    setDraft(next)
    const color = next.trim()
    if (HEX_COLOR_RE.test(color)) props.onChange(color)
  }

  function commitDraft(typed: string) {
    const color = props.commit(typed)
    if (color) props.onChange(color)
    setDraft(color ?? props.value)
  }

  return (
    <div class="flex items-center gap-2">
      <Input
        id={props.id}
        value={draft()}
        spellcheck={false}
        autocomplete="off"
        class={cn("min-w-0 flex-1 font-mono", props.class)}
        onValueChange={updateDraft}
        onBlur={(event) => commitDraft(event.currentTarget.value)}
      />
      <ColorPicker
        value={props.value}
        label={props.label}
        onValueChange={updateDraft}
      />
    </div>
  )
}
