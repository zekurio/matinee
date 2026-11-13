import type { PartyPlayback } from "@matinee/contracts"
import { PauseIcon, PlayIcon, UsersRoundIcon } from "lucide-react"
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"

import { tr } from "@/i18n"
import { partyPosition } from "@/lib/party"
import type { PlayerStore } from "@/stores/player"

import { formatTime } from "./player-format"

/** The party a player follows, from the watch page. */
export type PartyLink = {
  playback: PartyPlayback
  /** How far the server's clock is ahead of this one. */
  offsetMs: number
  /** How many are in the party. */
  watching: number
  /** Another member's name. Null for the viewer, and for someone who left. */
  nameOf: (userId: string) => string | null
  /** Tells the party the viewer played, paused, or moved the file. */
  control: (playing: boolean, positionSeconds: number) => void
  /** The file played to its end here. */
  ended: () => void
}

const TICK_MS = 1000
// After the viewer's own play, pause, or seek, the party's older state is
// left alone this long, until the server sends the new one.
const HOLD_MS = 1500
// Further off than this, the player jumps to where the party is.
const JUMP_S = 2
// Closer than a jump, it plays a little faster or slower to close the gap,
// and back at normal speed once it has.
const NUDGE_S = 0.3
const SETTLED_S = 0.1
const NUDGE = 0.08
// A jump takes a moment to load, and one in a copied stream lands on a
// keyframe, seconds from where it aimed. The player waits this long
// before it jumps again, and nudges in the meantime.
const JUMP_AGAIN_MS = 8_000
const JUMP_AGAIN_COPIED_MS = 30_000

type Clock = {
  position: () => number
  duration: () => number
  seek: (to: number) => void
}

function setRate(el: HTMLVideoElement, rate: number) {
  if (el.playbackRate !== rate) el.playbackRate = rate
}

/**
 * Keeps the video where the party is. The party's state says where it was
 * at some moment on the server's clock and whether it plays; this works
 * out where that is now, each second and whenever the state changes, and
 * plays, pauses, nudges, or jumps to match. A player that buffers falls
 * behind alone and catches up after.
 *
 * `tell` is for the viewer's own play, pause, and seek. Following the
 * party never tells it anything, or two players would answer each other
 * forever.
 */
export function usePartySync(
  video: RefObject<HTMLVideoElement | null>,
  store: PlayerStore,
  clock: Clock,
  party: PartyLink | null,
) {
  const holdUntil = useRef(0)
  const jumpedAt = useRef(0)
  const last = useRef<PartyPlayback | null>(null)

  const apply = useEffectEvent((fresh: boolean) => {
    const el = video.current
    if (!el || !party) return
    const state = store.getState()
    // A source on its way, a drag of the seek bar, or the viewer's own
    // change come first.
    if (state.pending !== null || state.scrub !== null) return
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return
    const now = Date.now()
    if (now < holdUntil.current) return

    const { playback, offsetMs } = party
    const length = clock.duration()
    const target = partyPosition(playback, offsetMs)
    const expected = length > 0 ? Math.min(target, length) : target
    const drift = clock.position() - expected
    const { source } = state
    const wait =
      source.method === "remux" && !source.hls
        ? JUMP_AGAIN_COPIED_MS
        : JUMP_AGAIN_MS
    const mayJump = fresh || now - jumpedAt.current > wait
    const jump = () => {
      jumpedAt.current = now
      setRate(el, 1)
      state.setTime(expected)
      clock.seek(expected)
    }

    if (!playback.playing) {
      if (!el.paused) el.pause()
      setRate(el, 1)
      if (Math.abs(drift) > JUMP_S && mayJump) jump()
      return
    }
    // The party is at the end, so this player runs out on its own.
    if (length > 0 && expected >= length - 1) return
    if (el.paused) {
      // A browser that blocks autoplay leaves it to the viewer's press.
      void el.play().catch(() => {})
    }
    if (state.waiting) return
    if (Math.abs(drift) > JUMP_S) {
      if (mayJump) jump()
      else setRate(el, drift < 0 ? 1 + NUDGE : 1 - NUDGE)
      return
    }
    if (Math.abs(drift) > NUDGE_S) {
      setRate(el, drift < 0 ? 1 + NUDGE : 1 - NUDGE)
    } else if (Math.abs(drift) < SETTLED_S) {
      setRate(el, 1)
    }
  })

  /** Says what another member did, over the picture. */
  const announce = useEffectEvent((before: PartyPlayback | null) => {
    if (!party || !before) return
    const { playback } = party
    const name = playback.by ? party.nameOf(playback.by) : null
    if (!name) return
    const { showFlash } = store.getState()
    if (playback.playing !== before.playing) {
      if (playback.playing)
        showFlash(PlayIcon, tr("party.flash.played", { name }))
      else showFlash(PauseIcon, tr("party.flash.paused", { name }))
      return
    }
    showFlash(
      UsersRoundIcon,
      tr("party.flash.moved", {
        name,
        time: formatTime(playback.positionSeconds),
      }),
    )
  })

  const active = party !== null
  const at = party?.playback.at.getTime()
  const playing = party?.playback.playing
  const positionSeconds = party?.playback.positionSeconds

  /** Takes a state the server sent that differs from the last. */
  const changed = useEffectEvent(() => {
    if (!party) return
    const before = last.current
    last.current = party.playback
    // The server's state is newer than whatever the viewer just did.
    holdUntil.current = 0
    announce(before)
    apply(true)
  })

  // Follows the party: at once when its state changes, then each second.
  // The server sends the same state again every little while, which
  // changes none of its parts.
  useEffect(() => {
    if (!active) return
    changed()
    const timer = window.setInterval(() => apply(false), TICK_MS)
    return () => window.clearInterval(timer)
  }, [active, at, playing, positionSeconds])

  // A party plays at normal speed, and the video goes back to it after.
  useEffect(() => {
    if (!active) return
    const el = video.current
    if (el) {
      el.defaultPlaybackRate = 1
      el.playbackRate = 1
    }
    store.getState().setSpeed(1)
    return () => {
      last.current = null
      if (video.current) video.current.playbackRate = 1
    }
  }, [active, video, store])

  return {
    active,
    /** The viewer played, paused, or moved the file. */
    tell: (isPlaying: boolean, to: number) => {
      if (!party) return
      holdUntil.current = Date.now() + HOLD_MS
      party.control(isPlaying, Math.max(0, to))
    },
  }
}
