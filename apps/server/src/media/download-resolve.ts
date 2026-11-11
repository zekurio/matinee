import {
  type DownloadChoices,
  type DownloadSpec,
  type DownloadWishes,
  type PlaybackDevice,
  type TranscodeAudioCodec,
  type TranscodeVideoCodec,
  DOWNLOAD_AUDIO_CHANNELS,
  DOWNLOAD_VIDEO_PRESETS,
  canCopyAudio,
  canCopyVideo,
} from "@matinee/contracts"

import { DOWNLOAD_VIDEO_OFF } from "../access/media"
import type { Access } from "../access/policy"
import { DownloadSpecError } from "./download-encode"
import {
  decodesAudio,
  decodesVideo,
  playbackAudio,
  type StartFacts,
} from "./playback-start"

/** Downloads use device facts but never the streaming bit rate limit. */
type DownloadFacts = Omit<
  StartFacts,
  "access" | "sizeBytes" | "durationSeconds"
> & {
  access: Pick<Access, "transcode">
}

/** Container and device facts for both default selection and form edits. */
export function downloadChoices(
  device: PlaybackDevice,
  wishes: DownloadWishes,
  facts: DownloadFacts,
): DownloadChoices {
  const video = facts.probe.video
  const mkv = wishes.container === "mkv"
  const presets = video
    ? DOWNLOAD_VIDEO_PRESETS.filter(
        (preset) =>
          preset.height <= video.height ||
          Math.round((preset.height * 16) / 9) <= video.width,
      )
    : []
  const smallest = DOWNLOAD_VIDEO_PRESETS.at(-1)
  const codecs = mkv
    ? (["h264", "hevc", "av1"] satisfies TranscodeVideoCodec[]).filter(
        (codec) => facts.videoCodecs.includes(codec),
      )
    : device.encodeVideo.filter((codec) => facts.videoCodecs.includes(codec))
  const conversions = (["aac", "opus"] satisfies TranscodeAudioCodec[]).filter(
    (codec) =>
      facts.audioCodecs.includes(codec) && (mkv || decodesAudio(device, codec)),
  )
  return {
    keepsVideo:
      video !== null &&
      (mkv || (canCopyVideo(video.codec) && decodesVideo(device, video))),
    // A size is no use without a codec to encode it in.
    presets:
      !video || codecs.length === 0
        ? []
        : presets.length || !smallest
          ? presets
          : [smallest],
    codecs,
    hdrCodecs: video?.hdr
      ? codecs.filter((codec) => codec === "hevc" || codec === "av1")
      : [],
    audio: facts.audio.map((track) => {
      const most = track.channels ?? 2
      const counts = DOWNLOAD_AUDIO_CHANNELS.filter(
        (count) => count <= Math.max(most, 1) && (count > 1 || most === 1),
      )
      return {
        track,
        keep:
          mkv ||
          (canCopyAudio(track.codec) && decodesAudio(device, track.codec)),
        conversions: conversions.flatMap((codec) =>
          counts.map((channels) => ({ codec, channels })),
        ),
      }
    }),
    subtitles: facts.subtitles.filter((track) =>
      mkv ? track.delivery !== null : track.delivery === "webvtt",
    ),
    burnIn:
      mkv || codecs.length === 0
        ? []
        : facts.subtitles.filter(
            (track) => track.delivery === "pgs" || track.delivery === "burn-in",
          ),
  }
}

function language(tag: string | null): string | null {
  if (!tag) return null
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

/** No filesystem or database work. The existing planner validates the returned spec. */
export function resolveDownload(
  device: PlaybackDevice,
  wishes: DownloadWishes,
  facts: DownloadFacts,
) {
  if (!facts.probe.video)
    throw new DownloadSpecError("Only videos can be downloaded this way.")
  const choices = downloadChoices(device, wishes, facts)
  const { audio: preferred } = playbackAudio({ device }, facts)
  const primary = facts.audio.find((track) => track.primary) ?? facts.audio[0]
  const originalPlays =
    (device.containers.includes("*") ||
      device.containers.includes(facts.container)) &&
    (!facts.probe.video || decodesVideo(device, facts.probe.video)) &&
    (!preferred ||
      (decodesAudio(device, preferred.codec) &&
        (device.selectAudio || preferred.index === primary?.index)))
  const selected =
    wishes.audio === "all"
      ? preferred
        ? [preferred, ...facts.audio.filter((track) => track !== preferred)]
        : facts.audio
      : wishes.audio === "none"
        ? []
        : wishes.audio === "selected"
          ? wishes.audioIndices.map((index) => {
              const track = facts.audio.find((entry) => entry.index === index)
              if (!track)
                throw new DownloadSpecError(
                  "The selected audio tracks aren't available in this file.",
                )
              return track
            })
          : preferred
            ? [preferred]
            : []
  if (selected.length > 16)
    throw new DownloadSpecError("A download can hold at most 16 audio tracks.")
  const preset =
    wishes.preset ??
    choices.presets.find((entry) => entry.height <= 1080) ??
    choices.presets[0]
  const codec = wishes.codec ?? choices.codecs[0]
  const copy = wishes.preset === null && choices.keepsVideo
  if (!copy && !facts.access.transcode)
    throw new DownloadSpecError(DOWNLOAD_VIDEO_OFF)
  if (!copy && (!preset || !codec || !choices.codecs.includes(codec)))
    throw new DownloadSpecError(
      "The server can't encode video in a codec this device plays.",
    )
  const languages = new Set(
    [
      language(facts.preferences.subtitleLanguage ?? device.language),
      language(preferred?.language ?? null),
    ].filter((tag) => tag !== null),
  )
  const subtitles =
    wishes.subtitles === "none"
      ? []
      : choices.subtitles
          .filter(
            (track) =>
              wishes.subtitles === "all" ||
              languages.has(language(track.language) ?? ""),
          )
          .slice(0, wishes.subtitles === "all" ? 32 : 8)
          .map((track) => track.id)
  const spec: DownloadSpec = {
    container: wishes.container,
    video:
      !copy && preset && codec
        ? {
            mode: "encode",
            codec,
            maxHeight: preset.height,
            bitrate: preset.bitrate,
            keepHdr: wishes.keepHdr && choices.hdrCodecs.includes(codec),
          }
        : { mode: "copy" },
    audio: selected.map((track) => {
      const choice = choices.audio.find(
        (entry) => entry.track.index === track.index,
      )
      if (choice?.keep) return { index: track.index, mode: "copy" }
      // The first conversion is stereo, or mono from mono.
      const conversion = choice?.conversions[0]
      if (!conversion)
        throw new DownloadSpecError(
          "No audio conversion is available for this device.",
        )
      return { index: track.index, mode: "encode", ...conversion }
    }),
    subtitles,
    burnIn: null,
  }
  return { originalPlays, choices, spec }
}
