import { createSignal, onSettled } from "solid-js"

import { toast } from "@/kit/toast"

import { errorMessage } from "./rpc"

export type ActionFeedback =
  | { state: "idle" | "pending" | "success" }
  | { state: "error"; message: string }

/** Feedback is an accessor. Call this once per action button under a component owner. */
export function useActionFeedback(
  options: { successDuration?: number; failed?: string } = {},
) {
  const [feedback, setFeedback] = createSignal<ActionFeedback>({
    state: "idle",
  })
  let timer: number | undefined
  let disposed = false

  onSettled(() => () => {
    disposed = true
    window.clearTimeout(timer)
  })

  const reset = () => {
    window.clearTimeout(timer)
    setFeedback({ state: "idle" })
  }

  /** Resolves true when the action succeeded. */
  const run = async (action: () => void | Promise<void>): Promise<boolean> => {
    window.clearTimeout(timer)
    setFeedback({ state: "pending" })
    try {
      await action()
      if (!disposed) {
        setFeedback({ state: "success" })
        timer = window.setTimeout(reset, options.successDuration ?? 1400)
      }
      return true
    } catch (cause) {
      const message = errorMessage(cause)
      if (!disposed) setFeedback({ state: "error", message })
      if (options.failed === undefined) toast.error(message)
      else toast.error(options.failed, { description: message })
      return false
    }
  }

  return { feedback, reset, run }
}
