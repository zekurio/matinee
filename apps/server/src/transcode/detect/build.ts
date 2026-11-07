import {
  HARDWARE_DEVICES,
  TRANSCODE_VIDEO_CODECS,
  type TranscodingCapabilities,
} from "@matinee/contracts"

import { env } from "../../env"
import { hardwareEncoderName } from "../video/encoders"
import { ffmpeg } from "./ffmpeg"
import { missingHardware } from "./hardware"

/** The names in `-encoders` or `-filters`, after their flag columns. */
function listed(output: string, pattern: RegExp): Set<string> {
  const names = new Set<string>()
  for (const line of output.split("\n")) {
    const name = pattern.exec(line)?.[1]
    if (name) names.add(name)
  }
  return names
}

const SOFTWARE_ENCODERS = ["libx264", "libx265", "libsvtav1"]
/** Opus, then the AAC encoders in Jellyfin's order of preference. */
const AUDIO_ENCODERS = ["libopus", "aac_at", "libfdk_aac", "aac"]

/** The filters the pipeline and Jellyfin's support checks ask about. */
const FILTERS = [
  "yadif",
  "bwdif",
  "zscale",
  "tonemapx",
  "alphasrc",
  "scale_vaapi",
  "deinterlace_vaapi",
  "tonemap_vaapi",
  "procamp_vaapi",
  "overlay_vaapi",
  "transpose_vaapi",
  "hwupload_vaapi",
  "scale_opencl",
  "tonemap_opencl",
  "overlay_opencl",
  "yadif_opencl",
  "bwdif_opencl",
  "scale_qsv",
  "vpp_qsv",
  "deinterlace_qsv",
  "overlay_qsv",
  "scale_cuda",
  "yadif_cuda",
  "bwdif_cuda",
  "tonemap_cuda",
  "overlay_cuda",
  "hwupload_cuda",
  "scale_vt",
  "yadif_videotoolbox",
  "bwdif_videotoolbox",
  "overlay_videotoolbox",
  "tonemap_videotoolbox",
]

/** `ffmpeg -h filter=...` or `bsf=...` lists the option. */
async function hasOption(
  kind: "filter" | "bsf" | "encoder",
  name: string,
  option: string,
) {
  const run = await ffmpeg(["-hide_banner", "-h", `${kind}=${name}`])
  const heading =
    kind === "filter"
      ? `Filter ${name}`
      : kind === "bsf"
        ? `Bit stream filter ${name}`
        : `Encoder ${name}`
  return run.ok && run.stdout.includes(heading) && run.stdout.includes(option)
}

/**
 * jellyfin-ffmpeg's pause keys: a dummy encode answers `?` with its key
 * help, then `q` ends it (CheckSupportedRuntimeKey).
 */
async function hasPauseKeys(): Promise<boolean> {
  const run = await ffmpeg(
    [
      "-hide_banner",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=1x1:r=1:d=5",
      "-f",
      "null",
      "-",
    ],
    "?q",
  )
  return run.stderr.some((line) => /^p\s+pause transcoding/.test(line.trim()))
}

function parseVersion(output: string) {
  const firstLine = output.split("\n")[0] ?? ""
  const version = /^ffmpeg version (\S+)/.exec(firstLine)?.[1] ?? null
  const numbers = /^n?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version ?? "")
  return {
    version,
    versionNumbers: numbers
      ? [Number(numbers[1]), Number(numbers[2]), Number(numbers[3] ?? 0)]
      : null,
    jellyfin: /jellyfin/i.test(output),
  }
}

export async function detectBuild(
  ffmpegPath: string,
  versionOutput: string,
): Promise<TranscodingCapabilities> {
  // One ffmpeg at a time, here and below: a short burst is kinder to a
  // busy machine than a dozen processes at once.
  const hwaccelRun = await ffmpeg(["-hide_banner", "-hwaccels"])
  const encoderRun = await ffmpeg(["-hide_banner", "-encoders"])
  const filterRun = await ffmpeg(["-hide_banner", "-filters"])
  const hwaccels = hwaccelRun.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
  // Jellyfin's CodecRegex and FilterRegex.
  const encoderNames = listed(encoderRun.stdout, /^\s\S{6}\s([\w-]+)\s/)
  const filterNames = listed(filterRun.stdout, /^\s\S{2,3}\s([\w-]+)\s/)
  const wanted = [
    ...SOFTWARE_ENCODERS,
    ...AUDIO_ENCODERS,
    ...TRANSCODE_VIDEO_CODECS.flatMap((codec) =>
      HARDWARE_DEVICES.map(
        (device) => hardwareEncoderName(codec, device) ?? "",
      ),
    ),
  ]
  const features = await detectFeatures(filterNames)
  return {
    ffmpegPath,
    ...parseVersion(versionOutput),
    error: null,
    detectedAt: new Date(),
    hwaccels,
    encoders: wanted.filter((name) => encoderNames.has(name)),
    filters: FILTERS.filter((name) => filterNames.has(name)),
    features,
    hardware: [],
  }
}

async function detectFeatures(
  filterNames: Set<string>,
): Promise<TranscodingCapabilities["features"]> {
  const tonemapOpenclBt2390 = await hasOption(
    "filter",
    "tonemap_opencl",
    "bt2390",
  )
  const tonemapCudaName = await hasOption(
    "filter",
    "tonemap_cuda",
    "GPU accelerated HDR to SDR tonemapping",
  )
  const scaleCudaFormat = await hasOption("filter", "scale_cuda", "format")
  const overlayOpenclFrameSync = await hasOption(
    "filter",
    "overlay_opencl",
    "Action to take when encountering EOF from secondary input",
  )
  const overlayVaapiFrameSync = await hasOption(
    "filter",
    "overlay_vaapi",
    "Action to take when encountering EOF from secondary input",
  )
  const hevcRemoveDovi = await hasOption("bsf", "hevc_metadata", "remove_dovi")
  const hevcRemoveHdr10Plus = await hasOption(
    "bsf",
    "hevc_metadata",
    "remove_hdr10plus",
  )
  const av1RemoveDovi = await hasOption("bsf", "av1_metadata", "remove_dovi")
  const av1RemoveHdr10Plus = await hasOption(
    "bsf",
    "av1_metadata",
    "remove_hdr10plus",
  )
  const doviRpuStrip = await hasOption("bsf", "dovi_rpu", "strip")
  const encoderDolbyVisionOption = await hasOption(
    "encoder",
    "libx265",
    "dolbyvision",
  )
  const pauseKeys = await hasPauseKeys()
  return {
    tonemapx: filterNames.has("tonemapx"),
    pauseKeys,
    tonemapOpenclBt2390,
    tonemapCudaName,
    scaleCudaFormat,
    overlayOpenclFrameSync,
    overlayVaapiFrameSync,
    hevcRemoveDovi,
    hevcRemoveHdr10Plus,
    av1RemoveDovi,
    av1RemoveHdr10Plus,
    doviRpuStrip,
    encoderDolbyVisionOption,
  }
}

export function emptyCapabilities(error: string): TranscodingCapabilities {
  return {
    ffmpegPath: env.MATINEE_FFMPEG_PATH,
    version: null,
    versionNumbers: null,
    jellyfin: false,
    error,
    detectedAt: new Date(),
    hwaccels: [],
    encoders: [],
    filters: [],
    features: {
      tonemapx: false,
      pauseKeys: false,
      tonemapOpenclBt2390: false,
      tonemapCudaName: false,
      scaleCudaFormat: false,
      overlayOpenclFrameSync: false,
      overlayVaapiFrameSync: false,
      hevcRemoveDovi: false,
      hevcRemoveHdr10Plus: false,
      av1RemoveDovi: false,
      av1RemoveHdr10Plus: false,
      doviRpuStrip: false,
      encoderDolbyVisionOption: false,
    },
    hardware: HARDWARE_DEVICES.map((acceleration) =>
      missingHardware(acceleration),
    ),
  }
}
