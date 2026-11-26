import { type Json, parseJson } from "../lib/decode"

/*
 * Reading one of the server's streams, the REST form of a procedure that
 * pushes its answers: server-sent events, each a JSON value. The API
 * client can follow these itself, but only on engines with
 * TransformStream, which TVs before 2020 lack, so the app reads the few
 * it needs by hand. No reconnecting: the caller asks again if it wants more.
 */

/**
 * Where a caller stops a stream it holds open. `followStream` sets `stop`
 * before it asks the server, so a stop asked for while the answer is on
 * its way is taken as soon as the reader exists.
 */
export type StreamHandle = { stop?: () => void }

/** The server answered a stream's request with an error, `status`. */
export class StreamRefused extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/**
 * Follows the stream at `url`, calling `onValue` with each value, until
 * it ends, `onValue` says to stop by returning true, or `handle.stop` is
 * called. Rejects when the server can't be reached or turns the request
 * down.
 */
export async function followStream(
  url: string,
  token: string | null,
  onValue: (value: Json) => boolean,
  handle?: StreamHandle,
): Promise<void> {
  let stopped = false
  let cancel: (() => void) | null = null
  if (handle) {
    handle.stop = () => {
      stopped = true
      if (cancel) cancel()
    }
  }
  const headers = new Headers({ accept: "text/event-stream" })
  if (token) headers.set("authorization", `Bearer ${token}`)
  const response = await fetch(url, { headers })
  if (!response.ok || !response.body) {
    throw new StreamRefused(response.status)
  }
  const reader = response.body.getReader()
  cancel = () => {
    void reader.cancel().catch(() => {})
  }
  if (stopped) {
    cancel()
    return
  }
  const decoder = new TextDecoder()
  let pending = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    pending += decoder.decode(value, { stream: true })
    // An event ends with a blank line.
    const events = pending.split(/\r?\n\r?\n/)
    pending = events.pop() ?? ""
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
      const parsed = data === "" ? undefined : parseJson(data)
      if (parsed !== undefined && onValue(parsed)) {
        void reader.cancel().catch(() => {})
        return
      }
    }
  }
}
