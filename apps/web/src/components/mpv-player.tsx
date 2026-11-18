import type { DesktopBridge } from "@matinee/desktop-bridge"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import {
  type PlayerState,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"

import { MpvMedia, type MpvSource } from "./mpv-media"
import {
  PlayerFrame,
  type PlayerCore,
  type PlayerProps,
  usePlayerCore,
} from "./player-core"
import {
  MEDIA_EVENTS,
  type MediaEventName,
  type PlayerMedia,
} from "./player-media"
import { PlayerStats } from "./player-stats"
import { useDesktopMediaSession } from "./use-desktop-media-session"
import { useMpvStats } from "./use-mpv-stats"
import {
  mpvSubtitle,
  mpvSubtitleDelay,
  useMpvSubtitles,
} from "./use-mpv-subtitles"

/** What mpv opens for the store's source, with the answer's tracks. */
function mpvSource(state: PlayerState): MpvSource {
  const { source, plan } = state
  // The file and HLS seek by themselves, so mpv opens them where they
  // start. A copied stream can't, so it opens at its own 0 and the player
  // seeks once mpv holds the frames up to its start.
  const seeksItself = source.method === "direct" || source.hls
  return {
    url: source.url,
    start: seeksItself ? source.start : 0,
    // Only the file has every audio track; a stream has the one it carries.
    audio: source.method === "direct" ? (plan.audio?.index ?? null) : null,
    subtitle: mpvSubtitle(state),
    subtitleDelay: mpvSubtitleDelay(state),
  }
}

/**
 * Keeps the page clear where the player is, so mpv's picture under the
 * window shows through, and puts the page back as it was when it goes.
 */
function useSeeThroughPage() {
  useEffect(() => {
    const elements = [
      document.documentElement,
      document.body,
      document.getElementById("root"),
    ].flatMap((el) => (el ? [el] : []))
    const before = elements.map((el) => el.style.background)
    for (const el of elements) el.style.background = "transparent"
    return () => {
      elements.forEach((el, at) => {
        el.style.background = before[at] ?? ""
      })
    }
  }, [])
}

/** The store follows mpv through the media events, as it follows a `<video>`. */
function useMediaEvents(media: MpvMedia, events: PlayerCore["events"]) {
  const handle = useEffectEvent((name: MediaEventName) => {
    const handlers = new Map<string, () => void>(Object.entries(events))
    handlers.get(name)?.()
  })
  useEffect(() => {
    const listeners = MEDIA_EVENTS.map((name) => {
      const listener = () => handle(name)
      media.addEventListener(name, listener)
      return () => media.removeEventListener(name, listener)
    })
    return () => {
      for (const stop of listeners) stop()
    }
  }, [media])
}

/**
 * Opens the store's source in mpv: at first, and for each new one, a
 * retry of the same address included. On the file, the audio follows the
 * answer without opening it again.
 */
function useMpvSource(media: MpvMedia) {
  const store = usePlayerStoreApi()
  const url = usePlayerStore((state) => state.source.url)
  const attempt = usePlayerStore((state) => state.source.attempt)
  useEffect(() => {
    media.open(mpvSource(store.getState()))
  }, [media, url, attempt])

  const audio = usePlayerStore((state) =>
    state.source.method === "direct" ? (state.plan.audio?.index ?? null) : null,
  )
  useEffect(() => {
    if (audio !== null) media.setAudio(audio)
  }, [media, audio])
}

function MpvStats({
  shell,
  sessionId,
}: {
  shell: DesktopBridge
  sessionId: string
}) {
  return <PlayerStats live={useMpvStats(shell)} sessionId={sessionId} />
}

/**
 * The player in the desktop app: mpv plays under the page, which leaves
 * the picture clear and draws the controls over it.
 */
export function MpvPlayer({
  shell,
  ...props
}: PlayerProps & { shell: DesktopBridge }) {
  const [media] = useState(() => new MpvMedia(shell))
  const ref = useRef<PlayerMedia>(media)
  // Before anything asks mpv for something, so its state comes first.
  useEffect(() => {
    media.attach()
    return () => media.close()
  }, [media])
  const core = usePlayerCore(ref, props)
  useMediaEvents(media, core.events)
  useMpvSource(media)
  const subs = useMpvSubtitles(
    media,
    core.controls,
    !core.hidden,
    core.playback.selectSubtitle,
    (trackId) => props.onPickTracks({ subtitle: { trackId } }),
  )
  useDesktopMediaSession(shell, core.mediaSession)
  useSeeThroughPage()

  return (
    <PlayerFrame
      {...props}
      core={core}
      subs={subs}
      transparent
      surface={
        // Where the picture shows, under the page. It takes the clicks the
        // `<video>` would.
        <div
          className="size-full"
          onClick={core.coarse ? undefined : core.toggle}
          onDoubleClick={core.coarse ? undefined : core.toggleFullscreen}
        />
      }
      stats={<MpvStats shell={shell} sessionId={props.start.sessionId} />}
    />
  )
}
