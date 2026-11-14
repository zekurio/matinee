/** Cancellation for one invocation of a plugin handler. */
export type PluginCall = { signal: PluginAbortSignal }
export type PluginAbortEvent = { type: "abort"; target: PluginAbortSignal }
export type PluginAbortListener = (event: PluginAbortEvent) => void
/** The guest's cancellation signal, without DOM or Node declarations. */
export interface PluginAbortSignal {
  readonly aborted: boolean
  readonly reason: unknown
  throwIfAborted(): void
  onabort: PluginAbortListener | null
  addEventListener(
    type: "abort",
    listener: PluginAbortListener,
    options?: { once?: boolean },
  ): void
  removeEventListener(type: "abort", listener: PluginAbortListener): void
}
