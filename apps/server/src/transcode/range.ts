import type {
  TranscodeVideoCodec,
  TranscodingCapabilities,
  VideoStream,
} from "@matinee/contracts"

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

export type VideoRange = "SDR" | "HDR" | "Unknown"

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

/** Any Dolby Vision (IsDovi). */
export function isDovi(video: VideoStream): boolean {
  const { type } = videoColorRange(video)
  return (
    isDoviWithHdr10Bl(video) ||
    type === "DOVI" ||
    type === "DOVIWithHLG" ||
    type === "DOVIWithSDR" ||
    type === "DOVIInvalid"
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

/** Dynamic metadata a stream copy should drop for the client. */
export type DynamicHdrRemoval = "dovi" | "hdr10plus" | null

/**
 * Jellyfin's ShouldRemoveDynamicHdrMetadata: which dynamic metadata to strip
 * when the stream is copied to a client that shows `supported`. It assumes
 * the copy is allowed already.
 */
export function dynamicHdrRemoval(
  video: VideoStream,
  supported: readonly VideoRangeType[],
): DynamicHdrRemoval {
  const { range, type } = videoColorRange(video)
  if (range !== "HDR" && type !== "DOVIInvalid") return null
  if (supported.length === 0) return null

  const hasHdr10 = supported.includes("HDR10")
  const hasDovi = supported.includes("DOVI")
  const hasDoviWithEl = supported.includes("DOVIWithEL")
  const hasDoviWithElHdr10Plus = supported.includes("DOVIWithELHDR10Plus")

  // A client that shows HDR10 but not the enhancement layer.
  let removeDovi = !hasDoviWithEl && hasHdr10 && type === "DOVIWithEL"
  // A Dolby Vision player, which a broken record could crash. Players
  // without Dolby Vision ignore it.
  removeDovi ||= hasDovi && type === "DOVIInvalid"
  let removeHdr10Plus = false
  // Both an enhancement layer and HDR10+: keep the layer if the client
  // takes it without HDR10+, else drop Dolby Vision.
  if (type === "DOVIWithELHDR10Plus") {
    removeHdr10Plus = hasDoviWithEl && !hasDoviWithElHdr10Plus
    removeDovi ||= !removeHdr10Plus
  }
  if (removeDovi) return "dovi"
  // Dolby Vision players can trip over HDR10+ next to it.
  removeHdr10Plus ||= hasDovi && type === "DOVIWithHDR10Plus"
  return removeHdr10Plus ? "hdr10plus" : null
}

/**
 * The bitstream filter that does a removal in a stream copy, by Jellyfin's
 * GetBitStreamArgs, or null when this ffmpeg can't, which Jellyfin takes as
 * a reason not to copy.
 */
export function dynamicHdrRemovalFilter(
  video: VideoStream,
  removal: DynamicHdrRemoval,
  capabilities: TranscodingCapabilities,
): string | null {
  const { features } = capabilities
  const hevc = video.codec === "hevc"
  const av1 = video.codec === "av1"
  if (removal === "dovi") {
    if (hevc && features.hevcRemoveDovi) return "hevc_metadata=remove_dovi=1"
    if (av1 && features.av1RemoveDovi) return "av1_metadata=remove_dovi=1"
    if ((hevc || av1) && features.doviRpuStrip) return "dovi_rpu=strip=1"
    return null
  }
  if (removal === "hdr10plus") {
    if (hevc && features.hevcRemoveHdr10Plus) {
      return "hevc_metadata=remove_hdr10plus=1"
    }
    if (av1 && features.av1RemoveHdr10Plus) {
      return "av1_metadata=remove_hdr10plus=1"
    }
  }
  return null
}

/** The range an encode keeps when it keeps HDR. */
export type OutputRange = "SDR" | "HDR10" | "HLG"

export type ToneMapDecision = {
  /** The source's range type by Jellyfin's rules. */
  rangeType: VideoRangeType
  /** Pass as the pipeline's `keepHdr`: the encode stays 10-bit HDR. */
  keepHdr: boolean
  /** The source is HDR and the encode won't be: it needs tone mapping. */
  toneMap: boolean
  /** What the encode will be. */
  outputRange: OutputRange
  /**
   * For a stream copy instead of an encode: the dynamic metadata to strip,
   * see `dynamicHdrRemovalFilter`.
   */
  copyRemoval: DynamicHdrRemoval
}

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

/**
 * Whether an encode of `video` to `targetCodec` can stay HDR for a client
 * that shows `supportsRangeTypes` in that codec, by Jellyfin's range rules.
 * An encode never carries Dolby Vision or HDR10+: it keeps the base layer's
 * HDR10 or HLG, so the client needs that. Profile 5 has no such layer and
 * always tone maps. H.264 never keeps HDR.
 */
export function toneMapDecision(
  video: VideoStream,
  options: {
    supportsRangeTypes: readonly VideoRangeType[]
    targetCodec: TranscodeVideoCodec
  },
): ToneMapDecision {
  const { range, type } = videoColorRange(video)
  const supported = options.supportsRangeTypes
  const copyRemoval = dynamicHdrRemoval(video, supported)
  if (range !== "HDR") {
    return {
      rangeType: type,
      keepHdr: false,
      toneMap: false,
      outputRange: "SDR",
      copyRemoval,
    }
  }
  const base = baseLayerRange(video, type)
  // HDR10+ players show HDR10 too, as Jellyfin treats them.
  const clientShows =
    base === "HDR10"
      ? supported.includes("HDR10") || supported.includes("HDR10Plus")
      : base === "HLG"
        ? supported.includes("HLG")
        : false
  const keepHdr =
    base !== null &&
    clientShows &&
    options.targetCodec !== "h264" &&
    (video.bitDepth ?? 8) >= 10
  return {
    rangeType: type,
    keepHdr,
    toneMap: !keepHdr,
    outputRange: keepHdr && base ? base : "SDR",
    copyRemoval,
  }
}
