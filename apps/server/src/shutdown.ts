const controller = new AbortController()

/** Aborts once the server starts shutting down. Long jobs check it. */
export const shutdownSignal = controller.signal

export function requestShutdown(): void {
  if (controller.signal.aborted) return
  controller.abort()
}
