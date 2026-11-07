import {
  TranscodingSettings,
  type TranscodingSettingsInput,
} from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"

/*
 * How the server transcodes, as an admin set it in the app. Jellyfin's
 * defaults, with the acceleration and its devices from MATINEE_* variables;
 * a saved field wins, and an empty device field falls back to the
 * environment again. Settings load once and change only through
 * `saveTranscoding`, so a transcode reads them for free.
 */

const KEY = "transcoding"

const DEVICE_FIELDS = ["vaapiDevice", "qsvDevice"] as const

const SavedTranscoding = TranscodingSettings.partial()
type Saved = Partial<TranscodingSettings>

let saved: Saved | null = null
let loading: Promise<Saved> | null = null

/** Jellyfin's EncodingOptions defaults, and what an empty device means. */
export function transcodingDefaults(): TranscodingSettings {
  return {
    hardwareAcceleration: env.MATINEE_HARDWARE_ACCELERATION,
    vaapiDevice: env.MATINEE_VAAPI_DEVICE,
    qsvDevice: env.MATINEE_QSV_DEVICE,
    enableHardwareEncoding: true,
    enableIntelLowPowerH264HwEncoder: false,
    enableIntelLowPowerHevcHwEncoder: false,
    hardwareDecodingCodecs: ["h264", "vc1"],
    enableDecodingColorDepth10Hevc: true,
    enableDecodingColorDepth10Vp9: true,
    enableDecodingColorDepth10HevcRext: false,
    enableDecodingColorDepth12HevcRext: false,
    allowHevcEncoding: false,
    allowAv1Encoding: false,
    encoderPreset: "auto",
    h264Crf: 23,
    hevcCrf: 28,
    enableTonemapping: false,
    enableVppTonemapping: false,
    enableVideoToolboxTonemapping: false,
    tonemappingAlgorithm: "bt2390",
    tonemappingMode: "auto",
    tonemappingRange: "auto",
    tonemappingDesat: 0,
    tonemappingPeak: 100,
    tonemappingParam: 0,
    vppTonemappingBrightness: 16,
    vppTonemappingContrast: 1,
    deinterlaceMethod: "yadif",
    deinterlaceDoubleRate: false,
    downMixStereoAlgorithm: "none",
    downMixAudioBoost: 2,
    enableAudioVbr: false,
    enableThrottling: false,
    throttleDelaySeconds: 180,
    enableSegmentDeletion: false,
    segmentKeepSeconds: 720,
  }
}

async function load(): Promise<Saved> {
  if (saved) return saved
  loading ??= readSaved().finally(() => {
    loading = null
  })
  return loading
}

async function readSaved(): Promise<Saved> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  const parsed = SavedTranscoding.safeParse(row?.value ?? {})
  if (!parsed.success) {
    log.warn(
      "Ignoring saved transcoding settings that no longer validate",
      parsed.error,
    )
  }
  saved = parsed.success ? parsed.data : {}
  return saved
}

/** The settings in use: saved values over the defaults. */
export async function transcodingSettings(): Promise<TranscodingSettings> {
  return { ...transcodingDefaults(), ...(await load()) }
}

/** Everything saves but an empty device field, which drops the saved one. */
function nextSaved(input: TranscodingSettingsInput): Saved {
  const next: Saved = { ...input }
  for (const key of DEVICE_FIELDS) {
    if (!input[key]) delete next[key]
  }
  return next
}

export async function saveTranscoding(
  input: TranscodingSettingsInput,
): Promise<TranscodingSettings> {
  const next = nextSaved(input)
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
  saved = next
  return { ...transcodingDefaults(), ...next }
}
