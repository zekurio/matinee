import {
  type AudioTrack,
  audioFormatName,
  type PlaybackQuality,
  videoCodecName,
} from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"

import { convertedAudioCodec, decodesAudio } from "@/lib/audio-support"
import { expectedEncodeCodec } from "@/lib/video-support"

const NOTICE_ID = "playback-notice"
const ERROR_ID = "playback-error"

export function dismissPlaybackNotices() {
  toast.dismiss(NOTICE_ID)
  toast.dismiss(ERROR_ID)
}

/**
 * What a stream does to `track`: `TrueHD audio to Opus stereo`, or
 * undefined when it copies the track.
 */
function audioConversion(track: AudioTrack | undefined): string | undefined {
  if (!track || decodesAudio(track.codec)) return undefined
  const to = audioFormatName(convertedAudioCodec())
  return `${track.format} audio to ${to}${track.channels === 1 ? "" : " stereo"}`
}

/** A toast about what the server converts, in place of the last one. */
function playbackNotice(title: string, description?: string) {
  toast.message(title, {
    id: NOTICE_ID,
    description,
    position: "top-center",
  })
}

/**
 * The toast for playing a stand-in track: `Switched to E-AC-3 audio`, and
 * how to get the default one back.
 */
export function standInNotice(track: AudioTrack, primary: AudioTrack) {
  const from = primary.format
  playbackNotice(
    `Switched to ${track.format} audio`,
    `This browser can't play the ${from} track. Pick it in the audio menu to transcode it.`,
  )
}

/** `Transcoding HEVC to H.264 1080p`: what an encode does to the video. */
function videoTranscode(
  quality: PlaybackQuality,
  videoCodec: string | null,
): string {
  const to = expectedEncodeCodec()
  const from =
    videoCodec && videoCodec !== to
      ? `${videoCodecName(videoCodec)} to `
      : "to "
  return `Transcoding ${from}${videoCodecName(to)} ${quality.replace(/-\d+$/, "")}`
}

/**
 * The toast for falling back to an encode: `Transcoding HEVC to H.264
 * 1080p`, plus the audio when the stream doesn't copy it.
 */
export function transcodeNotice(
  quality: PlaybackQuality,
  videoCodec: string | null,
  track: AudioTrack | undefined,
) {
  playbackNotice(videoTranscode(quality, videoCodec), audioConversion(track))
}

/**
 * The toast for burning in a subtitle track, which only an encode does:
 * `Transcoding HEVC to H.264 1080p`, and the audio when that converts.
 */
export function burnInNotice(
  quality: PlaybackQuality,
  videoCodec: string | null,
  track: AudioTrack | undefined,
) {
  const audio = audioConversion(track)
  const video = videoTranscode(quality, videoCodec)
  playbackNotice(
    "Burning in subtitles",
    audio ? `${video} and ${audio}.` : `${video}.`,
  )
}

/** The toast for a subtitle track the server couldn't burn in. */
export function burnInFailedNotice() {
  toast.error("Couldn't burn in those subtitles", {
    id: ERROR_ID,
    description: "Subtitles are off. Pick another track or try again.",
    position: "top-center",
  })
}

/**
 * The toast for a stream that copies the video and converts the audio:
 * `Transcoding TrueHD audio to Opus stereo`. Encodes say so in the menu.
 */
export function audioNotice(
  quality: PlaybackQuality,
  track: AudioTrack | undefined,
) {
  const conversion = audioConversion(track)
  if (quality !== "original" || !conversion) return
  playbackNotice(`Transcoding ${conversion}`)
}

/** The toast for a source that stopped after it played, with a retry. */
export function lostNotice(retry: () => void) {
  toast.error("Lost the video", {
    id: "playback-lost",
    description: "The server stopped sending it.",
    position: "top-center",
    action: { label: "Retry", onClick: retry },
  })
}

/** The toast for a stream that failed, going back to what plays. */
export function revertNotice(toFile: boolean) {
  toast.error("Couldn't play that", {
    id: ERROR_ID,
    description: toFile
      ? "Back to the original file and audio."
      : "Back to the original quality and audio.",
    position: "top-center",
  })
}
