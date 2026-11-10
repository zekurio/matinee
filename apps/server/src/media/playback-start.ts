import {
  type AudioTrack,
  type Keyframes,
  type MediaProbe,
  type PlaybackDevice,
  type PlaybackPreferences,
  type PlaybackStart,
  type PlaybackStartInput,
  type SubtitleTrack,
  type TrackPicks,
  type VideoStream,
  PLAYBACK_QUALITIES,
  mediaHlsPath,
  mediaPlaybackPath,
  mediaStreamPath,
  subtitlePath,
} from "@matinee/contracts"

function baseLanguage(tag: string | null): string | null {
  if (!tag) return null
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}
const sameLanguage = (a: string | null, b: string | null) =>
  baseLanguage(a) !== null && baseLanguage(a) === baseLanguage(b)
const commentary = (track: AudioTrack) => /commentary/i.test(track.label)
const accepts = (list: readonly string[], value: string) =>
  list.includes("*") || list.includes(value)

/** Whether the device decodes audio in `codec`, ffmpeg's name for it. */
export function decodesAudio(device: PlaybackDevice, codec: string): boolean {
  return (
    accepts(device.audio, codec) ||
    (codec.startsWith("pcm_") && device.audio.includes("pcm_*"))
  )
}

/**
 * Whether one of the device's decoders fits the video. What the probe
 * doesn't say about a stream, like its level, rules nothing out.
 */
export function decodesVideo(
  device: PlaybackDevice,
  video: VideoStream,
): boolean {
  return device.video.some(
    (decoder) =>
      (decoder.codec === "*" || decoder.codec === video.codec) &&
      (decoder.maxWidth === null || video.width <= decoder.maxWidth) &&
      (decoder.maxHeight === null || video.height <= decoder.maxHeight) &&
      (decoder.maxBitDepth === null ||
        (video.bitDepth ?? 8) <= decoder.maxBitDepth) &&
      (decoder.profiles === null ||
        video.profile === null ||
        decoder.profiles.includes(video.profile)) &&
      (decoder.maxLevel === null ||
        video.level === null ||
        video.level <= decoder.maxLevel) &&
      (decoder.hdr === null ||
        video.hdr === null ||
        decoder.hdr.includes(video.hdr)) &&
      (decoder.dolbyVisionProfiles === null ||
        video.dolbyVisionProfile === null ||
        decoder.dolbyVisionProfiles.includes(video.dolbyVisionProfile)),
  )
}

export type StartFacts = {
  probe: MediaProbe
  container: string
  audio: AudioTrack[]
  subtitles: SubtitleTrack[]
  preferences: PlaybackPreferences
  picks: TrackPicks
  originalLanguage: string | null
  resume: number
  audioCodecs: readonly string[]
  videoCodecs: readonly string[]
}

export type PlaybackDecision = Omit<PlaybackStart, "item">

/** The audio playback starts with, including a decodable same-language stand-in. */
export function playbackAudio(
  input: Pick<PlaybackStartInput, "device" | "audio">,
  facts: Pick<
    StartFacts,
    "audio" | "preferences" | "picks" | "originalLanguage"
  >,
) {
  const { device } = input
  const { preferences, picks } = facts
  const decodes = (codec: string) => decodesAudio(device, codec)
  const primary = facts.audio.find((track) => track.primary) ?? facts.audio[0]
  const language =
    preferences.audioLanguage === "original"
      ? facts.originalLanguage
      : preferences.audioLanguage
  const inLanguage = facts.audio.filter(
    (track) => sameLanguage(track.language, language) && !commentary(track),
  )
  const wanted =
    facts.audio.find((track) => track.index === (input.audio ?? picks.audio)) ??
    inLanguage.find((track) => track === primary) ??
    inLanguage.toSorted((a, b) => (b.channels ?? 0) - (a.channels ?? 0))[0] ??
    primary
  const standIn =
    input.audio === undefined &&
    wanted &&
    !decodes(wanted.codec) &&
    wanted.language
      ? facts.audio
          .filter(
            (track) =>
              track !== wanted &&
              track.language === wanted.language &&
              decodes(track.codec) &&
              !commentary(track),
          )
          .toSorted((a, b) => (b.channels ?? 0) - (a.channels ?? 0))[0]
      : undefined
  return { audio: standIn ?? wanted ?? null, standIn: !!standIn }
}

/** Decide without reading files, the database, or a device API. Null means exhausted. */
export function decidePlayback(
  input: PlaybackStartInput,
  facts: StartFacts,
): PlaybackDecision | null {
  const { device } = input
  const { probe, preferences, picks } = facts
  const { audio, standIn } = playbackAudio(input, facts)
  const decodes = (codec: string) => decodesAudio(device, codec)
  const primary = facts.audio.find((track) => track.primary) ?? facts.audio[0]
  const video = probe.video
  const videoPlays = !video || decodesVideo(device, video)
  // Only an encode makes another quality or burns a subtitle in, so once
  // one failed the original plays, without such a subtitle.
  const encodeFailed = input.failed.includes("transcode")
  const asked = encodeFailed ? "original" : (input.quality ?? "original")
  const fileAudio =
    !audio ||
    (decodes(audio.codec) &&
      (device.selectAudio || audio.index === primary?.index))
  const filePlays =
    accepts(device.containers, facts.container) &&
    videoPlays &&
    fileAudio &&
    !input.failed.includes("direct") &&
    !input.failed.includes("remux") &&
    asked === "original"
  const embedded = (track: SubtitleTrack) =>
    track.source === "embedded" &&
    accepts(device.embeddedSubtitles, track.format)
  const external = (track: SubtitleTrack) =>
    track.delivery !== null &&
    track.delivery !== "burn-in" &&
    (device.subtitles.includes(track.delivery) ||
      (track.source === "sidecar" &&
        device.sidecarSubtitles.includes(track.delivery)))
  const drawable = (track: SubtitleTrack) =>
    external(track) || (filePlays && embedded(track))
  const shown = facts.subtitles.filter(drawable)
  const subtitleLanguage = preferences.subtitleLanguage ?? device.language
  const best = (lang: string | null, forced = false) =>
    shown
      .filter(
        (track) =>
          track.forced === forced && sameLanguage(track.language, lang),
      )
      .toSorted(
        (a, b) =>
          (b.language === lang ? 4 : 0) +
          (b.default ? 2 : 0) +
          (b.sdh ? 0 : 1) -
          ((a.language === lang ? 4 : 0) +
            (a.default ? 2 : 0) +
            (a.sdh ? 0 : 1)),
      )[0] ?? null
  const forced = () =>
    best(audio?.language ?? null, true) ?? best(subtitleLanguage, true)
  const defaults = () => {
    switch (preferences.subtitleMode) {
      case "off":
        return null
      case "forced":
        return forced()
      case "always":
        return best(subtitleLanguage) ?? forced()
      case "foreign":
        return audio?.language &&
          !sameLanguage(audio.language, subtitleLanguage)
          ? (best(subtitleLanguage) ?? forced())
          : forced()
      case "default": {
        const flagged = shown.filter((track) => track.default)
        return (
          forced() ??
          (shown.length > 1 && flagged.length === shown.length
            ? null
            : (flagged[0] ?? null))
        )
      }
    }
  }
  const remembered =
    picks.subtitle?.trackId === null
      ? null
      : shown.find((track) => track.id === picks.subtitle?.trackId)
  const picked = input.subtitle
    ? (facts.subtitles.find((track) => track.id === input.subtitle?.trackId) ??
      null)
    : remembered === undefined
      ? defaults()
      : remembered
  const subtitle = picked && encodeFailed && !drawable(picked) ? null : picked
  const burn = subtitle !== null && !drawable(subtitle)
  let quality = asked
  const reasons: PlaybackStart["reasons"] = []
  if (!accepts(device.containers, facts.container)) reasons.push("container")
  if (!videoPlays) reasons.push("video")
  if (audio && !decodes(audio.codec)) reasons.push("audio")
  if (!fileAudio && audio && decodes(audio.codec))
    reasons.push("audio-selection")
  if (burn) reasons.push("subtitle")
  if (quality !== "original") reasons.push("quality")
  if (input.failed.length) reasons.push("failed")
  let method: PlaybackStart["method"] = "direct"
  if (
    burn ||
    !videoPlays ||
    quality !== "original" ||
    input.failed.includes("remux")
  )
    method = "transcode"
  else if (!filePlays) method = "remux"
  if (input.failed.includes(method)) return null
  if (method === "transcode" && quality === "original")
    quality =
      PLAYBACK_QUALITIES.find(
        (preset) =>
          preset.bitrate <= 20_000_000 &&
          (!video || preset.width <= Math.max(video.width, 640)),
      )?.id ?? "720p-4"
  const encodeVideo = device.encodeVideo.filter((codec) =>
    facts.videoCodecs.includes(codec),
  )
  if (method !== "direct" && !audio) return null
  if (method === "transcode" && (!encodeVideo.length || (burn && !device.hls)))
    return null
  const hls = method === "transcode" && device.hls
  let subtitleMode: PlaybackStart["subtitleMode"] = subtitle
    ? burn
      ? "burn-in"
      : filePlays && method === "direct" && embedded(subtitle)
        ? "player"
        : "client"
    : null
  // Embedded-only tracks cannot survive a remux chosen for another reason.
  if (subtitle && subtitleMode === "client" && !external(subtitle)) return null
  if (!subtitle) subtitleMode = null
  const position = input.position ?? facts.resume
  const options = {
    audio: audio?.index ?? 0,
    start: position,
    quality,
    audioCodecs: device.streamAudio,
    videoCodecs: encodeVideo,
    session: input.sessionId,
  }
  const convertedAudio =
    method !== "direct" &&
    audio &&
    !device.streamAudio.some((codec) => codec === audio.codec)
      ? (device.streamAudio.find(
          (codec) =>
            (codec === "opus" || codec === "aac") &&
            facts.audioCodecs.includes(codec),
        ) ?? "aac")
      : null
  if (
    convertedAudio !== null &&
    (!device.streamAudio.some((codec) => codec === convertedAudio) ||
      !facts.audioCodecs.includes(convertedAudio))
  )
    return null
  return {
    method,
    url:
      method === "direct"
        ? mediaStreamPath(input.itemId)
        : hls
          ? mediaHlsPath(input.itemId, {
              ...options,
              subtitle: burn ? subtitle?.id : null,
            })
          : mediaPlaybackPath(input.itemId, options),
    hls,
    offset: method === "direct" || hls ? 0 : position,
    start: method === "direct" || hls ? position : 0,
    position,
    audio,
    convertedAudio,
    standIn,
    subtitle,
    subtitleMode,
    subtitleUrl:
      subtitle && subtitleMode === "client"
        ? subtitlePath(input.itemId, subtitle.id)
        : null,
    audioTracks: facts.audio,
    subtitleTracks: facts.subtitles,
    quality,
    reasons,
    next: null,
  }
}

/** Snap a copied stream and rebuild its URL on the same timeline. */
export function snapPlayback(
  plan: PlaybackDecision,
  input: PlaybackStartInput,
  keyframes: Keyframes,
): PlaybackDecision {
  const at = plan.position
  const position =
    input.snap === "nearest" &&
    keyframes.after !== null &&
    keyframes.after - at < at - keyframes.before
      ? keyframes.after
      : keyframes.before
  return {
    ...plan,
    position,
    offset: position,
    start: 0,
    url: mediaPlaybackPath(input.itemId, {
      audio: plan.audio?.index ?? 0,
      start: position,
      quality: plan.quality,
      audioCodecs: input.device.streamAudio,
      videoCodecs: input.device.encodeVideo,
      session: input.sessionId,
    }),
  }
}
