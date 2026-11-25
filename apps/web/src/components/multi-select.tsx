import { createMemo, For } from "solid-js"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/kit/combobox"

export type MultiSelectChoice = { value: string; label: string }

/**
 * Any number of values out of a list: the chosen ones as chips, the rest
 * found by typing in the field among them. A value the list doesn't hold,
 * like a saved one the server no longer offers, stays a chip named by
 * `unknown` until it's taken off.
 */
export function MultiSelect(props: {
  /** The text field's, for its label. */
  id: string
  choices: readonly MultiSelectChoice[]
  value: readonly string[]
  onChange: (value: string[]) => void
  /** What the field says while nothing is chosen. */
  placeholder: string
  /** What the list says when nothing matches what's typed. */
  empty: string
  unknown?: (value: string) => string
  describedBy?: string
}) {
  const labels = createMemo(
    () => new Map(props.choices.map((choice) => [choice.value, choice.label])),
  )
  const labelOf = (value: string) =>
    labels().get(value) ?? props.unknown?.(value) ?? value
  return (
    <Combobox
      multiple
      value={[...props.value]}
      itemToLabel={labelOf}
      onValueChange={(next) => props.onChange(next)}
    >
      <ComboboxChips>
        <For each={props.value}>
          {(value) => <ComboboxChip value={value} label={labelOf(value)} />}
        </For>
        <ComboboxChipsInput
          id={props.id}
          placeholder={props.value.length ? undefined : props.placeholder}
          aria-describedby={props.describedBy}
          autocomplete="off"
          spellcheck={false}
        />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>{props.empty}</ComboboxEmpty>
        <ComboboxList>
          <For each={props.choices}>
            {(choice) => (
              <ComboboxItem value={choice.value} label={choice.label}>
                <span class="min-w-0 flex-1 truncate">{choice.label}</span>
              </ComboboxItem>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
