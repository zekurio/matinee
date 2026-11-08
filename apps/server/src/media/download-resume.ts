import { unlink } from "node:fs/promises"
import { join } from "node:path"

import { t } from "@matinee/contracts/schema"

import { env } from "../env"
import { run, runBytes, runProcess } from "./process"

/*
 * Picking a download's audio up again where a stopped run left it, so the
 * file plays through the join without a gap, an overlap, or a click.
 *
 * A kept track is easy: the new run drops every packet the last segment
 * already has. A converted track needs the new encode to continue the old
 * one sample for sample. The old run's packets say exactly where it
 * stopped: packet j of an encode holds the samples from j * frame minus
 * the encoder's delay, so the packet count of the segments so far gives
 * the next sample to encode. The new run starts its encoder some frames
 * before that, on the old run's frame grid, and drops what comes before.
 *
 * What a seek can't give is where the decode after it lands, counted in
 * samples from the start: Matroska stores times in milliseconds, so the
 * first frame after a seek is off by up to half of one. Frames sit on a
 * fixed grid from the start, though, so the true position is the grid
 * point near the rounded one. Frames longer than the rounding (AAC, AC-3,
 * DTS, FLAC, Opus) leave one; TrueHD's frames are shorter, and the few
 * candidates are told apart by encoding each and comparing it with the
 * end of the last segment. A track converted to another sample rate also
 * starts its resampler on a sample that keeps the old run's phase.
 */

// Seconds of encode before the join, so the encoder settles into what it
// did the first time.
const WARMUP_S = 6
// The decode after a seek settles its timestamps within this.
const SETTLE_S = 0.25
// How far before the earliest start the audio input seeks, and how much
// further back each retry goes when the seek landed too late.
const SEEK_LEAD_S = 1.5
const SEEK_BACK_S = 5
const SEEK_ATTEMPTS = 3
// Rounding of Matroska's millisecond times, twice, in seconds.
const ROUNDING_S = 0.002
const PROBE_TIMEOUT_MS = 60_000
// A packet this much before the join is the last segment's, even with
// times rounded to the millisecond.
const DROP_SLACK_S = 0.001
// How much of the end of the last segment the candidates are compared on,
// and what makes the comparison tell them apart: audio louder than about
// -80 dBFS, and the best candidate well ahead of the next.
const COMPARE_S = 3
const AUDIBLE_POWER = 1e-8
const CLEAR_LEAD = 0.25

/** Where an audio track of a download stands after a segment. */
export type TrackEnd = {
  /** Decode time after its last sample, in `scale` ticks per second. */
  end: number
  /** Packets in this segment and every one before it. */
  total: number
  scale: number
}

/** What the planner needs to know of each audio track of a download. */
export type ResumeTrack = {
  /** The stream index in the source file. */
  source: number
  copy: boolean
  /** The encoder and its options, for output 0, as a probe takes them. */
  encoderArgs: string[]
  /** Channels the encoder gets. */
  channels: number
  /** The track's own filters, in order. */
  filters: string[]
  /** The filters end in a resampler to the encoder's rate. */
  resamples: boolean
}

/** Filters that go around a track's own, before and after them. */
type Around = { before: string[]; after: string[] }

/** How a run after a break takes its audio. */
export type AudioResume = {
  /** A second input of the file, seeked before the join. */
  input: string[]
  /** Per audio output: filters around the track's own, and a packet filter. */
  tracks: (Around & { bsf: string })[]
}

type Frame = { pts: number; rate: number; samples: number }

const FRAME_LINE = / pts:(-?\d+) .*? rate:(\d+) nb_samples:(\d+)/

/** The first frames a decode gives, after a seek and a cut if asked. */
async function decodedFrames(
  path: string,
  source: number,
  count: number,
  seek: number | null,
  cut = 0,
): Promise<Frame[]> {
  const frames: Frame[] = []
  await runProcess({
    name: "ffmpeg",
    command: env.MATINEE_FFMPEG_PATH,
    args: [
      "-hide_banner",
      "-nostdin",
      ...seekArgs(seek),
      "-i",
      path,
      "-copyts",
      "-start_at_zero",
      "-map",
      `0:${source}`,
      "-af",
      [...(cut > 0 ? [`atrim=start_sample=${cut}`] : []), "ashowinfo"].join(
        ",",
      ),
      "-frames:a",
      String(count),
      "-f",
      "null",
      "-",
    ],
    timeoutMs: PROBE_TIMEOUT_MS,
    onStderrLine: (line) => {
      const match = FRAME_LINE.exec(line)
      if (match) {
        frames.push({
          pts: Number(match[1]),
          rate: Number(match[2]),
          samples: Number(match[3]),
        })
      }
    },
  })
  return frames
}

const startFrames = new Map<string, Promise<Frame[]>>()
// Streams whose first frames stay known; the oldest go first.
const START_FRAMES_KEPT = 64

/** The first frames of a stream from its start, which don't change. */
function framesFromStart(path: string, source: number): Promise<Frame[]> {
  const key = `${path}\n${source}`
  let frames = startFrames.get(key)
  if (!frames) {
    frames = decodedFrames(path, source, 40, null)
    frames.catch(() => startFrames.delete(key))
    startFrames.set(key, frames)
    const oldest = startFrames.keys().next().value
    if (startFrames.size > START_FRAMES_KEPT && oldest !== undefined) {
      startFrames.delete(oldest)
    }
  }
  return frames
}

type Timing = { padding: number; frame: number }

const timings = new Map<string, Promise<Timing>>()

const LAYOUTS = new Map([
  [1, "mono"],
  [2, "stereo"],
  [6, "5.1"],
  [8, "7.1"],
])

/**
 * An encoder's delay and frame length, from a short encode of silence
 * starting at 0: its first packet comes the delay before that.
 */
function encoderTiming(
  args: readonly string[],
  rate: number,
  channels: number,
): Promise<Timing> {
  const key = JSON.stringify([args, rate, channels])
  let timing = timings.get(key)
  if (!timing) {
    timing = run(
      env.MATINEE_FFMPEG_PATH,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${rate}:cl=${LAYOUTS.get(channels) ?? `${channels}c`}`,
        "-t",
        "0.2",
        ...args,
        "-f",
        "framecrc",
        "-",
      ],
      PROBE_TIMEOUT_MS,
    ).then((output) => {
      const line = output
        .split("\n")
        .find((entry) => entry.trim() && !entry.startsWith("#"))
      const fields = line?.split(",").map((field) => Number(field.trim()))
      const pts = fields?.[2]
      const frame = fields?.[3]
      if (pts === undefined || !frame || Number.isNaN(pts)) {
        throw new Error("ffmpeg printed no packet for the encoder's timing")
      }
      return { padding: -pts, frame }
    })
    timing.catch(() => timings.delete(key))
    timings.set(key, timing)
  }
  return timing
}

const TimeBases = t.object({
  streams: t
    .array(t.object({ index: t.number().int(), time_base: t.string() }))
    .catch([]),
})

/** Whether the stream's timestamps count whole samples at `rate`. */
async function exactTimes(
  path: string,
  source: number,
  rate: number,
): Promise<boolean> {
  const output = await run(
    env.MATINEE_FFPROBE_PATH,
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,time_base",
      "-of",
      "json",
      path,
    ],
    PROBE_TIMEOUT_MS,
  )
  let json
  try {
    json = JSON.parse(output)
  } catch {
    return false
  }
  const base = TimeBases.parse(json).streams.find(
    (stream) => stream.index === source,
  )?.time_base
  const [num = 0, den = 0] = (base ?? "").split("/").map(Number)
  return num > 0 && den % (rate * num) === 0
}

type Alignment = {
  /** Whole frames to drop at the start of the decode after the seek. */
  cut: number
  /**
   * Where the first sample after the cut can be, counted from the
   * stream's first sample. One unless frames are shorter than the
   * rounding.
   */
  candidates: number[]
}

/**
 * Where the decode after `seek` is, in samples from the stream's start.
 * Without a seek it's the decode the first run had, so it starts there.
 */
async function align(
  path: string,
  source: number,
  seek: number | null,
  start: Frame[],
): Promise<Alignment> {
  const first = start[0]
  if (!first) throw new Error("The track decoded to nothing")
  if (seek === null) return { cut: 0, candidates: [0] }
  const rate = first.rate
  const after = await decodedFrames(path, source, 40, seek)
  const head = after[0]
  if (!head) throw new Error("The track decoded to nothing after the seek")
  // A decoder's first frame can be shorter, the same way in both decodes,
  // so only the frames after it say whether frames are all one length.
  const sizes = new Set(
    [...start.slice(1), ...after.slice(1)].map((entry) => entry.samples),
  )
  const frame = sizes.size === 1 ? [...sizes][0] : undefined
  let cut: number
  if (frame) {
    const skip = Math.max(1, Math.floor((rate * SETTLE_S) / frame))
    cut = head.samples + (skip - 1) * frame
  } else {
    // Whole frames until the decode has settled.
    cut = 0
    for (const entry of after.slice(0, -1)) {
      cut += entry.samples
      if (cut >= rate * SETTLE_S) break
    }
  }
  const [settled] = await decodedFrames(path, source, 1, seek, cut)
  if (!settled) throw new Error("The track decoded to nothing after the cut")
  const raw = settled.pts - first.pts
  if (!frame || (await exactTimes(path, source, rate))) {
    return { cut, candidates: [raw] }
  }
  const lattice = first.samples % frame
  const slack = Math.ceil(rate * ROUNDING_S) + 2
  const base = raw - ((((raw - lattice) % frame) + frame) % frame)
  const candidates: number[] = []
  for (let k = -2; k <= 2; k++) {
    const candidate = base + k * frame
    if (Math.abs(candidate - raw) <= slack) candidates.push(candidate)
  }
  return { cut, candidates: candidates.length > 0 ? candidates : [base] }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function seekArgs(seek: number | null): string[] {
  return seek === null ? [] : ["-noaccurate_seek", "-ss", seek.toFixed(3)]
}

function dropBefore(end: TrackEnd): string {
  const seconds = end.end / end.scale - DROP_SLACK_S
  return `noise=drop=lt(pts*tb\\,${seconds.toFixed(6)})`
}

type EncodePlan = {
  index: number
  track: ResumeTrack
  end: TrackEnd
  timing: Timing
  rate: number
  start: Frame[]
  /** First sample to encode, in output samples from the stream's start. */
  first: number
  /** The label output sample 0 gets, so packets continue the old times. */
  offset: number
  /** Where a resampler starts, in input samples, keeping the old phase. */
  resampleFrom: number | null
}

function filtersFor(
  plan: EncodePlan,
  cut: number,
  position: number,
  end?: number,
): Around {
  const { end: last, track } = plan
  const startLabel = plan.first + plan.offset
  const trimEnd = end === undefined ? "" : `:end_pts=${end}`
  const before = [
    `atrim=start_sample=${cut}`,
    `asetpts=N/SR/TB+${position + (plan.resampleFrom === null ? plan.offset : 0)}`,
  ]
  if (plan.resampleFrom === null) {
    return { before, after: [`atrim=start_pts=${startLabel}${trimEnd}`] }
  }
  before.push(`atrim=start_pts=${plan.resampleFrom}`)
  const outputFrom = (plan.resampleFrom * last.scale) / plan.rate
  return {
    before,
    after: [
      ...(track.resamples ? [] : [`aresample=${last.scale}`]),
      `asetpts=N/SR/TB+${outputFrom + plan.offset}`,
      `atrim=start_pts=${startLabel}${trimEnd}`,
    ],
  }
}

/** f32 mono samples of a decode, between two output labels. */
async function samples(args: string[], from: number, to: number) {
  const bytes = await runBytes(
    env.MATINEE_FFMPEG_PATH,
    [
      "-v",
      "error",
      ...args,
      "-copyts",
      "-af",
      `atrim=start_pts=${from}:end_pts=${to}`,
      "-ac",
      "1",
      "-f",
      "f32le",
      "-",
    ],
    PROBE_TIMEOUT_MS,
  )
  return new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 4),
  )
}

/**
 * The candidate whose encode matches the end of the last segment best.
 * Candidates are whole frames apart, so the right one stands out, unless
 * the end of the segment is too quiet to tell. Null then.
 */
async function pick(
  plan: EncodePlan,
  candidates: number[],
  context: {
    path: string
    seek: number | null
    cut: number
    dir: string
    reference: string
  },
): Promise<number | null> {
  const { end } = plan
  const from = end.end - Math.round(end.scale * COMPARE_S)
  const expected = await samples(
    ["-i", context.reference, "-map", `0:a:${plan.index}`],
    from,
    end.end,
  )
  const power =
    expected.reduce((sum, value) => sum + value * value, 0) /
    Math.max(1, expected.length)
  if (power < AUDIBLE_POWER) return null
  const errors: { candidate: number; error: number }[] = []
  for (const candidate of candidates) {
    const file = join(context.dir, `probe-${plan.index}-${candidate}.nut`)
    const { before, after } = filtersFor(
      plan,
      context.cut,
      candidate,
      end.end + 4 * plan.timing.frame,
    )
    try {
      await runProcess({
        name: "ffmpeg",
        command: env.MATINEE_FFMPEG_PATH,
        args: [
          "-v",
          "error",
          "-nostdin",
          ...seekArgs(context.seek),
          "-i",
          context.path,
          "-copyts",
          "-start_at_zero",
          "-map",
          `0:${plan.track.source}`,
          "-af",
          [...before, ...plan.track.filters, ...after].join(","),
          ...plan.track.encoderArgs,
          "-y",
          file,
        ],
        timeoutMs: PROBE_TIMEOUT_MS,
      })
      const encoded = await samples(["-i", file], from, end.end)
      const length = Math.min(expected.length, encoded.length)
      let error = 0
      let energy = 0
      for (let i = 0; i < length; i++) {
        const a = expected[i] ?? 0
        const b = encoded[i] ?? 0
        error += (a - b) ** 2
        energy += a * a
      }
      const relative = length > 0 ? error / (energy || 1e-12) : Infinity
      errors.push({ candidate, error: relative })
    } finally {
      await unlink(file).catch(() => {})
    }
  }
  errors.sort((a, b) => a.error - b.error)
  const [best, next] = errors
  if (!best || (next && best.error > next.error * CLEAR_LEAD)) return null
  return best.candidate
}

/**
 * How a run from segment `segment` takes its audio, given where each
 * track ended in the segment before. Null when that isn't known, and the
 * run starts its audio with its video as it did before.
 */
export async function planAudioResume({
  path,
  tracks,
  ends,
  dir,
  reference,
}: {
  path: string
  tracks: readonly ResumeTrack[]
  /** Per audio output, from the segment before the run. */
  ends: readonly (TrackEnd | null)[]
  /** The download's directory, for probe files. */
  dir: string
  /** The init segment and the segment before, as ffmpeg's concat input. */
  reference: string | null
}): Promise<AudioResume | null> {
  if (tracks.length === 0) return null
  const known: TrackEnd[] = []
  for (const end of ends.slice(0, tracks.length)) {
    if (!end) return null
    known.push(end)
  }
  if (known.length < tracks.length) return null

  const plans: (EncodePlan | null)[] = []
  const starts: number[] = []
  for (const [index, track] of tracks.entries()) {
    const end = known[index]
    if (!end) return null
    if (track.copy) {
      plans.push(null)
      starts.push(end.end / end.scale)
      continue
    }
    const scale = end.scale
    const [timing, start] = await Promise.all([
      encoderTiming(track.encoderArgs, scale, track.channels),
      framesFromStart(path, track.source),
    ])
    const origin = start[0]
    if (!origin) return null
    // Near the start, from the start.
    const warmup = Math.min(
      end.total,
      Math.ceil((timing.padding + scale * WARMUP_S) / timing.frame),
    )
    const first = (end.total - warmup) * timing.frame
    const rate = origin.rate
    let resampleFrom: number | null = null
    if (rate !== scale) {
      const period = rate / gcd(rate, scale)
      const target = (first * rate) / scale - rate * SETTLE_S
      resampleFrom = Math.max(0, Math.floor(target / period) * period)
    }
    plans.push({
      index,
      track,
      end,
      timing,
      rate,
      start,
      first,
      offset: end.end + timing.padding - end.total * timing.frame,
      resampleFrom,
    })
    const from = resampleFrom ?? (first * rate) / scale
    starts.push((origin.pts + from) / rate)
  }
  const earliest = Math.min(...starts) - SEEK_LEAD_S
  for (let attempt = 0; attempt < SEEK_ATTEMPTS; attempt++) {
    const at = Math.floor((earliest - attempt * SEEK_BACK_S) * 1000) / 1000
    // From the start, the decode is the first run's.
    const seek = at > 0 ? at : null
    const resumed = await resumeTracks(plans, known, path, seek, dir, reference)
    if (resumed === "late" && seek !== null) continue
    // Where a seek can't say, decoding from the start counts the samples.
    const counted =
      resumed === "unsure" && seek !== null
        ? await resumeTracks(plans, known, path, null, dir, reference)
        : resumed
    if (!Array.isArray(counted)) return null
    const from = counted === resumed ? seek : null
    return { input: [...seekArgs(from), "-i", path], tracks: counted }
  }
  return null
}

/**
 * The filters for each track with the audio input at `seek`. `late` when
 * the decode after it starts too late for some track to be lined up,
 * `unsure` when where it lands can't be told apart.
 */
async function resumeTracks(
  plans: readonly (EncodePlan | null)[],
  known: readonly TrackEnd[],
  path: string,
  seek: number | null,
  dir: string,
  reference: string | null,
): Promise<AudioResume["tracks"] | "late" | "unsure"> {
  const resumed: AudioResume["tracks"] = []
  for (const [index, plan] of plans.entries()) {
    const end = known[index]
    if (!end) return "unsure"
    if (!plan) {
      resumed.push({ before: [], after: [], bsf: dropBefore(end) })
      continue
    }
    const { cut, candidates } = await align(
      path,
      plan.track.source,
      seek,
      plan.start,
    )
    // The decode has to reach back to where the resampler or encoder starts.
    const needed = plan.resampleFrom ?? (plan.first * plan.rate) / end.scale
    if (Math.max(...candidates) > needed) return "late"
    const position =
      candidates.length === 1
        ? candidates[0]
        : reference
          ? await pick(plan, candidates, { path, seek, cut, dir, reference })
          : null
    if (position === null || position === undefined) return "unsure"
    resumed.push({ ...filtersFor(plan, cut, position), bsf: dropBefore(end) })
  }
  return resumed
}
