import type { VideoStream } from "@matinee/contracts"

/*
 * Jellyfin's dynamic range rules (MediaStream.GetVideoColorRange and the
 * IsDovi helpers in EncodingHelper), on Matinee's probe.
 */

/** Jellyfin's VideoRangeType names, as clients list what they can show. */
export type VideoRangeType =
  | "Unknown"
  | "SDR"
  | "HDR10"
  | "HLG"
  /** Dolby Vision without a base layer others can show: profile 5, 10.0. */
  | "DOVI"
  | "DOVIWithHDR10"
  | "DOVIWithHLG"
  | "DOVIWithSDR"
  /** Profile 7, with an enhancement layer over an HDR10 base. */
  | "DOVIWithEL"
  | "DOVIWithHDR10Plus"
  | "DOVIWithELHDR10Plus"
  /** A Dolby Vision record outside the spec. */
  | "DOVIInvalid"
  | "HDR10Plus"

type VideoRange = "SDR" | "HDR" | "Unknown"

/** A stream's range and its type. */
export type ColorRange = { range: VideoRange; type: VideoRangeType }

const PQ = "smpte2084"
const HLG = "arib-std-b67"

const DOVI_TAGS = new Set(["dovi", "dvh1", "dvhe", "dav1"])

/** The range and its type, ported from GetVideoColorRange. */
export function videoColorRange(video: VideoStream): ColorRange {
  const isPq = video.colorTransfer === PQ
  const isHlg = video.colorTransfer === HLG
  // Dolby Vision this can't classify stays HDR only on a PQ or HLG base layer.
  const baseRange: VideoRange = isPq || isHlg ? "HDR" : "SDR"
  const dovi = video.dolbyVision
  const profile = dovi?.profile ?? null
  const compat = dovi?.blCompatibilityId ?? null
  const isDoviProfile =
    profile === 5 || profile === 7 || profile === 8 || profile === 10
  const isDoviFlag =
    dovi !== null &&
    dovi.rpuPresent &&
    dovi.blPresent &&
    (compat === 0 ||
      compat === 1 ||
      compat === 4 ||
      compat === 2 ||
      compat === 6)

  if (
    (isDoviProfile && isDoviFlag) ||
    (video.codecTag !== null && DOVI_TAGS.has(video.codecTag.toLowerCase()))
  ) {
    const set = doviRangeSet(profile, compat, baseRange)
    const expectedTransfer =
      set.type === "DOVIWithHDR10" || set.type === "DOVIWithEL"
        ? PQ
        : set.type === "DOVIWithHLG"
          ? HLG
          : null
    if (
      expectedTransfer !== null &&
      (video.colorSpace !== "bt2020nc" ||
        video.colorTransfer !== expectedTransfer ||
        video.colorPrimaries !== "bt2020")
    ) {
      return { range: baseRange, type: "DOVIInvalid" }
    }
    if (video.hdr10Plus) {
      if (set.type === "DOVIWithHDR10") {
        return { range: "HDR", type: "DOVIWithHDR10Plus" }
      }
      if (set.type === "DOVIWithEL") {
        return { range: "HDR", type: "DOVIWithELHDR10Plus" }
      }
    }
    return set
  }

  if (isPq) {
    return { range: "HDR", type: video.hdr10Plus ? "HDR10Plus" : "HDR10" }
  }
  if (isHlg) return { range: "HDR", type: "HLG" }
  return { range: "SDR", type: "SDR" }
}

function doviRangeSet(
  profile: number | null,
  compat: number | null,
  baseRange: VideoRange,
): ColorRange {
  switch (profile) {
    case 5:
      return { range: "HDR", type: "DOVI" }
    case 7:
      return { range: "HDR", type: "DOVIWithEL" }
    case 8:
      if (compat === 1) return { range: "HDR", type: "DOVIWithHDR10" }
      if (compat === 4) return { range: "HDR", type: "DOVIWithHLG" }
      if (compat === 2) return { range: "SDR", type: "DOVIWithSDR" }
      // Files outside Dolby's spec.
      return { range: baseRange, type: "DOVIInvalid" }
    case 10:
      if (compat === 0) return { range: "HDR", type: "DOVI" }
      if (compat === 1) return { range: "HDR", type: "DOVIWithHDR10" }
      if (compat === 2) return { range: "SDR", type: "DOVIWithSDR" }
      if (compat === 4) return { range: "HDR", type: "DOVIWithHLG" }
      return { range: baseRange, type: "DOVIInvalid" }
    default:
      return { range: "SDR", type: "SDR" }
  }
}

/** Dolby Vision over an HDR10 base layer (IsDoviWithHdr10Bl). */
export function isDoviWithHdr10Bl(video: VideoStream): boolean {
  const { type } = videoColorRange(video)
  return (
    type === "DOVIWithHDR10" ||
    type === "DOVIWithEL" ||
    type === "DOVIWithHDR10Plus" ||
    type === "DOVIWithELHDR10Plus" ||
    // Invalid may be HLG now.
    (type === "DOVIInvalid" && video.colorTransfer === PQ)
  )
}

/** HDR10+ dynamic metadata, alone or beside Dolby Vision (IsHdr10Plus). */
export function isHdr10Plus(video: VideoStream): boolean {
  const { type } = videoColorRange(video)
  return (
    type === "HDR10Plus" ||
    type === "DOVIWithHDR10Plus" ||
    type === "DOVIWithELHDR10Plus"
  )
}

/** The range an encode keeps when it keeps HDR. */
export type OutputRange = "SDR" | "HDR10" | "HLG"

/** The static HDR format a source's base layer can be shown as, if any. */
export function baseLayerRange(
  video: VideoStream,
  type: VideoRangeType = videoColorRange(video).type,
): OutputRange | null {
  switch (type) {
    case "HDR10":
    case "HDR10Plus":
    case "DOVIWithHDR10":
    case "DOVIWithHDR10Plus":
    case "DOVIWithEL":
    case "DOVIWithELHDR10Plus":
      return "HDR10"
    case "HLG":
    case "DOVIWithHLG":
      return "HLG"
    case "DOVIInvalid":
      if (video.colorTransfer === PQ) return "HDR10"
      if (video.colorTransfer === HLG) return "HLG"
      return null
    default:
      return null
  }
}
