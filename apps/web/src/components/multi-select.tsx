import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@matinee/ui/components/combobox"

export type MultiSelectChoice = { value: string; label: string }

/**
 * Any number of values out of a list: the chosen ones as chips, the rest
 * found by typing in the field among them. A value the list doesn't hold,
 * like a saved one the server no longer offers, stays a chip named by
 * `unknown` until it's taken off.
 */
export function MultiSelect({
  id,
  choices,
  value,
  onChange,
  placeholder,
  empty,
  unknown = (missing) => missing,
  describedBy,
}: {
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
  const anchor = useComboboxAnchor()
  const byValue = new Map(choices.map((choice) => [choice.value, choice]))
  const chosen = value.map(
    (entry) => byValue.get(entry) ?? { value: entry, label: unknown(entry) },
  )
  return (
    <Combobox
      multiple
      items={choices}
      value={chosen}
      isItemEqualToValue={(item, other) => item.value === other.value}
      onValueChange={(next) => onChange(next.map((choice) => choice.value))}
    >
      <ComboboxChips ref={anchor}>
        {chosen.map((choice) => (
          <ComboboxChip key={choice.value} label={choice.label} />
        ))}
        <ComboboxChipsInput
          id={id}
          placeholder={chosen.length ? undefined : placeholder}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(choice: MultiSelectChoice) => (
            <ComboboxItem key={choice.value} value={choice}>
              <span className="min-w-0 flex-1 truncate">{choice.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
