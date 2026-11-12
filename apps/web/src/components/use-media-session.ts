import { ARTWORK_WIDTHS, artworkPath } from "@matinee/contracts/paths"
import { type RefObject, useEffect, useEffectEvent } from "react"

/** What the system's media controls say is playing. */
export type NowPlaying = {
  title: string
  /** The show, or a movie's year. */
  artist: string
  /** The season, for an episode. */
  album: string
  /** A poster or a still, with its width over its height if known. */
  art: { id: string; aspectRatio: number | null } | null
}

const ART_SIZES = ["thumb", "small", "medium"] as const

export type MediaSessionActions = {
  nowPlaying: NowPlaying
  /** Plays or pauses, whichever `paused` asks for. */
  setPaused: (paused: boolean) => void
  skip: (by: number) => void
  skipBackSeconds: number
  skipForwardSeconds: number
  seek: (to: number) => void
  /** Where the file is, which a stream's own clock doesn't say. */
  position: () => number
  duration: () => number
  /** Starts the next episode, when there is one. */
  next: (() => void) | null
}

const VIDEO_EVENTS = [
  "play",
  "pause",
  "seeked",
  "ratechange",
  "durationchange",
  "loadedmetadata",
] as const

/**
 * Tells the browser what plays, so the system's media controls, the lock
 * screen, and media keys show the title and its art in place of the tab's
 * name and the site's icon, and their buttons work the player. A stream
 * starts its clock where it was cut, so the position is said outright.
 */
export function useMediaSession(
  video: RefObject<HTMLVideoElement | null>,
  {
    nowPlaying,
    setPaused,
    skip,
    skipBackSeconds,
    skipForwardSeconds,
    seek,
    position,
    duration,
    next,
  }: MediaSessionActions,
) {
  const { title, artist, album } = nowPlaying
  const artId = nowPlaying.art?.id ?? null
  // Posters are two wide to three high when the server hasn't measured.
  const aspectRatio = nowPlaying.art?.aspectRatio ?? 2 / 3
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork:
        artId === null
          ? []
          : ART_SIZES.map((size) => ({
              src: artworkPath(artId, size),
              sizes: `${ARTWORK_WIDTHS[size]}x${Math.round(ARTWORK_WIDTHS[size] / aspectRatio)}`,
              type: "image/webp",
            })),
    })
    return () => {
      navigator.mediaSession.metadata = null
    }
  }, [title, artist, album, artId, aspectRatio])

  // Each button runs the actions from the latest render.
  const act = useEffectEvent((details: MediaSessionActionDetails) => {
    const actions = new Map<MediaSessionAction, () => void>([
      ["play", () => setPaused(false)],
      ["pause", () => setPaused(true)],
      ["seekbackward", () => skip(-skipBackSeconds)],
      ["seekforward", () => skip(skipForwardSeconds)],
      [
        "seekto",
        () => {
          if (details.seekTime != null) seek(details.seekTime)
        },
      ],
    ])
    actions.get(details.action)?.()
  })
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    const session = navigator.mediaSession
    const handled = [
      "play",
      "pause",
      "seekbackward",
      "seekforward",
      "seekto",
    ] as const
    for (const action of handled) {
      // A browser that doesn't know an action throws when it's set.
      try {
        session.setActionHandler(action, act)
      } catch {}
    }
    return () => {
      for (const action of handled) {
        try {
          session.setActionHandler(action, null)
        } catch {}
      }
    }
  }, [])

  const hasNext = next !== null
  const playNext = useEffectEvent(() => next?.())
  useEffect(() => {
    if (!("mediaSession" in navigator) || !hasNext) return
    const session = navigator.mediaSession
    try {
      session.setActionHandler("nexttrack", playNext)
    } catch {}
    return () => {
      try {
        session.setActionHandler("nexttrack", null)
      } catch {}
    }
  }, [hasNext])

  const sync = useEffectEvent(() => {
    const el = video.current
    if (!el) return
    const session = navigator.mediaSession
    session.playbackState = el.paused ? "paused" : "playing"
    const length = duration()
    if (!Number.isFinite(length) || length <= 0) return
    try {
      session.setPositionState({
        duration: length,
        position: Math.min(Math.max(0, position()), length),
        playbackRate: el.playbackRate || 1,
      })
    } catch {}
  })
  useEffect(() => {
    const el = video.current
    if (!el || !("mediaSession" in navigator)) return
    const listener = () => sync()
    for (const event of VIDEO_EVENTS) el.addEventListener(event, listener)
    listener()
    return () => {
      for (const event of VIDEO_EVENTS) el.removeEventListener(event, listener)
      navigator.mediaSession.playbackState = "none"
      try {
        navigator.mediaSession.setPositionState()
      } catch {}
    }
  }, [video])
}
