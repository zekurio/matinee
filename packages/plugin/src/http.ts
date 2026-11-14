import type { PluginAbortSignal } from "./call"
import type { Json } from "./metadata"
/** Buffered HTTP input. No streaming, Request, or FormData. */
export interface PluginFetchInit {
  signal?: PluginAbortSignal
  method?: string
  headers?: Record<string, string> | [string, string][]
  body?: string | Uint8Array
}
/** The response returned by the guest fetch function. There is no Response constructor. */
export interface PluginResponse {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
  readonly headers: {
    get(name: string): string | null
    entries(): IterableIterator<[string, string]>
  }
  text(): Promise<string>
  json(): Promise<Json>
  arrayBuffer(): Promise<ArrayBuffer>
}
/** Narrow declarations can also be used by helpers without changing host globals. */
export type PluginFetch = (
  url: string | { toString(): string },
  init?: PluginFetchInit,
) => Promise<PluginResponse>
