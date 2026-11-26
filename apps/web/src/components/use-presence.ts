import { onSettled } from "solid-js"

import { client, refused } from "@/lib/rpc"

const RETRY_MS = 1000
const MAX_RETRY_MS = 5000

/**
 * Holds the server's presence stream for `sessionId` open while the
 * component is mounted. The server takes a player for gone when its last
 * presence connection drops, so the player holds one for as long as it
 * shows the session, paused or not.
 *
 * The server ends the stream every few minutes, and the next one opens
 * from that end itself rather than on a timer: a hidden tab's timers run
 * as seldom as once a minute, longer than the server waits. Only a
 * stream that failed waits before the next. One the server turns down
 * isn't asked for again, and the reports carry the session as before.
 */
export function usePresence(sessionId: string) {
  onSettled(() => {
    const closing = new AbortController()
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms)
        closing.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer)
            resolve()
          },
          { once: true },
        )
      })
    const hold = async () => {
      let delay = 0
      while (!closing.signal.aborted) {
        // Ended by the server after its one event, the only end that
        // needs no wait.
        let ended = false
        try {
          const stream = await client.playback.presence(
            { sessionId },
            { signal: closing.signal },
          )
          let opened = false
          for await (const presence of stream) {
            opened = presence.graceSeconds > 0
          }
          ended = opened
        } catch (cause) {
          if (cause instanceof Error && refused(cause)) return
        }
        if (closing.signal.aborted) return
        if (ended) {
          delay = 0
          continue
        }
        delay = delay === 0 ? RETRY_MS : Math.min(delay * 2, MAX_RETRY_MS)
        await wait(delay)
      }
    }
    void hold()
    return () => closing.abort()
  })
}
