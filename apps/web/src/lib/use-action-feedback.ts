import { toast } from "@matinee/ui/components/sonner"
import { useCallback, useEffect, useRef, useState } from "react"

import { errorMessage } from "./rpc"

export type ActionFeedback =
  | { state: "idle" | "pending" | "success" }
  | { state: "error"; message: string }

/**
 * How an action went, for the button that started it to show. Success
 * clears itself after a moment. An error stays until the next run or a
 * reset, and its message goes to a toast: under `failed` when given, as
 * the toast's title otherwise.
 */
export function useActionFeedback({
  successDuration = 1400,
  failed,
}: { successDuration?: number; failed?: string } = {}) {
  const [feedback, setFeedback] = useState<ActionFeedback>({ state: "idle" })
  const resetTimer = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = null
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    setFeedback({ state: "idle" })
  }, [clearTimer])

  // Drops the success timer when the button's owner unmounts.
  useEffect(() => clearTimer, [clearTimer])

  /** Resolves true when the action succeeded. Never rejects. */
  const run = useCallback(
    async (action: () => void | Promise<void>): Promise<boolean> => {
      clearTimer()
      setFeedback({ state: "pending" })
      try {
        await action()
        setFeedback({ state: "success" })
        resetTimer.current = window.setTimeout(reset, successDuration)
        return true
      } catch (cause) {
        const message = errorMessage(cause)
        setFeedback({ state: "error", message })
        if (failed === undefined) toast.error(message)
        else toast.error(failed, { description: message })
        return false
      }
    },
    [clearTimer, reset, successDuration, failed],
  )

  return { feedback, reset, run }
}
