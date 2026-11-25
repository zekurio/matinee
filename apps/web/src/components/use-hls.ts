import type HlsPlayer from "hls.js"
import { type Accessor, createEffect, createMemo } from "solid-js"

/** A playlist to play, from `start` seconds. A new `attempt` loads it again. */
export type HlsSource = { url: string; start: number; attempt: number }

// The server answers a segment once it's encoded, which can take a while
// after a seek on a slow CPU.
const SEGMENT_TIMEOUT_MS = 60_000

let hlsModule: Promise<typeof import("hls.js")> | null = null

/**
 * hls.js, loaded the first time something asks. A file the browser plays
 * as it is never needs it, and it's most of the player's code.
 */
export function loadHls() {
  hlsModule ??= import("hls.js")
  return hlsModule
}

/**
 * Plays an HLS playlist in `video`: with hls.js where the browser has
 * Media Source Extensions, else natively (iOS before 17.1). `onError` gets
 * a `MediaError` code for failures the video doesn't report itself. Each
 * source, and each attempt at it, gets its own instance, destroyed when the
 * next one starts or the player goes.
 */
export function useHls(
  video: () => HTMLVideoElement | undefined,
  source: Accessor<HlsSource | null>,
  onError: (code: number) => void,
) {
  const current = createMemo(source, {
    equals: (a, b) => a?.url === b?.url && a?.attempt === b?.attempt,
  })
  createEffect(current, (playing) => {
    const el = video()
    if (!el || !playing) return
    const { url, start } = playing
    let cancelled = false
    let hls: HlsPlayer | null = null
    loadHls().then(
      ({ default: Hls, ErrorTypes, Events }) => {
        if (cancelled) return
        // oxlint-disable-next-line import/no-named-as-default-member -- hls.js's types declare isSupported only as the class's static.
        if (!Hls.isSupported()) {
          if (el.canPlayType("application/vnd.apple.mpegurl")) {
            // The video loads it, and reports errors as for any source.
            el.src = url
          } else onError(MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)
          return
        }
        const player = new Hls({
          startPosition: start,
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: SEGMENT_TIMEOUT_MS,
              maxLoadTimeMs: 2 * SEGMENT_TIMEOUT_MS,
              timeoutRetry: {
                maxNumRetry: 2,
                retryDelayMs: 0,
                maxRetryDelayMs: 0,
              },
              errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 1000,
                maxRetryDelayMs: 8000,
              },
            },
          },
        })
        hls = player
        let recovered = false
        player.on(Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (data.type === ErrorTypes.MEDIA_ERROR && !recovered) {
            // hls.js's advice: one recovery usually gets past a decode error.
            recovered = true
            player.recoverMediaError()
            return
          }
          const code =
            data.type === ErrorTypes.NETWORK_ERROR
              ? MediaError.MEDIA_ERR_NETWORK
              : data.type === ErrorTypes.MEDIA_ERROR
                ? MediaError.MEDIA_ERR_DECODE
                : MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          player.destroy()
          hls = null
          onError(code)
        })
        player.loadSource(url)
        player.attachMedia(el)
      },
      () => {
        // The chunk didn't load, as when the server went away.
        if (!cancelled) onError(MediaError.MEDIA_ERR_NETWORK)
      },
    )
    // Leaves the video's src alone unless it's still hls.js's own.
    return () => {
      cancelled = true
      hls?.destroy()
      hls = null
    }
  })
}
