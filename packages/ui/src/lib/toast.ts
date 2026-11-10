import type { ReactNode } from "react"
import { type ExternalToast, toast as sonnerToast } from "sonner"

type Show = (message: ReactNode, data?: ExternalToast) => string | number

/**
 * Every toast gets the corner close button, and an `action` is its only
 * inline button. Lead with a short title and put the detail in
 * `description`: "Couldn't save", then the server's reason.
 */
function withDefaults(show: Show): Show {
  return (message, data) =>
    show(message, { ...data, cancel: undefined, closeButton: true })
}

export const toast = {
  /** No status icon, for news rather than results. */
  message: withDefaults(sonnerToast.message),
  success: withDefaults(sonnerToast.success),
  info: withDefaults(sonnerToast.info),
  warning: withDefaults(sonnerToast.warning),
  error: withDefaults(sonnerToast.error),
  /** A spinner, and no timeout: dismiss it once the work ends. */
  loading: withDefaults(sonnerToast.loading),
  dismiss: sonnerToast.dismiss,
}
