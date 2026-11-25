import { type Json, parseJson } from "../lib/decode"

/*
 * Reading one of the server's streams, the REST form of a procedure that
 * pushes its answers: server-sent events, each a JSON value. The API
 * client can follow these itself, but only on engines with
 * TransformStream, which TVs before 2020 lack, so the app reads the few
 * it needs by hand. No reconnecting: the caller asks again if it wants more.
 */

/**
 * Follows the stream at `url`, calling `onValue` with each value, until
 * it ends or `onValue` says to stop by returning true. Rejects when the
 * server can't be reached or turns the request down.
 */
export async function followStream(
  url: string,
  token: string | null,
  onValue: (value: Json) => boolean,
): Promise<void> {
  const headers = new Headers({ accept: "text/event-stream" })
  if (token) headers.set("authorization", `Bearer ${token}`)
  const response = await fetch(url, { headers })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }
  const reader = response.body.getReader()
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
