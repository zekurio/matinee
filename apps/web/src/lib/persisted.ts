import type { t } from "@matinee/contracts/schema"
import { type Accessor, createSignal } from "solid-js"

/**
 * A signal kept in `localStorage` under `key` and shared by every tab.
 * What's stored is parsed with `schema`; anything else reads as `fallback`.
 */
export function persisted<Value>(
  key: string,
  schema: t.Type<Value>,
  fallback: Value,
): readonly [Accessor<Value>, (value: Value) => void] {
  const read = (): Value => {
    try {
      const parsed = schema["~standard"].validate(
        JSON.parse(window.localStorage.getItem(key) ?? "null"),
      )
      // The contract's schemas answer at once; one that doesn't isn't one.
      if (parsed instanceof Promise || parsed.issues) return fallback
      return parsed.value
    } catch {
      // Storage that's blocked or holds something else.
      return fallback
    }
  }
  // Boxed, since a bare function would read as a derived signal.
  const [box, setBox] = createSignal({ value: read() })
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === key) setBox({ value: read() })
  })
  return [
    () => box().value,
    (next) => {
      setBox({ value: next })
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage that's full or blocked: the choice lasts for this visit.
      }
    },
  ]
}
