import type { PluginAbortSignal } from "./call"
import type { PluginFetchInit, PluginResponse } from "./http"
import type { Json } from "./metadata"
export type { PluginFetchInit, PluginResponse } from "./http"
declare global {
  interface AbortSignal extends PluginAbortSignal {}
  const AbortSignal: {
    // Abort reasons stay in the guest and may be any JavaScript value.
    // oxlint-disable-next-line anti-slop/no-unknown-parameters
    abort(reason?: unknown): AbortSignal
    timeout(ms: number): AbortSignal
    any(signals: PluginAbortSignal[]): AbortSignal
  }
  class AbortController {
    readonly signal: AbortSignal
    // Abort reasons stay in the guest and may be any JavaScript value.
    // oxlint-disable-next-line anti-slop/no-unknown-parameters
    abort(reason?: unknown): void
  }
  function queueMicrotask(callback: () => void): void
  function fetch(
    url: string | { toString(): string },
    init?: PluginFetchInit,
  ): Promise<PluginResponse>
  class URL {
    constructor(url: string, base?: string | URL)
    href: string
    protocol: string
    username: string
    password: string
    host: string
    hostname: string
    port: string
    pathname: string
    search: string
    hash: string
    readonly origin: string
    readonly searchParams: URLSearchParams
    toString(): string
    toJSON(): string
  }
  class URLSearchParams implements Iterable<[string, string]> {
    constructor(
      init?: string | Record<string, string> | Iterable<[string, string]>,
    )
    readonly size: number
    append(name: string, value: string): void
    delete(name: string, value?: string): void
    get(name: string): string | null
    getAll(name: string): string[]
    has(name: string, value?: string): boolean
    set(name: string, value: string): void
    sort(): void
    entries(): IterableIterator<[string, string]>
    keys(): IterableIterator<string>
    values(): IterableIterator<string>
    forEach(
      callback: (value: string, key: string, params: URLSearchParams) => void,
    ): void
    [Symbol.iterator](): IterableIterator<[string, string]>
    toString(): string
  }
  class TextEncoder {
    readonly encoding: "utf-8"
    encode(text?: string): Uint8Array
  }
  class TextDecoder {
    constructor(
      label?: "utf-8" | "utf8" | "unicode-1-1-utf-8",
      options?: { fatal?: boolean; ignoreBOM?: boolean },
    )
    readonly encoding: "utf-8"
    readonly fatal: boolean
    readonly ignoreBOM: boolean
    decode(input?: Uint8Array): string
  }
  function atob(text: string): string
  function btoa(text: string): string
  function setTimeout(
    callback: (...args: Json[]) => void,
    delay?: number,
    ...args: Json[]
  ): number
  function clearTimeout(id: number): void
  const console: Record<
    "log" | "info" | "warn" | "error" | "debug",
    (message: string, detail?: Json) => void
  >
  const crypto: {
    randomUUID(): string
    getRandomValues<
      T extends
        | Int8Array
        | Uint8Array
        | Uint8ClampedArray
        | Int16Array
        | Uint16Array
        | Int32Array
        | Uint32Array
        | BigInt64Array
        | BigUint64Array,
    >(
      array: T,
    ): T
  }
}
