import { ARTWORK_WIDTHS, artworkPath } from "@matinee/contracts/paths"
import { createEffect, createMemo, onSettled } from "solid-js"

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
  nowPlaying: () => NowPlaying
  /** Plays or pauses, whichever `paused` asks for. */
  setPaused: (paused: boolean) => void
  skip: (by: number) => void
  skipBackSeconds: () => number
  skipForwardSeconds: () => number
  seek: (to: number) => void
  /** Where the file is, which a stream's own clock doesn't say. */
  position: () => number
  duration: () => number
  /** Starts the episode before this one, when there is one. */
  previous: () => (() => void) | null
  /** Starts the next episode, when there is one. */
  next: () => (() => void) | null
}

const VIDEO_EVENTS = [
  "play",
  "pause",
  "seeked",
  "ratechange",
  "durationchange",
  "loadedmetadata",
] as const

const HANDLED = [
  "play",
  "pause",
  "seekbackward",
  "seekforward",
  "seekto",
] as const

/**
 * Tells the browser what plays, so the system's media controls, the lock
 * screen, and media keys show the title and its art in place of the tab's
 * name and the site's icon, and their buttons work the player. A stream
 * starts its clock where it was cut, so the position is said outright.
 */
export function useMediaSession(
  video: () => HTMLVideoElement | undefined,
  actions: MediaSessionActions,
) {
  if (!("mediaSession" in navigator)) return
  const session = navigator.mediaSession

  const metadata = createMemo(
    () => {
      const { title, artist, album, art } = actions.nowPlaying()
      return {
        title,
        artist,
        album,
        artId: art?.id ?? null,
        // Posters are two wide to three high when the server hasn't measured.
        aspectRatio: art?.aspectRatio ?? 2 / 3,
      }
    },
    {
      equals: (a, b) =>
        a.title === b.title &&
        a.artist === b.artist &&
        a.album === b.album &&
        a.artId === b.artId &&
        a.aspectRatio === b.aspectRatio,
    },
  )
  createEffect(metadata, ({ title, artist, album, artId, aspectRatio }) => {
    session.metadata = new MediaMetadata({
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
      session.metadata = null
    }
  })

  // Each button runs the actions as they are when it's pressed.
  const act = (details: MediaSessionActionDetails) => {
    const handlers = new Map<MediaSessionAction, () => void>([
      ["play", () => actions.setPaused(false)],
      ["pause", () => actions.setPaused(true)],
      ["seekbackward", () => actions.skip(-actions.skipBackSeconds())],
      ["seekforward", () => actions.skip(actions.skipForwardSeconds())],
      [
        "seekto",
        () => {
          if (details.seekTime != null) actions.seek(details.seekTime)
        },
      ],
    ])
    handlers.get(details.action)?.()
  }

  const sync = () => {
    const el = video()
    if (!el) return
    session.playbackState = el.paused ? "paused" : "playing"
    const length = actions.duration()
    if (!Number.isFinite(length) || length <= 0) return
    try {
      session.setPositionState({
        duration: length,
        position: Math.min(Math.max(0, actions.position()), length),
        playbackRate: el.playbackRate || 1,
      })
    } catch {}
  }

  onSettled(() => {
    for (const action of HANDLED) {
      // A browser that doesn't know an action throws when it's set.
      try {
        session.setActionHandler(action, act)
      } catch {}
    }
    const el = video()
    if (el) for (const event of VIDEO_EVENTS) el.addEventListener(event, sync)
    sync()
    return () => {
      for (const action of HANDLED) {
        try {
          session.setActionHandler(action, null)
        } catch {}
      }
      if (el) {
        for (const event of VIDEO_EVENTS) el.removeEventListener(event, sync)
      }
      session.playbackState = "none"
      try {
        session.setPositionState()
      } catch {}
    }
  })

  trackAction("previoustrack", actions.previous)
  trackAction("nexttrack", actions.next)
}

/** Sets a handler for `action` while `run` is there, so the button shows only then. */
function trackAction(
  action: "previoustrack" | "nexttrack",
  run: () => (() => void) | null,
) {
  const has = createMemo(() => run() !== null)
  createEffect(has, (present) => {
    if (!present) return
    const session = navigator.mediaSession
    try {
      session.setActionHandler(action, () => run()?.())
    } catch {}
    return () => {
      try {
        session.setActionHandler(action, null)
      } catch {}
    }
  })
}
