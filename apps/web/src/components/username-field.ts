import type { AnyFieldApi } from "@tanstack/react-form"

/**
 * For a username `TextField`'s `onBlur`. Leaving the field empty isn't a
 * mistake yet, so the blur `TextField` just recorded is taken back and the
 * error waits for a submit.
 */
export function forgetEmptyBlur(field: AnyFieldApi) {
  if (field.state.value !== "") return
  field.setMeta((meta) => ({ ...meta, isBlurred: false }))
}
