import type { PlaybackQuality } from "@matinee/contracts"
import { type RefObject, useEffect, useRef } from "react"

import {
  type PlayerState,
  type PlayerStore,
  usePlayerStore,
} from "@/stores/player"

import { audioNotice, standInNotice } from "./playback-notices"
import {
  type AudioChoice,
  fallbackQuality,
  offsetOf,
  type PlaybackOptions,
  type PlaybackSource,
  pickStart,
  type SourceKind,
} from "./playback-source"

/**
 * What the player remembers about the sources it starts, which nothing
 * renders. The source on screen and the viewer's picks are in the store.
 */
export function useSourceRefs(store: PlayerStore, startAt: number | undefined) {
  // The store starts with the file when the browser can play it as it is.
  const startsDirect = store.getInitialState().source !== null
  // Where the file plays from once it loads, in its own time.
  const seekOnLoad = useRef<number | null>(
    startsDirect && startAt ? startAt : null,
  )
  // Where a source picked once the tracks arrive starts.
  const startLater = useRef(startAt ?? 0)
  // Whether the next source plays once it loads: at first, after a switch
  // made while playing, or as the viewer picks while it loads.
  const playOnLoad = useRef(true)
  // Set when the player pauses the old source to hold it still while a new
  // one loads, so that pause isn't taken for the viewer's.
  const holding = useRef(false)
  // A resume not yet announced. The first source to load announces it.
  const resumeAt = useRef<number | null>(startAt || null)
  const generation = useRef(0)
  // The kinds of source this browser has played. One that fails after it
  // played failed on the server or the network, not on the codecs: Chrome
  // reports a 500 from the server as a format error.
  const played = useRef(new Set<SourceKind>())
  // The last source whose failure was handled. hls.js and the video can
  // both report one failure.
  const handled = useRef<PlaybackSource | null>(null)
  return {
    seekOnLoad,
    startLater,
    playOnLoad,
    holding,
    resumeAt,
    generation,
    played,
    handled,
  }
}

export type SourceRefs = ReturnType<typeof useSourceRefs>

/** What the playback functions share. */
export type PlaybackCore = {
  video: RefObject<HTMLVideoElement | null>
  options: PlaybackOptions
  store: PlayerStore
  refs: SourceRefs
  choice: AudioChoice
}

/** The audio track that plays: the viewer's pick, else the preferred one. */
export function audioOf(
  state: PlayerState,
  choice: AudioChoice,
): number | null {
  return state.chosenAudio ?? choice.preferred?.index ?? null
}

/** Seconds into the file, and the file's length. */
export function playbackClock({ video, options, store }: PlaybackCore) {
  /** Seconds into the file. */
  const position = (): number => {
    const el = video.current
    return el ? offsetOf(store.getState().source) + el.currentTime : 0
  }

  const duration = (): number => {
    const el = video.current
    const { source } = store.getState()
    const known = options.durationSeconds
    if (source?.kind === "direct" && el && Number.isFinite(el.duration)) {
      return el.duration
    }
    if (known) return known
    return el && Number.isFinite(el.duration)
      ? offsetOf(source) + el.duration
      : 0
  }

  return { position, duration }
}

/** Starting a stream or the file, from a point in it. */
export function sourceStarters({ video, options, store, refs }: PlaybackCore) {
  const { setPending, setSource } = store.getState()
  const { generation, seekOnLoad, playOnLoad, holding } = refs

  const startStream = async (
    at: number,
    audioIndex: number,
    next: PlaybackQuality,
    snap: "before" | "nearest",
  ) => {
    const id = ++generation.current
    setPending(at)
    // Only an encode can burn a subtitle in, so the original quality gets
    // the one a failed file falls back to.
    const { burnIn } = store.getState()
    const encode =
      next !== "original"
        ? next
        : burnIn !== null
          ? fallbackQuality(options.videoSize)
          : null
    if (encode !== null) {
      // HLS seeks by itself, from where it loads.
      seekOnLoad.current = at
      setSource({
        kind: "hls",
        audio: audioIndex,
        quality: encode,
        start: at,
        subtitle: burnIn,
        attempt: id,
      })
      return
    }
    let start = at
    if (options.videoSize) {
      // The lookup takes a moment. Hold the old source still meanwhile,
      // rather than play on from where the viewer left it.
      const el = video.current
      if (el && !el.paused) {
        holding.current = true
        el.pause()
      }
      try {
        start = pickStart(await options.keyframes(at), at, snap)
      } catch {
        // ffmpeg still starts on the keyframe before `at`; subtitles may
        // run a little early.
      }
    }
    if (id !== generation.current) return
    const current = store.getState().source
    setSource({
      kind: "stream",
      audio: audioIndex,
      quality: next,
      offset: start,
    })
    // The same address doesn't reload by itself.
    if (
      current?.kind === "stream" &&
      current.audio === audioIndex &&
      current.quality === next &&
      current.offset === start
    ) {
      video.current?.load()
    }
  }

  const startDirect = (at: number) => {
    generation.current++
    seekOnLoad.current = at
    setPending(at)
    // The same address doesn't reload by itself.
    if (store.getState().source?.kind === "direct") video.current?.load()
    setSource({ kind: "direct" })
  }

  /** Remember whether to keep playing across a reload. */
  const holdPlayState = () => {
    const el = video.current
    if (el) playOnLoad.current = !el.paused
  }

  return { startStream, startDirect, holdPlayState }
}

export type SourceStarters = ReturnType<typeof sourceStarters>

/**
 * Pick a source once the tracks are here: at first for an encode or for
 * audio the browser can't decode, and after the file failed to play as it
 * is. The tracks arrive from the server after the player mounts, and a
 * pick loads the video, often after a keyframe lookup.
 */
export function usePickSource(
  { options, store, refs, choice }: PlaybackCore,
  { startStream, startDirect }: SourceStarters,
) {
  const { audioTracks } = options
  const source = usePlayerStore((state) => state.source)
  const { tracks, wanted, standIn, preferred } = choice
  useEffect(() => {
    if (source || !audioTracks) return
    const { chosenAudio, quality, directFailed } = store.getState()
    const at = refs.startLater.current
    const track = chosenAudio ?? preferred?.index
    const full = (index: number | undefined) =>
      tracks.find((entry) => entry.index === index)
    if (track !== undefined) {
      const stoodIn = standIn && track === standIn.index ? full(track) : null
      const insteadOf = full(wanted?.index)
      // After a failed file, the toast says what the encode does instead.
      if (stoodIn && insteadOf) {
        if (!directFailed) standInNotice(stoodIn, insteadOf)
      } else {
        audioNotice(quality, full(track))
      }
      void startStream(at, track, quality, "before")
    } else if (directFailed) options.onUnsupported()
    else startDirect(at)
  }, [audioTracks, source])
}
