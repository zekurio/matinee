import { access } from "node:fs/promises"

import {
  type CapabilityCheck,
  type CheckStatus,
  type EncoderCheck,
  type GpuVendor,
  HARDWARE_DEVICES,
  type HardwareCapability,
  type HardwareDevice,
  TRANSCODE_VIDEO_CODECS,
  type TranscodeVideoCodec,
  type TranscodingCapabilities,
  type TranscodingSettings,
  type VideoStream,
} from "@matinee/contracts"

import { env } from "../env"
import { log } from "../log"
import { processFailureKind, runProcess } from "../media/process"
import {
  buildVideoPipeline,
  hardwareEncoderName,
  openclDevice,
} from "./pipeline"
import { transcodingDefaults, transcodingSettings } from "./settings"

/*
 * What the configured ffmpeg can do, as Jellyfin's EncoderValidator and
 * alloy's capabilities.ts find out: the build's encoders, filters, and
 * options, then each GPU path tried with a tiny encode, so nothing counts as
 * usable before it ran. Detection takes a few seconds and is cached per
 * device setting; concurrent callers share one run.
 */

const CHECK_TIMEOUT_MS = 20_000
const ERROR_LINES = 4

/** The devices detection opens. Other settings don't change the result. */
export type CapabilityDevices = Pick<
  TranscodingSettings,
  "vaapiDevice" | "qsvDevice"
>

let cached: { key: string; capabilities: TranscodingCapabilities } | null = null
let inflight: {
  key: string
  promise: Promise<TranscodingCapabilities>
} | null = null

/** Detect, or return what the last detection for these devices found. */
export function transcodingCapabilities(
  devices: CapabilityDevices,
  refresh = false,
): Promise<TranscodingCapabilities> {
  const key = [
    env.MATINEE_FFMPEG_PATH,
    devices.vaapiDevice,
    devices.qsvDevice,
  ].join("\0")
  if (cached?.key === key && !refresh)
    return Promise.resolve(cached.capabilities)
  if (inflight?.key === key) return inflight.promise
  const promise = detect(devices)
    .then((capabilities) => {
      cached = { key, capabilities }
      return capabilities
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
  inflight = { key, promise }
  return promise
}

/**
 * The settings in use and what this server can do with them: what a
 * transcode passes to `buildVideoPipeline`.
 */
export async function currentTranscoding(): Promise<{
  settings: TranscodingSettings
  capabilities: TranscodingCapabilities
}> {
  const settings = await transcodingSettings()
  return { settings, capabilities: await transcodingCapabilities(settings) }
}

type Run = {
  ok: boolean
  /** The command didn't start: ffmpeg isn't there. */
  missing: boolean
  stdout: string
  stderr: string[]
  error: string | null
}

async function ffmpeg(args: string[], stdin?: string): Promise<Run> {
  const stdout: string[] = []
  const stderr: string[] = []
  try {
    await runProcess({
      name: "ffmpeg",
      command: env.MATINEE_FFMPEG_PATH,
      args,
      timeoutMs: CHECK_TIMEOUT_MS,
      stdin,
      // Detection is background work on what may be a busy home server.
      priority: 19,
      idleIo: true,
      onStdoutLine: (line) => stdout.push(line),
      onStderrLine: (line) => {
        stderr.push(line)
        if (stderr.length > 400) stderr.shift()
      },
    })
    return {
      ok: true,
      missing: false,
      stdout: stdout.join("\n"),
      stderr,
      error: null,
    }
  } catch (cause) {
    const kind = processFailureKind(cause)
    return {
      ok: false,
      missing: kind === "start",
      stdout: stdout.join("\n"),
      stderr,
      error:
        kind === "timeout"
          ? "Timed out."
          : (errorTail(stderr) ??
            (cause instanceof Error ? cause.message : String(cause))),
    }
  }
}

/** The last lines that say something, without libva's chatter. */
function errorTail(stderr: string[]): string | null {
  const lines = stderr
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("libva info:"))
  return lines.length > 0 ? lines.slice(-ERROR_LINES).join("\n") : null
}

const ok = (): CapabilityCheck => ({ status: "ok", error: null })
const missing = (): CapabilityCheck => ({ status: "missing", error: null })
const failed = (error: string | null): CapabilityCheck => ({
  status: "failed",
  error: error ?? "ffmpeg failed.",
})

/** Runs a check: `ok` when ffmpeg exits 0, `failed` with its last words. */
async function check(args: string[]): Promise<CapabilityCheck> {
  const run = await ffmpeg(["-hide_banner", "-nostdin", "-v", "error", ...args])
  return run.ok ? ok() : failed(run.error)
}

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

async function detect(
  devices: CapabilityDevices,
): Promise<TranscodingCapabilities> {
  const started = Date.now()
  const ffmpegPath = env.MATINEE_FFMPEG_PATH
  const versionRun = await ffmpeg(["-hide_banner", "-version"])
  if (!versionRun.ok) {
    const capabilities = emptyCapabilities(
      versionRun.error ?? "ffmpeg didn't run.",
    )
    log.warn(`Couldn't run ${ffmpegPath}: ${capabilities.error}`)
    return capabilities
  }
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
    ...TRANSCODE_VIDEO_CODECS.flatMap((codec) =>
      HARDWARE_DEVICES.map(
        (device) => hardwareEncoderName(codec, device) ?? "",
      ),
    ),
  ]
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

  const capabilities: TranscodingCapabilities = {
    ffmpegPath,
    ...parseVersion(versionRun.stdout),
    error: null,
    detectedAt: new Date(),
    hwaccels,
    encoders: wanted.filter((name) => encoderNames.has(name)),
    filters: FILTERS.filter((name) => filterNames.has(name)),
    features: {
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
    },
    hardware: [],
  }
  // One GPU at a time: parallel test encodes would fight over it.
  for (const device of HARDWARE_DEVICES) {
    capabilities.hardware.push(
      await detectHardware(device, devices, capabilities),
    )
  }
  const usable = capabilities.hardware
    .filter((entry) => entry.device.status === "ok")
    .map((entry) => entry.acceleration)
  log.info(
    `Detected ffmpeg ${capabilities.version ?? "of unknown version"}${capabilities.jellyfin ? " (Jellyfin)" : ""}, ` +
      `GPUs: ${usable.join(", ") || "none"}, in ${Math.round((Date.now() - started) / 100) / 10} s`,
  )
  return capabilities
}

function emptyCapabilities(error: string): TranscodingCapabilities {
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

function missingHardware(acceleration: HardwareDevice): HardwareCapability {
  return {
    acceleration,
    device: missing(),
    devicePath: null,
    driver: null,
    vendor: null,
    encoders: TRANSCODE_VIDEO_CODECS.map((codec) => ({
      codec,
      encoder: hardwareEncoderName(codec, acceleration) ?? codec,
      status: "missing",
      error: null,
      tenBit: "missing",
    })),
    tonemap: missing(),
    vppTonemap: missing(),
    videoToolboxTonemap: missing(),
  }
}

/** The hwaccel each acceleration needs in `-hwaccels`. */
const HWACCELS = new Map<HardwareDevice, string>([
  ["vaapi", "vaapi"],
  ["qsv", "qsv"],
  ["nvenc", "cuda"],
  ["videotoolbox", "videotoolbox"],
])

/** The device arguments of each test: what the pipeline will open. */
function initArgs(
  acceleration: HardwareDevice,
  path: string,
  vendor: GpuVendor | null,
): string[] {
  const node = path || ",vendor_id=0x8086"
  switch (acceleration) {
    case "vaapi": {
      const driver =
        vendor === "intel-ihd"
          ? ",driver=iHD"
          : vendor === "intel-i965"
            ? ",driver=i965"
            : ""
      return ["-init_hw_device", `vaapi=va:${path}${driver}`]
    }
    case "qsv":
      return [
        "-init_hw_device",
        `vaapi=va:${node},driver=iHD`,
        "-init_hw_device",
        "qsv=qs@va",
      ]
    case "nvenc":
      return ["-init_hw_device", "cuda=cu:0"]
    default:
      return ["-init_hw_device", "videotoolbox=vt"]
  }
}

function vendorOf(driver: string | null): GpuVendor | null {
  if (!driver) return null
  if (driver.includes("Intel iHD driver")) return "intel-ihd"
  if (driver.includes("Intel i965 driver")) return "intel-i965"
  if (driver.includes("Mesa Gallium driver")) return "amd"
  return "other"
}

const NULL_INPUT = [
  "-f",
  "lavfi",
  "-i",
  "nullsrc=s=64x64:r=1:d=1",
  "-frames:v",
  "1",
  "-f",
  "null",
  "-",
]

/** A device opens; VAAPI also says whose driver it is (CheckVaapiDeviceByDriverName). */
async function openDevice(acceleration: HardwareDevice, path: string) {
  if (path) {
    try {
      await access(path)
    } catch {
      return {
        device: failed(`${path} doesn't exist or isn't readable.`),
        driver: null,
      }
    }
  }
  const run = await ffmpeg([
    "-hide_banner",
    "-nostdin",
    "-v",
    "verbose",
    ...initArgs(acceleration, path, null),
    ...NULL_INPUT,
  ])
  const driver =
    run.stderr
      .map((line) => /VAAPI driver: (.+?)\.?\s*$/.exec(line)?.[1])
      .find(Boolean) ?? null
  return { device: run.ok ? ok() : failed(run.error), driver }
}

const TEST_FRAMES = 12

/** A small 8-bit SDR source, as the probe would describe lavfi's. */
const SDR_TEST_SOURCE: VideoStream = {
  index: 0,
  codec: "h264",
  codecTag: null,
  profile: "High",
  level: 30,
  width: 320,
  height: 240,
  frameRate: 24,
  bitRate: null,
  pixelFormat: "yuv420p",
  bitDepth: 8,
  colorTransfer: "bt709",
  colorPrimaries: "bt709",
  colorSpace: "bt709",
  colorRange: "tv",
  interlaced: false,
  hdr: null,
  dolbyVisionProfile: null,
  dolbyVision: null,
  hdr10Plus: false,
  masteringDisplay: false,
  contentLightLevel: null,
}

const HDR_TEST_SOURCE: VideoStream = {
  ...SDR_TEST_SOURCE,
  codec: "hevc",
  profile: "Main 10",
  pixelFormat: "yuv420p10le",
  bitDepth: 10,
  colorTransfer: "smpte2084",
  colorPrimaries: "bt2020",
  colorSpace: "bt2020nc",
  hdr: "hdr10",
}

const HDR_PARAMS =
  "setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc"
const SDR_LAVFI = `testsrc2=s=320x240:r=24:d=1`
const HDR_LAVFI = `${SDR_LAVFI},format=yuv420p10le,${HDR_PARAMS}`
const P010_LAVFI = `${SDR_LAVFI},format=p010le,${HDR_PARAMS}`

/**
 * One encode through the real pipeline from system memory, the path every
 * source takes that the GPU doesn't decode. The capabilities claim only
 * this encoder works, so the pipeline picks it and nothing else.
 */
async function testEncoder(
  acceleration: HardwareDevice,
  codec: TranscodeVideoCodec,
  tenBit: boolean,
  devices: CapabilityDevices,
  base: TranscodingCapabilities,
  hardware: HardwareCapability,
): Promise<CapabilityCheck> {
  const settings: TranscodingSettings = {
    ...transcodingDefaults(),
    ...devices,
    hardwareAcceleration: acceleration,
    enableHardwareEncoding: true,
    hardwareDecodingCodecs: [],
  }
  const trial: TranscodingCapabilities = {
    ...base,
    hardware: [
      {
        ...hardware,
        encoders: [
          {
            codec,
            encoder: hardwareEncoderName(codec, acceleration) ?? codec,
            status: "ok",
            error: null,
            tenBit: tenBit ? "ok" : "missing",
          },
        ],
      },
    ],
  }
  const pipeline = buildVideoPipeline(
    tenBit ? HDR_TEST_SOURCE : SDR_TEST_SOURCE,
    {
      codec,
      bitrate: 2_000_000,
      segmentSeconds: 1,
      startSeconds: 0,
      keepHdr: tenBit,
    },
    settings,
    trial,
  )
  if (pipeline.encoder !== hardwareEncoderName(codec, acceleration)) {
    return failed(`The pipeline chose ${pipeline.encoder}.`)
  }
  return check([
    ...pipeline.inputArgs,
    "-f",
    "lavfi",
    "-i",
    tenBit ? HDR_LAVFI : SDR_LAVFI,
    ...(pipeline.filters.length > 0 ? ["-vf", pipeline.filters.join(",")] : []),
    ...pipeline.outputArgs,
    "-frames:v",
    String(TEST_FRAMES),
    "-f",
    "null",
    "-",
  ])
}

/** Runs a filter chain on HDR10 test frames on the device. */
function testFilters(init: string[], filterDevice: string, filters: string[]) {
  return check([
    ...init,
    "-filter_hw_device",
    filterDevice,
    "-f",
    "lavfi",
    "-i",
    P010_LAVFI,
    "-vf",
    filters.join(","),
    "-frames:v",
    String(TEST_FRAMES),
    "-f",
    "null",
    "-",
  ])
}

const TONEMAP_ARGS = "p=bt709:t=bt709:m=bt709:tonemap=bt2390:peak=100:desat=0"
const VPP_TONEMAP = [
  "procamp_vaapi=b=16",
  "tonemap_vaapi=format=nv12:p=bt709:t=bt709:m=bt709:extra_hw_frames=32",
]

/** The tone mappers of an acceleration, run the way its chain runs them. */
async function testToneMapping(
  acceleration: HardwareDevice,
  init: string[],
  vendor: GpuVendor | null,
  base: TranscodingCapabilities,
) {
  const has = (name: string) => base.filters.includes(name)
  const result = {
    tonemap: missing(),
    vppTonemap: missing(),
    videoToolboxTonemap: missing(),
  }
  const opencl = `tonemap_opencl=format=nv12:${TONEMAP_ARGS}`
  switch (acceleration) {
    case "vaapi": {
      if (base.hwaccels.includes("opencl") && has("tonemap_opencl")) {
        const intel = vendor === "intel-ihd" || vendor === "intel-i965"
        // Intel maps VAAPI frames to OpenCL and back; others go through
        // memory to their own OpenCL device.
        result.tonemap = intel
          ? await testFilters(
              [...init, "-init_hw_device", openclDevice(vendor)],
              "va",
              [
                "hwupload",
                "hwmap=derive_device=opencl:mode=read",
                opencl,
                "hwmap=derive_device=vaapi:mode=write:reverse=1",
                "format=vaapi",
                "hwdownload",
                "format=nv12",
              ],
            )
          : await testFilters(
              [...init, "-init_hw_device", openclDevice(vendor)],
              "ocl",
              ["hwupload", opencl, "hwdownload", "format=nv12"],
            )
      }
      if (
        vendor === "intel-ihd" &&
        has("tonemap_vaapi") &&
        has("procamp_vaapi")
      ) {
        result.vppTonemap = await testFilters(init, "va", [
          "hwupload",
          ...VPP_TONEMAP,
          "hwdownload",
          "format=nv12",
        ])
      }
      return result
    }
    case "qsv":
      if (base.hwaccels.includes("opencl") && has("tonemap_opencl")) {
        result.tonemap = await testFilters(
          [...init, "-init_hw_device", "opencl=ocl@va"],
          "va",
          [
            "hwupload",
            "hwmap=derive_device=opencl:mode=read",
            opencl,
            "hwmap=derive_device=qsv:mode=write:reverse=1:extra_hw_frames=16",
            "format=qsv",
            "hwdownload",
            "format=nv12",
          ],
        )
      }
      if (has("tonemap_vaapi") && has("procamp_vaapi")) {
        result.vppTonemap = await testFilters(init, "va", [
          "hwupload",
          ...VPP_TONEMAP,
          "hwmap=derive_device=qsv",
          "format=qsv",
          "hwdownload",
          "format=nv12",
        ])
      }
      return result
    case "nvenc":
      if (has("tonemap_cuda")) {
        result.tonemap = await testFilters(init, "cu", [
          "hwupload",
          `tonemap_cuda=format=yuv420p:${TONEMAP_ARGS}`,
          "hwdownload",
          "format=yuv420p",
        ])
      }
      return result
    default:
      if (has("tonemap_videotoolbox")) {
        result.tonemap = await testFilters(init, "vt", [
          "hwupload",
          `tonemap_videotoolbox=format=nv12:${TONEMAP_ARGS}`,
          "hwdownload",
          "format=nv12",
        ])
      }
      if (has("scale_vt")) {
        result.videoToolboxTonemap = await testFilters(init, "vt", [
          "hwupload",
          "scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709",
          "hwdownload",
          "format=nv12",
        ])
      }
      return result
  }
}

async function detectHardware(
  acceleration: HardwareDevice,
  devices: CapabilityDevices,
  base: TranscodingCapabilities,
): Promise<HardwareCapability> {
  const entry = missingHardware(acceleration)
  if (!base.hwaccels.includes(HWACCELS.get(acceleration) ?? acceleration))
    return entry
  const path =
    acceleration === "vaapi"
      ? devices.vaapiDevice
      : acceleration === "qsv"
        ? devices.qsvDevice
        : ""
  const opened = await openDevice(acceleration, path)
  entry.device = opened.device
  entry.devicePath =
    acceleration === "nvenc"
      ? "0"
      : acceleration === "videotoolbox"
        ? null
        : path || null
  entry.driver = opened.driver
  if (opened.device.status !== "ok") {
    entry.encoders = entry.encoders.map((encoder) => ({
      ...encoder,
      status: base.encoders.includes(encoder.encoder) ? "failed" : "missing",
      error: base.encoders.includes(encoder.encoder)
        ? "The device didn't open."
        : null,
    }))
    return entry
  }
  entry.vendor =
    acceleration === "nvenc"
      ? "nvidia"
      : acceleration === "videotoolbox"
        ? "apple"
        : vendorOf(opened.driver)

  const encoders: EncoderCheck[] = []
  for (const codec of TRANSCODE_VIDEO_CODECS) {
    const name = hardwareEncoderName(codec, acceleration) ?? codec
    if (!base.encoders.includes(name)) {
      encoders.push({
        codec,
        encoder: name,
        status: "missing",
        error: null,
        tenBit: "missing",
      })
      continue
    }
    const sdr = await testEncoder(
      acceleration,
      codec,
      false,
      devices,
      base,
      entry,
    )
    let tenBit: CheckStatus = "missing"
    if (codec !== "h264" && sdr.status === "ok") {
      tenBit = (
        await testEncoder(acceleration, codec, true, devices, base, entry)
      ).status
    }
    encoders.push({ codec, encoder: name, ...sdr, tenBit })
  }
  entry.encoders = encoders
  const toneMapping = await testToneMapping(
    acceleration,
    initArgs(acceleration, path, entry.vendor),
    entry.vendor,
    base,
  )
  return { ...entry, ...toneMapping }
}
