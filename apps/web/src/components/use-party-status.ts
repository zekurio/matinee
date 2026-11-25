import type { PartyPlayerState } from "@matinee/contracts"
import { type Accessor, createEffect, createMemo } from "solid-js"

import { bufferedEnd } from "@/components/playback-source"
import type { PlayerStore } from "@/stores/player"

import type { PartyLink } from "./use-party-sync"

const TICK_MS = 1000
// A player tells the party how it plays this often, and at once when
// that changes.
const STATUS_MS = 5_000
// Loading this long while the party plays, the player holds it up.
const STALL_MS = 2_000
// Where the party waits for it, the player is ready with this much
// loaded, or with less when the browser stopped loading for now.
const READY_S = 8

/** Whether a paused video has loaded enough to play on from where it is. */
function ready(el: HTMLVideoElement, hls: boolean): boolean {
  if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false
  const end = bufferedEnd(el, el.currentTime)
  if (end === null) return false
  if (Number.isFinite(el.duration) && end >= el.duration - 0.5) return true
  const ahead = end - el.currentTime
  if (ahead >= READY_S) return true
  // A browser that plays the file itself stops loading at what it takes
  // as enough, and the party would wait for more forever. hls.js loads on
  // regardless, so its idle says nothing.
  return !hls && el.networkState === HTMLMediaElement.NETWORK_IDLE && ahead >= 1
}

/**
 * Reports to the party how this player plays its file, which is what the
 * party pauses on when the player can't keep up and what its members see
 * of each other. While the party waits for this player, it says when it
 * has loaded enough where the party waits.
 */
export function usePartyStatus(
  video: () => HTMLVideoElement | undefined,
  store: PlayerStore,
  position: () => number,
  party: Accessor<PartyLink | null>,
) {
  let loadingSince: number | null = null
  let sent: { state: PartyPlayerState; at: number } | null = null

  const check = () => {
    const el = video()
    const link = party()
    if (!el || !link) return
    const state = store.getState()
    const now = Date.now()
    const loading = state.waiting || state.pending !== null
    if (!loading) loadingSince = null
    else loadingSince ??= now

    const waits = link.waitingFor.length > 0
    let next: PartyPlayerState
    if (link.waitingFor.includes(link.selfId)) {
      next = !loading && ready(el, state.source.hls) ? "paused" : "buffering"
    } else if (
      loading &&
      (link.playback.playing || waits) &&
      now - (loadingSince ?? now) >= STALL_MS
    ) {
      next = "buffering"
    } else {
      next = el.paused ? "paused" : "playing"
    }

    if (sent && sent.state === next && now - sent.at < STATUS_MS) return
    sent = { state: next, at: now }
    const end = bufferedEnd(el, el.currentTime)
    link.report({
      state: next,
      positionSeconds: Math.max(0, position()),
      bufferedSeconds: end === null ? 0 : end - el.currentTime,
      method: state.source.method,
      quality: state.quality,
    })
  }

  const active = createMemo(() => party() !== null)
  createEffect(active, (following) => {
    if (!following) return
    // Once this run is over, as the timer's checks are, since a check reads
    // the party as it is then.
    queueMicrotask(check)
    const timer = window.setInterval(check, TICK_MS)
    return () => {
      window.clearInterval(timer)
      sent = null
    }
  })
}
