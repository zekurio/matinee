import {
  type AudioTrack,
  audioFormatName,
  type PlaybackQuality,
  videoCodecName,
} from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"

import { tr } from "@/i18n"
import { convertedAudioCodec, decodesAudio } from "@/lib/audio-support"
import { expectedEncodeCodec } from "@/lib/video-support"

const NOTICE_ID = "playback-notice"
const ERROR_ID = "playback-error"
const SUBTITLES_ID = "subtitles-loading"
// Most tracks are there at once. Only one that keeps the viewer waiting
// gets a toast.
const SUBTITLES_DELAY_MS = 800

export function dismissPlaybackNotices() {
  toast.dismiss(NOTICE_ID)
  toast.dismiss(ERROR_ID)
  toast.dismiss(SUBTITLES_ID)
}

/** A conversion of audio from one format to another, for the toasts. */
type AudioConversion = { from: string; to: string }

/**
 * What a stream does to `track`: `TrueHD` to `Opus stereo`, or undefined
 * when it copies the track.
 */
function audioConversion(
  track: AudioTrack | undefined,
): AudioConversion | undefined {
  if (!track || decodesAudio(track.codec)) return undefined
  const codec = audioFormatName(convertedAudioCodec())
  return {
    from: track.format,
    to: track.channels === 1 ? codec : tr("player.notice.stereo", { codec }),
  }
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
  playbackNotice(
    tr("player.notice.standIn", { format: track.format }),
    tr("player.notice.standInDetail", { format: primary.format }),
  )
}

/**
 * What an encode does to the video: HEVC to H.264 at 1080p. `from` is
 * null when the codec stays the same or isn't known.
 */
type VideoTranscode = { from: string | null; to: string; quality: string }

function videoTranscode(
  quality: PlaybackQuality,
  videoCodec: string | null,
): VideoTranscode {
  const to = expectedEncodeCodec()
  return {
    from: videoCodec && videoCodec !== to ? videoCodecName(videoCodec) : null,
    to: videoCodecName(to),
    quality: quality.replace(/-\d+$/, ""),
  }
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
  const { from, to, quality: name } = videoTranscode(quality, videoCodec)
  const audio = audioConversion(track)
  playbackNotice(
    from === null
      ? tr("player.notice.videoTo", { to, quality: name })
      : tr("player.notice.video", { from, to, quality: name }),
    audio && tr("player.notice.audio", audio),
  )
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
  const { from, to, quality: name } = videoTranscode(quality, videoCodec)
  const video = { to, quality: name }
  let description: string
  if (audio) {
    const both = { ...video, audioFrom: audio.from, audioTo: audio.to }
    description =
      from === null
        ? tr("player.notice.burnInVideoToAudio", both)
        : tr("player.notice.burnInVideoAudio", { ...both, from })
  } else {
    description =
      from === null
        ? tr("player.notice.burnInVideoTo", video)
        : tr("player.notice.burnInVideo", { ...video, from })
  }
  playbackNotice(tr("player.notice.burnIn"), description)
}

/**
 * The toast for a subtitle track that is still on its way, such as one the
 * server pulls out of a large file for the first time, which reads all of
 * it. It shows once the track keeps the viewer waiting, and goes when the
 * returned function is called.
 */
export function subtitlesLoadingNotice(): () => void {
  const timer = setTimeout(() => {
    toast.loading(tr("player.notice.subtitles"), {
      id: SUBTITLES_ID,
      position: "top-center",
    })
  }, SUBTITLES_DELAY_MS)
  return () => {
    clearTimeout(timer)
    toast.dismiss(SUBTITLES_ID)
  }
}

/** The toast for a subtitle track the server couldn't burn in. */
export function burnInFailedNotice() {
  toast.error(tr("player.error.burnIn"), {
    id: ERROR_ID,
    description: tr("player.error.burnInDetail"),
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
  playbackNotice(tr("player.notice.audioTitle", conversion))
}

/** The toast for a source that stopped after it played, with a retry. */
export function lostNotice(retry: () => void) {
  toast.error(tr("player.error.lost"), {
    id: "playback-lost",
    description: tr("player.error.lostDetail"),
    position: "top-center",
    action: { label: tr("player.error.retry"), onClick: retry },
  })
}

/** The toast for a stream that failed, going back to what plays. */
export function revertNotice(toFile: boolean) {
  toast.error(tr("player.error.revert"), {
    id: ERROR_ID,
    description: toFile
      ? tr("player.error.revertToFile")
      : tr("player.error.revertToQuality"),
    position: "top-center",
  })
}
