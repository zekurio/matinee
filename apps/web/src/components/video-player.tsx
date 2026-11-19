import {
  lazy,
  type RefObject,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react"

import { desktop } from "@/lib/desktop"
import { subtitleLabel } from "@/lib/subtitles"
import { createPlayerStore, PlayerStoreContext } from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { playbackNotice } from "./playback-notices"
import { sourceOf } from "./playback-source"
import type { Episodes } from "./player-controls"
import { PlayerFrame, type PlayerProps, usePlayerCore } from "./player-core"
import { PlayerStats, useBrowserStats } from "./player-stats"
import { useHls } from "./use-hls"
import { useMediaSession } from "./use-media-session"
import { useSubtitles } from "./use-subtitles"

export type { Episodes }

// In the desktop app mpv plays, and its half of the player loads only there.
const MpvPlayer = lazy(() =>
  import("./mpv-player").then((module) => ({ default: module.MpvPlayer })),
)

/**
 * Full-screen player: a `<video>` in a browser, mpv under the page in the
 * desktop app. See `PlayerFrame` for its keys.
 */
export function VideoPlayer(props: PlayerProps) {
  // One store per player, which remounts for another file. It starts from
  // the server's first answer and the saved preferences.
  const [store] = useState(() => {
    const saved = usePlayerPreferencesStore.getState()
    const { plan, sessionId, device, quality } = props.start
    return createPlayerStore({
      itemId: plan.item.id,
      sessionId,
      device,
      plan,
      source: sourceOf(plan, 0),
      picks: { quality },
      duration:
        plan.item.durationSeconds ??
        plan.item.probe?.format.durationSeconds ??
        0,
      volume: saved.volume,
      muted: saved.muted,
    })
  })
  // What the server does for the first answer, said once it plays.
  useEffect(() => playbackNotice(props.start.plan, null), [])
  return (
    <PlayerStoreContext value={store}>
      {desktop ? (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <MpvPlayer shell={desktop} {...props} />
        </Suspense>
      ) : (
        <BrowserPlayer {...props} />
      )}
    </PlayerStoreContext>
  )
}

/** The player with a `<video>`, and hls.js where it takes a playlist. */
function BrowserPlayer(props: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const pgsLayer = useRef<HTMLDivElement>(null)
  const core = usePlayerCore(video, props)
  const { playback, events, coarse } = core

  useHls(video, playback.hls, core.fail)
  const subs = useSubtitles(
    video,
    core.controls,
    pgsLayer,
    !core.hidden,
    playback.offset,
    playback.selectSubtitle,
    (trackId) => props.onPickTracks({ subtitle: { trackId } }),
  )

  // A video taken out of the page keeps its stream open, and buffering,
  // until the browser collects it. Unread, those streams fill the
  // connection to the server, and every request after them stalls. So
  // the player lets go of its stream when it goes.
  useEffect(() => {
    const el = video.current
    return () => {
      // Still in the page when StrictMode only rehearses the unmount.
      if (!el || el.isConnected) return
      el.removeAttribute("src")
      el.load()
    }
  }, [])

  useMediaSession(video, core.mediaSession)

  return (
    <PlayerFrame
      {...props}
      core={core}
      subs={subs}
      surface={
        // Clicks on the picture play and pause; keyboard users have Space.
        // On touch screens a tap shows the controls instead. The store
        // follows the video through its events.
        <video
          ref={video}
          src={playback.src}
          playsInline
          className="size-full object-contain"
          onClick={coarse ? undefined : core.toggle}
          onDoubleClick={coarse ? undefined : core.toggleFullscreen}
          onPlay={events.play}
          onPause={events.pause}
          onEnded={events.ended}
          onLoadStart={events.loadstart}
          onLoadedMetadata={events.loadedmetadata}
          onWaiting={events.waiting}
          onSeeking={events.seeking}
          onSeeked={events.seeked}
          onPlaying={events.playing}
          onCanPlay={events.canplay}
          onTimeUpdate={events.timeupdate}
          onDurationChange={events.durationchange}
          onProgress={events.progress}
          onVolumeChange={events.volumechange}
          onRateChange={events.ratechange}
          onError={events.error}
        >
          {subs.current && (
            <track
              key={subs.current.track.id}
              data-track-id={subs.current.track.id}
              kind="subtitles"
              src={subs.current.src}
              srcLang={subs.current.track.language ?? undefined}
              label={subtitleLabel(subs.current.track, subs.tracks)}
            />
          )}
        </video>
      }
      // PGS subtitles draw here, over the picture.
      layers={
        <div ref={pgsLayer} className="pointer-events-none absolute inset-0" />
      }
      stats={<BrowserStats video={video} sessionId={props.start.sessionId} />}
    />
  )
}

function BrowserStats({
  video,
  sessionId,
}: {
  video: RefObject<HTMLVideoElement | null>
  sessionId: string
}) {
  return <PlayerStats live={useBrowserStats(video)} sessionId={sessionId} />
}
