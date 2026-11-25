import { createSignal, createStore, onFlush, snapshot } from "solid-js"

import type { Form } from "@/lib/form"

/**
 * A settings form. Until the first edit it shows `initial`, so a refetch
 * or a value the server streams shows through; after it, the edits, until a save or a reset. It's dirty
 * while the edits differ from `initial`. It checks nothing itself: the
 * submit checks the whole draft, and throws for the save bar to show.
 */
export function createDraftForm<Values extends object>(options: {
  initial: () => Values
  onSubmit: (values: Values) => void | Promise<void>
}): Form<Values> {
  // Boxed, since a store's own type can't be a bare type parameter.
  const [state, setState] = createStore<{ edits: Values | undefined }>({
    edits: undefined,
  })
  const [submitting, setSubmitting] = createSignal(false)
  let inFlight = false
  const values = () => state.edits ?? options.initial()
  const reset = () =>
    setState((draft) => {
      draft.edits = undefined
    })

  return {
    values,
    set: (name, value) =>
      setState((draft) => {
        // Query data is a store, which only a snapshot of clones.
        const edits =
          draft.edits ?? structuredClone(snapshot(options.initial()))
        edits[name] = value
        draft.edits = edits
      }),
    blur: () => {},
    message: () => undefined,
    valid: () => true,
    dirty: () => {
      const edits = state.edits
      if (edits === undefined) return false
      return (
        JSON.stringify(snapshot(edits)) !== JSON.stringify(options.initial())
      )
    },
    submitting,
    submit: async () => {
      if (inFlight) return
      inFlight = true
      setSubmitting(true)
      try {
        const submitted = structuredClone(snapshot(values()))
        // Publish the spinner before the submit can start an action.
        await new Promise<void>((resolve) => onFlush(resolve))
        await options.onSubmit(submitted)
      } finally {
        inFlight = false
        setSubmitting(false)
      }
    },
    // After a save the cache holds what was saved, so `initial` is it.
    reset,
  }
}
