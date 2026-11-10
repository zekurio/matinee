import { audioFormatName, type PlaybackStart } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"

import { tr } from "@/i18n"
import { errorMessage } from "@/lib/rpc"

const NOTICE_ID = "playback-notice"
const ERROR_ID = "playback-error"
const SUBTITLES_ID = "subtitles-loading"
// Most tracks are there at once. Only one that keeps the viewer waiting
// gets a toast.
const SUBTITLES_DELAY_MS = 800

// The notice shown for the latest answer, so the same one doesn't repeat
// for each answer that says it again.
let shown: string | null = null

export function dismissPlaybackNotices() {
  shown = null
  toast.dismiss(NOTICE_ID)
  toast.dismiss(ERROR_ID)
  toast.dismiss(SUBTITLES_ID)
}

type Notice = { title: string; description?: string }

/**
 * What the server does to the audio: `TrueHD` to `Opus stereo`, or
 * undefined when it sends the track as it is. It converts to two channels
 * at most.
 */
function audioConversion(
  plan: PlaybackStart,
): { from: string; to: string } | undefined {
  if (!plan.audio || plan.convertedAudio === null) return undefined
  const codec = audioFormatName(plan.convertedAudio)
  return {
    from: plan.audio.format,
    to:
      plan.audio.channels === 1 ? codec : tr("player.notice.stereo", { codec }),
  }
}

/**
 * What an encode does to the video: `HEVC` to `1080p`. `from` is null when
 * the file's video isn't known.
 */
function videoTranscode(plan: PlaybackStart) {
  return {
    from: plan.item.probe?.video?.format ?? null,
    quality: plan.quality.replace(/-\d+$/, ""),
  }
}

/** The toast for an encode that burns in a subtitle, which the viewer picked. */
function burnInNotice(plan: PlaybackStart): Notice {
  const audio = audioConversion(plan)
  const { from, quality } = videoTranscode(plan)
  let description: string
  if (audio) {
    const both = { quality, audioFrom: audio.from, audioTo: audio.to }
    description =
      from === null
        ? tr("player.notice.burnInVideoToAudio", both)
        : tr("player.notice.burnInVideoAudio", { ...both, from })
  } else {
    description =
      from === null
        ? tr("player.notice.burnInVideoTo", { quality })
        : tr("player.notice.burnInVideo", { quality, from })
  }
  return { title: tr("player.notice.burnIn"), description }
}

/**
 * What to tell the viewer about an answer, from what the server reports:
 * a subtitle burned in, a stand-in audio track, an encode the browser
 * needs, or audio converted. An encode at a quality the viewer picked says
 * so in the menu, so it gets none.
 */
function noticeFor(
  plan: PlaybackStart,
  previous: PlaybackStart | null,
): Notice | null {
  if (plan.subtitleMode === "burn-in") return burnInNotice(plan)
  const audio = audioConversion(plan)
  if (plan.standIn && plan.audio && !previous?.standIn) {
    return {
      title: tr("player.notice.standIn", { format: plan.audio.format }),
      description: tr("player.notice.standInDetail"),
    }
  }
  if (plan.method === "transcode" && !plan.reasons.includes("quality")) {
    const { from, quality } = videoTranscode(plan)
    return {
      title:
        from === null
          ? tr("player.notice.videoTo", { quality })
          : tr("player.notice.video", { from, quality }),
      description: audio && tr("player.notice.audio", audio),
    }
  }
  if (plan.method === "remux" && audio) {
    return { title: tr("player.notice.audioTitle", audio) }
  }
  return null
}

/**
 * A toast about what the server does for `plan`, in place of the last
 * one, unless it says what the last one did. `previous` is the answer
 * before it, null at first.
 */
export function playbackNotice(
  plan: PlaybackStart,
  previous: PlaybackStart | null,
) {
  const notice = noticeFor(plan, previous)
  const key = notice && `${notice.title}\n${notice.description ?? ""}`
  if (key === shown) return
  shown = key
  if (!notice) return
  toast.message(notice.title, {
    id: NOTICE_ID,
    description: notice.description,
    position: "top-center",
  })
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

/** The toast for a quality that didn't play, so the original does. */
export function qualityFailedNotice() {
  toast.error(tr("player.error.revert"), {
    id: ERROR_ID,
    description: tr("player.error.revertToQuality"),
    position: "top-center",
  })
}

/** The toast for a switch or seek the server turned down. */
export function switchFailedNotice(cause: unknown) {
  toast.error(tr("player.error.revert"), {
    id: ERROR_ID,
    description: errorMessage(cause),
    position: "top-center",
  })
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
