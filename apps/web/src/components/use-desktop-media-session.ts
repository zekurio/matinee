import { artworkPath } from "@matinee/contracts/paths"
import type { DesktopBridge, MediaAction } from "@matinee/desktop-bridge"
import { useEffect, useEffectEvent } from "react"

import { usePlayerStore, usePlayerStoreApi } from "@/stores/player"

import type { MediaSessionActions } from "./use-media-session"

/**
 * The system's media controls in the desktop app: MPRIS on Linux, and the
 * like elsewhere. The page has no media element for the browser's media
 * session, so the shell shows what this tells it, with the position from
 * mpv. Its buttons and the media keys come back as `media.action`, for the
 * handlers the browser's media session gets.
 */
export function useDesktopMediaSession(
  shell: DesktopBridge,
  {
    nowPlaying,
    setPaused,
    skip,
    skipForwardSeconds,
    seek,
    duration,
    previous,
    next,
  }: MediaSessionActions,
) {
  const store = usePlayerStoreApi()
  const { title, artist, album } = nowPlaying
  const artId = nowPlaying.art?.id ?? null
  const offset = usePlayerStore((state) => state.source.offset)
  // Sent again once the video says how long it is.
  const known = usePlayerStore((state) => state.duration)
  const hasPrevious = previous !== null
  const hasNext = next !== null

  useEffect(() => {
    const length = duration()
    void shell
      .request("media.setMetadata", {
        metadata: {
          title,
          subtitle: [artist, album].filter(Boolean).join(" · ") || null,
          artwork: artId === null ? null : artworkPath(artId, "medium"),
          duration: Number.isFinite(length) && length > 0 ? length : null,
          offset,
          hasPrevious,
          hasNext,
        },
      })
      .catch(() => {})
  }, [shell, title, artist, album, artId, offset, known, hasPrevious, hasNext])

  useEffect(
    () => () => {
      void shell
        .request("media.setMetadata", { metadata: null })
        .catch(() => {})
    },
    [shell],
  )

  // Each action runs the handlers from the latest render.
  const act = useEffectEvent(({ action, position, by }: MediaAction) => {
    const handlers = new Map<MediaAction["action"], () => void>([
      ["play", () => setPaused(false)],
      ["pause", () => setPaused(true)],
      ["toggle", () => setPaused(store.getState().playing)],
      // The player stays open, paused, as after its own pause.
      ["stop", () => setPaused(true)],
      [
        "seek",
        () => {
          if (position !== undefined) seek(position)
        },
      ],
      ["skip", () => skip(by ?? skipForwardSeconds)],
      ["previous", () => previous?.()],
      ["next", () => next?.()],
    ])
    handlers.get(action)?.()
  })
  useEffect(() => shell.on("media.action", (action) => act(action)), [shell])
}
