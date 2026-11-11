import {
  type DownloadSpec,
  type MediaProbe,
  type PlaybackQuality,
  type PlaybackQualityPreset,
  PLAYBACK_QUALITIES,
} from "@matinee/contracts"

import type { Access } from "./policy"

export type StreamingAccess = Pick<Access, "maxBitrate" | "transcode">

type StreamFile = {
  probe: MediaProbe | null
  sizeBytes: number
  durationSeconds: number | null
}

/** The whole file's rate, including its audio and container. */
export function fileBitrate(file: StreamFile): number | null {
  const rate = file.probe?.format.bitRate
  if (rate && rate > 0) return rate
  const duration = file.probe?.format.durationSeconds ?? file.durationSeconds
  return duration && duration > 0 && file.sizeBytes > 0
    ? (file.sizeBytes * 8) / duration
    : null
}

/** An unknown rate cannot establish that the original fits a limit. */
export function originalAllowed(
  access: StreamingAccess,
  file: StreamFile,
): boolean {
  if (access.maxBitrate === null) return true
  const rate = fileBitrate(file)
  return rate !== null && rate <= access.maxBitrate
}

export function allowedQualities(
  access: StreamingAccess,
  qualities: readonly PlaybackQualityPreset[] = PLAYBACK_QUALITIES,
): PlaybackQualityPreset[] {
  return access.transcode
    ? qualities.filter(
        (preset) =>
          access.maxBitrate === null || preset.bitrate <= access.maxBitrate,
      )
    : []
}

/** Original needs the file's rate checked separately, since it copies video. */
export function encodeAllowed(
  access: StreamingAccess,
  quality: PlaybackQuality,
): boolean {
  return (
    quality !== "original" &&
    allowedQualities(access).some((preset) => preset.id === quality)
  )
}

export const DOWNLOADS_OFF = "Downloads are turned off for your account."
export const DOWNLOAD_VIDEO_OFF =
  "The server may not convert video for your account. Download the file as it is or keep its video."

export function downloadVideoAllowed(
  access: Pick<Access, "transcode">,
  spec: DownloadSpec,
): boolean {
  return (
    access.transcode || (spec.video.mode === "copy" && spec.burnIn === null)
  )
}
