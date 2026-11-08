import type { PlaybackQuality } from "@matinee/contracts"
import { useEffect } from "react"
import { useShallow } from "zustand/shallow"

import { decodableAudioCodecs } from "@/lib/audio-support"
import { encodeVideoCodecs } from "@/lib/video-support"
import {
  type PlayerState,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import {
  audioNotice,
  burnInFailedNotice,
  burnInNotice,
  dismissPlaybackNotices,
  lostNotice,
  revertNotice,
  transcodeNotice,
} from "./playback-notices"
import {
  type AudioChoice,
  audioChoice,
  canSeekTo,
  fallbackQuality,
  hasPlayed,
  kindOf,
  offsetOf,
  type PlaybackOptions,
} from "./playback-source"
import {
  audioOf,
  type PlaybackCore,
  playbackClock,
  type SourceStarters,
  sourceStarters,
  usePickSource,
  useSourceRefs,
} from "./use-playback-source"

/**
 * Picks the source for the player and seeks within it. The original
 * quality with the track browsers play by default plays the file as it is,
 * when the browser decodes that track; another track or quality, or a
 * default track it can't decode, plays a stream from the server, which the
 * player seeks by starting a new one. The track that plays first is one in
 * the viewer's audio language, else the default. In place of one the
 * browser can't decode, the stream carries one in the same language that
 * it can, and converts the audio only when there is none. A subtitle track
 * that only an encode shows makes every source an encode with it burned
 * in.
 *
 * The source and the viewer's picks live in the player's store, so the
 * functions here read it when they run and work from any render.
 */
export function usePlayback(options: PlaybackOptions) {
  const { video, audioTracks, startAt } = options
  const store = usePlayerStoreApi()
  // The player's toasts are about this playback, so they go when it does.
  useEffect(() => () => dismissPlaybackNotices(), [])
  const choice = audioChoice(
    audioTracks,
    options.probeAudio,
    options.audioLanguage,
  )
  const refs = useSourceRefs(store, startAt)
  const core: PlaybackCore = { video, options, store, refs, choice }
  const { source, quality, audio } = usePlayerStore(
    useShallow((state) => ({
      source: state.source,
      quality: state.quality,
      audio: audioOf(state, choice),
    })),
  )
  const { position, duration } = playbackClock(core)
  const starters = sourceStarters(core)
  usePickSource(core, starters)
  const seek = seeker(core, duration, starters)
  const { selectAudio, selectQuality, selectBurnIn } = sourceSwitch(
    core,
    position,
    starters,
  )
  const { onLoaded, onTimeUpdate, heldStill, setPlayOnLoad } = loadEvents(core)
  const onError = errorFallback(core, position, starters)

  const src =
    source?.kind === "direct"
      ? options.directSrc
      : source?.kind === "stream"
        ? options.streamSrc({
            audio: source.audio,
            start: source.offset,
            quality: source.quality,
            audioCodecs: decodableAudioCodecs(),
            videoCodecs: encodeVideoCodecs(),
          })
        : undefined
  // The playlist, for hls.js or the browser to load; the video gets no src.
  const hls =
    source?.kind === "hls"
      ? {
          url: options.hlsSrc({
            audio: source.audio,
            start: source.start,
            quality: source.quality,
            audioCodecs: decodableAudioCodecs(),
            videoCodecs: encodeVideoCodecs(),
            subtitle: source.subtitle,
          }),
          start: source.start,
          attempt: source.attempt,
        }
      : null

  return {
    src,
    hls,
    source,
    offset: offsetOf(source),
    audio,
    /** The language of the audio that plays, once anything knows it. */
    audioLanguage: audioLanguageOf(choice, audio),
    tracks: choice.tracks,
    quality,
    position,
    duration,
    seek,
    selectAudio,
    selectQuality,
    selectBurnIn,
    onLoaded,
    onTimeUpdate,
    heldStill,
    setPlayOnLoad,
    onError,
  }
}

function seeker(
  { video, store }: PlaybackCore,
  duration: () => number,
  { startStream, holdPlayState }: SourceStarters,
) {
  return (to: number, snap: "before" | "nearest" = "nearest") => {
    const el = video.current
    const { source } = store.getState()
    if (!el || !source) return
    const target = Math.max(0, Math.min(duration() || to, to))
    if (source.kind !== "stream") {
      el.currentTime = target
      return
    }
    if (canSeekTo(el, target - source.offset)) {
      el.currentTime = target - source.offset
      return
    }
    holdPlayState()
    void startStream(target, source.audio, source.quality, snap)
  }
}

/**
 * Whether `audioIndex` at `quality` is the file as it is: the track the
 * browser plays by itself, which it decodes, video it decodes, and nothing
 * to burn in.
 */
function playsAsIs(
  state: PlayerState,
  choice: AudioChoice,
  options: PlaybackOptions,
  audioIndex: number | null,
  quality: PlaybackQuality,
): boolean {
  return (
    quality === "original" &&
    options.videoPlays &&
    state.burnIn === null &&
    (audioIndex === null || audioIndex === choice.primary?.index) &&
    choice.directAudio &&
    !state.directFailed
  )
}

function sourceSwitch(
  { store, choice, options }: PlaybackCore,
  position: () => number,
  { startStream, startDirect, holdPlayState }: SourceStarters,
) {
  const { tracks } = choice

  const switchTo = (audioIndex: number | null, next: PlaybackQuality) => {
    const at = position()
    holdPlayState()
    const state = store.getState()
    if (playsAsIs(state, choice, options, audioIndex, next)) {
      if (state.source?.kind !== "direct") startDirect(at)
    } else if (audioIndex !== null) {
      audioNotice(
        next,
        tracks.find((track) => track.index === audioIndex),
      )
      void startStream(at, audioIndex, next, "before")
    }
  }

  const selectAudio = (index: number) => {
    const state = store.getState()
    if (index === audioOf(state, choice)) return
    state.setChosenAudio(index)
    switchTo(index, state.quality)
  }

  const selectQuality = (next: PlaybackQuality) => {
    const state = store.getState()
    if (next === state.quality) return
    state.setQuality(next)
    usePlayerPreferencesStore.getState().setQuality(next)
    switchTo(audioOf(state, choice), next)
  }

  /**
   * Burns a subtitle track into the video, or for null goes back to what
   * plays without one.
   */
  const selectBurnIn = (trackId: string | null) => {
    const state = store.getState()
    if (trackId === state.burnIn) return
    state.setBurnIn(trackId)
    const audio = audioOf(state, choice)
    switchTo(audio, state.quality)
    if (trackId === null || audio === null) return
    burnInNotice(
      state.quality === "original"
        ? fallbackQuality(options.videoSize)
        : state.quality,
      options.videoCodec,
      tracks.find((track) => track.index === audio),
    )
  }

  return { selectAudio, selectQuality, selectBurnIn }
}

function loadEvents({ video, options, store, refs }: PlaybackCore) {
  const { seekOnLoad, resumeAt, playOnLoad, holding, played } = refs

  /** For the video's `loadedmetadata`. */
  const onLoaded = () => {
    const el = video.current
    if (!el) return
    // A new source drops the hold's pause event if it hadn't fired yet.
    holding.current = false
    if (seekOnLoad.current !== null) {
      el.currentTime = seekOnLoad.current
      seekOnLoad.current = null
    }
    store.getState().setPending(null)
    if (resumeAt.current !== null) {
      options.onResumed?.(resumeAt.current)
      resumeAt.current = null
    }
    if (playOnLoad.current) {
      el.play().catch(() => {
        // Autoplay is blocked until the viewer interacts; they press play.
      })
    }
  }

  /** For the video's `timeupdate`: notes the kinds of source that play. */
  const onTimeUpdate = () => {
    const el = video.current
    const current = store.getState().source
    if (!el || !current) return
    const kind = kindOf(current)
    if (!played.current.has(kind) && hasPlayed(el)) played.current.add(kind)
  }

  /**
   * For the video's `pause`: whether the player paused it itself, holding
   * the old source still while a new one loads. Asking clears it.
   */
  const heldStill = () => {
    const held = holding.current
    holding.current = false
    return held
  }

  /** Whether the source on its way plays once it loads. */
  const setPlayOnLoad = (on: boolean) => {
    playOnLoad.current = on
  }

  return { onLoaded, onTimeUpdate, heldStill, setPlayOnLoad }
}

/** For the video's `error`: fall back to something else, or give up. */
function errorFallback(
  { video, options, store, refs, choice }: PlaybackCore,
  position: () => number,
  { startStream, startDirect }: SourceStarters,
) {
  const { played, playOnLoad, resumeAt, startLater, handled } = refs
  const { tracks, primary, preferred, playsFile } = choice

  return (reported?: number) => {
    const code = reported ?? video.current?.error?.code
    if (code === undefined || code === MediaError.MEDIA_ERR_ABORTED) return
    const state = store.getState()
    const { source } = state
    if (source && handled.current === source) return
    handled.current = source
    state.setPending(null)
    // A file that failed before it loaded still owes its resume.
    const at = resumeAt.current ?? position()
    // The browser played this kind of source already, so falling back to
    // another or giving up would be wrong. Offer the same one again.
    if (
      source &&
      played.current.has(kindOf(source)) &&
      code !== MediaError.MEDIA_ERR_DECODE
    ) {
      const failed = source
      lostNotice(() => {
        playOnLoad.current = true
        if (failed.kind === "direct") startDirect(at)
        else void startStream(at, failed.audio, failed.quality, "before")
      })
      return
    }
    // A subtitle that won't burn in goes, and the rest plays without it.
    if (source?.kind === "hls" && source.subtitle !== null) {
      burnInFailedNotice()
      state.dropBurnIn()
      const audio = audioOf(state, choice)
      if (playsAsIs(store.getState(), choice, options, audio, state.quality)) {
        startDirect(at)
      } else if (audio !== null) {
        void startStream(at, audio, state.quality, "before")
      } else options.onUnsupported()
      return
    }
    // A stream that only converts the audio that plays first, or swaps the
    // default track for another, plays in place of the file, so its failure
    // counts as the file's.
    const asFile =
      source?.kind === "direct" ||
      (source?.kind === "stream" &&
        source.quality === "original" &&
        (source.audio === primary?.index ||
          source.audio === preferred?.index) &&
        !playsFile)
    if (asFile && code !== MediaError.MEDIA_ERR_NETWORK) {
      const next = fallbackQuality(options.videoSize)
      const audio = audioOf(state, choice)
      transcodeNotice(
        next,
        options.videoCodec,
        tracks.find((track) => track.index === audio),
      )
      // The cleared source is picked again from here.
      startLater.current = at
      state.failDirect(next)
      return
    }
    if (
      !source ||
      source.kind === "direct" ||
      state.directFailed ||
      // Only encodes play this video, and one just failed.
      !options.videoPlays
    ) {
      options.onUnsupported()
      return
    }
    revertNotice(playsFile)
    state.revert()
    if (playsFile || !preferred) startDirect(at)
    else void startStream(at, preferred.index, "original", "before")
  }
}

/** The language of the track at `index`, from the tracks or the probe. */
function audioLanguageOf(
  choice: AudioChoice,
  index: number | null,
): string | null {
  const track =
    choice.tracks.find((entry) => entry.index === index) ??
    (index === choice.preferred?.index ? choice.preferred : undefined)
  return track?.language ?? null
}
