import { num } from "./filters"
import type { Plan, VideoTarget } from "./types"

/** Encoders that ignore forced keyframes and take a GOP length instead. */
export const GOP_ONLY_ENCODERS = [
  "h264_qsv",
  "h264_nvenc",
  "hevc_qsv",
  "hevc_nvenc",
  "av1_qsv",
  "av1_nvenc",
  "libsvtav1",
]

type GopLength = { frames: number; exact: boolean }

/**
 * Frames per segment at the output frame rate, rounded up unless whole;
 * zero when the rate is unknown. `exact` when a segment is a whole number
 * of frames, so the GOP is exactly one segment long.
 */
export function gopLength(plan: Plan): GopLength {
  const fps =
    (plan.source.frameRate ?? 0) * (plan.deinterlace && plan.doubleRate ? 2 : 1)
  const frames = plan.target.segmentSeconds * fps
  const whole = Math.round(frames)
  // Within a hundredth of a frame is whole: the probe rounds frame rates.
  const exact = frames > 0 && Math.abs(frames - whole) < 0.01
  return { frames: exact ? whole : Math.ceil(frames), exact }
}

/** Seconds from `startSeconds` to the next segment boundary, 0 on one. */
export function boundaryOffset(target: VideoTarget): number {
  const offset = target.startSeconds % target.segmentSeconds
  const toNext = target.segmentSeconds - offset
  return offset > 0.001 && toNext > 0.001 ? toNext : 0
}

/**
 * GetHlsVideoKeyFrameArguments: a keyframe at every segment boundary.
 * Encoders that ignore forced keyframes get a fixed GOP instead. ffmpeg's
 * `t` counts from the encode's first frame, `-copyts` or not, so a start
 * between boundaries delays the first forced keyframe to the next one.
 */
export function keyframeArgs(plan: Plan): string[] {
  const { encoder, target } = plan
  const segment = target.segmentSeconds
  // Jellyfin: always starts on a boundary.
  const first = boundaryOffset(target)
  const force = [
    "-force_key_frames:0",
    first > 0
      ? `expr:gte(t,${num(first)}+n_forced*${num(segment)})`
      : `expr:gte(t,n_forced*${num(segment)})`,
  ]
  // Forcing alone isn't enough: a scene cut halfway would push the next
  // keyframe past the segment.
  const { frames } = gopLength(plan)
  const gop =
    frames > 0
      ? ["-g:v:0", String(frames), "-keyint_min:v:0", String(frames)]
      : []
  // These count the GOP from the first frame, see keyframesOnBoundaries.
  if (GOP_ONLY_ENCODERS.includes(encoder)) return gop
  // AMD's HEVC VAAPI parameter sets disagree with the extradata, which
  // breaks hvc1. Take the extradata from the stream instead.
  const amdExtradata =
    encoder === "hevc_vaapi" && plan.hardware?.vendor === "amd"
      ? ["-flags:v", "-global_header", "-bsf:v", "extract_extradata=remove=0"]
      : []
  if (
    ["libx264", "libx265", "h264_vaapi", "hevc_vaapi", "av1_vaapi"].includes(
      encoder,
    )
  ) {
    // libx264 would move them at scene cuts.
    if (encoder === "libx264") return [...force, "-sc_threshold:v:0", "0"]
    return [...force, ...amdExtradata]
  }
  return [...force, ...gop]
}
