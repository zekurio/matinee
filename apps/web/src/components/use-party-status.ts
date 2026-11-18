import type { PartyPlayerState } from "@matinee/contracts"
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"

import type { PlayerStore } from "@/stores/player"

import { bufferedEnd } from "./playback-source"
import type { PlayerMedia } from "./player-media"
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
function ready(el: PlayerMedia, hls: boolean): boolean {
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
  video: RefObject<PlayerMedia | null>,
  store: PlayerStore,
  position: () => number,
  party: PartyLink | null,
) {
  const loadingSince = useRef<number | null>(null)
  const sent = useRef<{ state: PartyPlayerState; at: number } | null>(null)

  const check = useEffectEvent(() => {
    const el = video.current
    if (!el || !party) return
    const state = store.getState()
    const now = Date.now()
    const loading = state.waiting || state.pending !== null
    if (!loading) loadingSince.current = null
    else loadingSince.current ??= now

    const waits = party.waitingFor.length > 0
    let next: PartyPlayerState
    if (party.waitingFor.includes(party.selfId)) {
      next = !loading && ready(el, state.source.hls) ? "paused" : "buffering"
    } else if (
      loading &&
      (party.playback.playing || waits) &&
      now - (loadingSince.current ?? now) >= STALL_MS
    ) {
      next = "buffering"
    } else {
      next = el.paused ? "paused" : "playing"
    }

    const last = sent.current
    if (last && last.state === next && now - last.at < STATUS_MS) return
    sent.current = { state: next, at: now }
    const end = bufferedEnd(el, el.currentTime)
    party.report({
      state: next,
      positionSeconds: Math.max(0, position()),
      bufferedSeconds: end === null ? 0 : end - el.currentTime,
      method: state.source.method,
      quality: state.quality,
    })
  })

  const active = party !== null
  useEffect(() => {
    if (!active) return
    check()
    const timer = window.setInterval(check, TICK_MS)
    return () => {
      window.clearInterval(timer)
      sent.current = null
    }
  }, [active])
}
