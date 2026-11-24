import type { t } from "@matinee/contracts/schema"
import {
  type Accessor,
  createSignal,
  createStore,
  onFlush,
  snapshot,
  type Store,
} from "solid-js"

import { translateKnown } from "@/i18n"

/**
 * Checks one field: a contract schema, or a function that returns what's
 * wrong in the contract's English, which `translateKnown` puts in the
 * interface's language.
 */
export type FieldCheck<Value, Values> =
  | t.Type<Value>
  | ((value: Value, values: Values) => string | undefined)

export type FormOptions<Values extends object> = {
  defaultValues: Values
  checks?: {
    readonly [Name in keyof Values]?: FieldCheck<Values[Name], Values>
  }
  /** Runs with the values once every check passes. */
  onSubmit: (values: Values) => void | Promise<void>
}

export type Form<Values extends object> = {
  /** The values, in a store: `form.values().name` tracks that field alone. */
  values: Accessor<Store<Values>>
  set: <Name extends keyof Values>(name: Name, value: Values[Name]) => void
  /** Show validation on blur. Pass false to wait for a submit. */
  blur: (name: keyof Values, showMessage?: boolean) => void
  /**
   * What to show under a field: what's wrong with it, once someone has
   * left it or tried to submit. Reactive, so call it where it's shown.
   */
  message: (name: keyof Values) => string | undefined
  /** Whether every check passes. */
  valid: Accessor<boolean>
  /** Whether a value differs from where the form started or was reset to. */
  dirty: Accessor<boolean>
  /** True while `onSubmit` runs. */
  submitting: Accessor<boolean>
  submit: () => Promise<void>
  /** Back to the default values, or to `values`, with nothing shown as wrong. */
  reset: (values?: Values) => void
}

/**
 * What's wrong with a value, in the contract's English. A schema that
 * answers later than at once isn't one of the contract's, and passes.
 */
function problem<Value, Values>(
  check: FieldCheck<Value, Values>,
  value: Value,
  values: Values,
): string | undefined {
  if (!("~standard" in check)) return check(value, values)
  const result = check["~standard"].validate(value)
  if (result instanceof Promise) return undefined
  return result.issues?.[0]?.message
}

/**
 * A form's state: its values in a store, each field checked as it changes,
 * and what's wrong shown only after someone has left the field or tried to
 * submit. Fields validate with the contract's `t` schemas.
 *
 * TanStack Form has no Solid 2 build yet. This covers what the React app's
 * forms use of it: values, `set`, `reset`, checks on change, and a submit
 * that waits.
 */
export function createForm<Values extends object>(
  options: FormOptions<Values>,
): Form<Values> {
  const [start, setStart] = createSignal({ values: options.defaultValues })
  // Boxed, since a store's own type can't be a bare type parameter.
  const [state, setState] = createStore({
    values: structuredClone(options.defaultValues),
  })
  const values = () => state.values
  const [left, setLeft] = createSignal<ReadonlySet<keyof Values>>(new Set())
  const [attempts, setAttempts] = createSignal(0)
  const [submitting, setSubmitting] = createSignal(false)
  let inFlight = false

  const names = () => {
    // SAFETY: the store holds exactly the default values' keys.
    const keys = Object.keys(options.defaultValues) as (keyof Values)[]
    return keys
  }
  const wrong = (name: keyof Values): string | undefined => {
    const checks = options.checks
    if (!checks) return undefined
    const check = checks[name]
    return check ? problem(check, values()[name], values()) : undefined
  }
  const valid = () => names().every((name) => wrong(name) === undefined)

  return {
    values,
    set: (name, value) =>
      setState((draft) => {
        draft.values[name] = value
      }),
    blur: (name, showMessage = true) =>
      setLeft((before) => {
        if (before.has(name) === showMessage) return before
        const next = new Set(before)
        if (showMessage) next.add(name)
        else next.delete(name)
        return next
      }),
    message: (name) => {
      if (attempts() === 0 && !left().has(name)) return undefined
      const found = wrong(name)
      return found === undefined ? undefined : translateKnown(found)
    },
    valid,
    dirty: () =>
      names().some((name) => !Object.is(values()[name], start().values[name])),
    submitting,
    submit: async () => {
      setAttempts((count) => count + 1)
      if (inFlight || !valid()) return
      // Signal writes commit later, so guard even two submits in one turn.
      inFlight = true
      setSubmitting(true)
      try {
        const submitted = snapshot(values())
        // Publish the spinner before a submit callback can start an action.
        await new Promise<void>((resolve) => onFlush(resolve))
        await options.onSubmit(submitted)
      } finally {
        inFlight = false
        setSubmitting(false)
      }
    },
    reset: (next = start().values) => {
      setStart({ values: next })
      setState((draft) => {
        draft.values = structuredClone(next)
      })
      setLeft(new Set<keyof Values>())
      setAttempts(0)
    },
  }
}
