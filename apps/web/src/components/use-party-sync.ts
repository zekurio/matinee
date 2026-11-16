import type {
  PartyMember,
  PartyPlayback,
  PartyStatusReport,
} from "@matinee/contracts"
import {
  HourglassIcon,
  PauseIcon,
  PlayIcon,
  UsersRoundIcon,
} from "lucide-react"
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"

import { perLocale, tr } from "@/i18n"
import { partyPosition } from "@/lib/party"
import type { PlayerStore } from "@/stores/player"

import { bufferedEnd } from "./playback-source"
import { formatTime } from "./player-format"

/** The party a player follows, from the watch page. */
export type PartyLink = {
  playback: PartyPlayback
  /** How far the server's clock is ahead of this one. */
  offsetMs: number
  /** Everyone in the party, the owner first. */
  members: PartyMember[]
  /** The viewer's own account. */
  selfId: string
  /** The members the party paused for, until they catch up. */
  waitingFor: string[]
  /** Another member's name. Null for the viewer, and for someone who left. */
  nameOf: (userId: string) => string | null
  /** Tells the party the viewer played, paused, or moved the file. */
  control: (playing: boolean, positionSeconds: number) => void
  /** Tells the party how this player plays its file. */
  report: (status: Omit<PartyStatusReport, "itemId">) => void
  /** The file played to its end here. */
  ended: () => void
}

const names = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** Who the party waits for, without the viewer. Null when only them. */
export function waitingNames(party: PartyLink): string | null {
  const others = party.waitingFor.flatMap((id) => party.nameOf(id) ?? [])
  return others.length > 0 ? names().format(others) : null
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
// Behind the party, the player only speeds up with this much buffered
// ahead. With less, its connection barely keeps up, and playing faster
// would run the buffer dry sooner.
const AHEAD_S = 10
// A jump past what is buffered takes a moment to play again, while the
// party goes on. So it aims as far ahead as the last such jump took, up
// to a limit, guessing until one has. A wait much longer than that was
// the viewer's or a blocked autoplay, not loading, and teaches nothing.
const LEAD_GUESS_S = 1
const MAX_LEAD_S = 6
const MAX_LANDING_S = 15

type Clock = {
  position: () => number
  duration: () => number
  seek: (to: number) => void
}

function setRate(el: HTMLVideoElement, rate: number) {
  if (el.playbackRate !== rate) el.playbackRate = rate
}

/** Whether the video has enough buffered to play faster for a while. */
function mayHurry(el: HTMLVideoElement): boolean {
  const end = bufferedEnd(el, el.currentTime)
  if (end === null) return false
  // The rest of the file is here, however little that is.
  if (Number.isFinite(el.duration) && end >= el.duration - 0.5) return true
  return end - el.currentTime >= AHEAD_S
}

/**
 * Keeps the video where the party is. The party's state says where it was
 * at some moment on the server's clock and whether it plays; this works
 * out where that is now, each second and whenever the state changes, and
 * plays, pauses, nudges, or jumps to match. A player that buffers falls
 * behind alone and catches up after: faster only with the buffer to
 * spare, and with a jump that aims ahead by its own loading time.
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
  const waited = useRef<string[]>([])
  /** Seconds a jump past the buffer aims ahead of the party. */
  const lead = useRef(LEAD_GUESS_S)
  /** When a jump past the buffer began, until the video plays again. */
  const landing = useRef<number | null>(null)

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
      // A paused party waits where it is, and a jump within the buffer
      // plays at once, so only a playing one past it needs the lead.
      const far =
        playback.playing && bufferedEnd(el, expected - source.offset) === null
      landing.current = far ? now : null
      const ahead = far ? expected + lead.current : expected
      const to = length > 0 ? Math.min(ahead, length) : ahead
      state.setTime(to)
      clock.seek(to)
    }
    // Behind, it hurries only with buffer to spare; ahead, it always may
    // slow down.
    const nudge = () => {
      if (drift > 0) setRate(el, 1 - NUDGE)
      else setRate(el, mayHurry(el) ? 1 + NUDGE : 1)
    }

    if (!playback.playing) {
      if (!el.paused) el.pause()
      setRate(el, 1)
      // A party that waits for this player waits where it paused, so the
      // player loads that very spot.
      const close = party.waitingFor.includes(party.selfId) ? NUDGE_S : JUMP_S
      if (Math.abs(drift) > close && mayJump) jump()
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
      else nudge()
      return
    }
    if (Math.abs(drift) > NUDGE_S) {
      nudge()
    } else if (Math.abs(drift) < SETTLED_S) {
      setRate(el, 1)
    }
  })

  /** Says what another member did, over the picture. */
  const announce = useEffectEvent(
    (before: PartyPlayback | null, waitedBefore: string[]) => {
      if (!party || !before) return
      const { playback } = party
      const { showFlash } = store.getState()
      // A pause for slow players says who it waits for, and its end that
      // everyone caught up, rather than who pressed what.
      if (party.waitingFor.length > 0) {
        if (party.waitingFor.join() === waitedBefore.join()) return
        const who = waitingNames(party)
        showFlash(
          HourglassIcon,
          who
            ? tr("party.flash.waiting", { names: who })
            : tr("party.flash.waitingForYou"),
        )
        return
      }
      if (waitedBefore.length > 0 && playback.playing) {
        showFlash(PlayIcon, tr("party.flash.caughtUp"))
        return
      }
      const name = playback.by ? party.nameOf(playback.by) : null
      if (!name) return
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
    },
  )

  const active = party !== null
  const at = party?.playback.at.getTime()
  const playing = party?.playback.playing
  const positionSeconds = party?.playback.positionSeconds
  const waiting = party?.waitingFor.join()

  /** Takes a state the server sent that differs from the last. */
  const changed = useEffectEvent(() => {
    if (!party) return
    const before = last.current
    const waitedBefore = waited.current
    last.current = party.playback
    waited.current = party.waitingFor
    // The server's state is newer than whatever the viewer just did.
    holdUntil.current = 0
    announce(before, waitedBefore)
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
  }, [active, at, playing, positionSeconds, waiting])

  // A jump past the buffer plays again once it has loaded, and how long
  // that took is the next one's lead.
  useEffect(() => {
    const el = video.current
    if (!active || !el) return
    const landed = () => {
      const since = landing.current
      if (since === null) return
      landing.current = null
      const took = (Date.now() - since) / 1000
      if (took <= MAX_LANDING_S) lead.current = Math.min(took, MAX_LEAD_S)
    }
    el.addEventListener("playing", landed)
    return () => el.removeEventListener("playing", landed)
  }, [active, video])

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
      waited.current = []
      if (video.current) video.current.playbackRate = 1
    }
  }, [active, video, store])

  return {
    active,
    /** The viewer played, paused, or moved the file. */
    tell: (isPlaying: boolean, to: number) => {
      if (!party) return
      holdUntil.current = Date.now() + HOLD_MS
      // The viewer moved it, so the wait that follows isn't a jump's.
      landing.current = null
      party.control(isPlaying, Math.max(0, to))
    },
  }
}
