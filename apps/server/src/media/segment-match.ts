/*
 * Finding the audio two episodes share, as Jellyfin's Intro Skipper
 * plugin does: chromaprint turns a stretch of audio into a point per
 * eighth of a second, and the opening titles of a show sound alike in
 * every episode, wherever they start. Points that are equal in both
 * suggest how far one is shifted against the other. At each likely shift
 * the points are lined up, and the longest run of points that differ in
 * only a few bits is the part they share.
 */

/** Seconds of audio per chromaprint point: 4096 samples at 11025 Hz, a third apart. */
export const POINT_SECONDS = 4096 / 11025 / 3

/** Points this many bits apart still sound alike. */
const MAX_BIT_DIFFERENCE = 6
/** A run goes on over a gap of up to this many seconds of points that differ. */
const MAX_GAP_SECONDS = 3.5
/** How many of the likeliest shifts get lined up. */
const SHIFTS_TRIED = 25
/**
 * A point sums up the next 2.7 s of audio, and still matches when about
 * the last half of that differs. So shared audio goes on for about this
 * long after the last point that matches, as measured on stretches with a
 * known end.
 */
const END_LAG_SECONDS = 1

/** A stretch both fingerprints share, in seconds into each. */
export type SharedAudio = {
  a: { start: number; end: number }
  b: { start: number; end: number }
}

function bitCount(value: number): number {
  let x = value - ((value >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff
}

/** The shifts of `b` against `a` that line up the most equal points, likeliest first. */
function likelyShifts(a: Uint32Array, b: Uint32Array): number[] {
  const where = new Map<number, number[]>()
  for (let j = 0; j < b.length; j++) {
    const value = b[j] ?? 0
    const list = where.get(value)
    if (list) list.push(j)
    else where.set(value, [j])
  }
  const votes = new Map<number, number>()
  for (let i = 0; i < a.length; i++) {
    for (const j of where.get(a[i] ?? 0) ?? []) {
      votes.set(j - i, (votes.get(j - i) ?? 0) + 1)
    }
  }
  return [...votes]
    .sort((x, y) => y[1] - x[1])
    .slice(0, SHIFTS_TRIED)
    .map(([shift]) => shift)
}

/**
 * The longest stretch of audio the two fingerprints share, or null when
 * they share none. Times are seconds from the start of each fingerprint.
 */
export function sharedAudio(
  a: Uint32Array,
  b: Uint32Array,
): SharedAudio | null {
  const maxGap = Math.round(MAX_GAP_SECONDS / POINT_SECONDS)
  let best: { from: number; to: number; shift: number } | null = null
  for (const shift of likelyShifts(a, b)) {
    const first = Math.max(0, -shift)
    const last = Math.min(a.length, b.length - shift)
    let from = -1
    let previous = -1
    for (let i = first; i < last; i++) {
      if (bitCount((a[i] ?? 0) ^ (b[i + shift] ?? 0)) > MAX_BIT_DIFFERENCE) {
        continue
      }
      if (from < 0 || i - previous > maxGap) from = i
      previous = i
      if (!best || i - from > best.to - best.from) {
        best = { from, to: i, shift }
      }
    }
  }
  if (!best || best.to === best.from) return null
  return {
    a: {
      start: best.from * POINT_SECONDS,
      end: best.to * POINT_SECONDS + END_LAG_SECONDS,
    },
    b: {
      start: (best.from + best.shift) * POINT_SECONDS,
      end: (best.to + best.shift) * POINT_SECONDS + END_LAG_SECONDS,
    },
  }
}
