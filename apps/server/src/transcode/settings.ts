import { isDeepStrictEqual } from "node:util"

import {
  type TranscodingEnvironmentField,
  TranscodingSettings,
  type TranscodingSettingsInput,
} from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { logOverridden, overridesOf, variableSet } from "../overrides"

/*
 * How the server transcodes, as an admin set it in the app. Jellyfin's
 * defaults, with the acceleration and its devices from MATINEE_* variables.
 * Only fields that differ from those are saved, and an empty device field
 * falls back to the environment again. Settings load once and change only
 * through `saveTranscoding`, so a transcode reads them for free.
 */

const KEY = "transcoding"

const DEVICE_FIELDS = ["vaapiDevice", "qsvDevice"] as const

/** The fields a MATINEE_* variable gives a default for. */
const VARIABLES = new Map<TranscodingEnvironmentField, string>([
  ["hardwareAcceleration", "MATINEE_HARDWARE_ACCELERATION"],
  ["vaapiDevice", "MATINEE_VAAPI_DEVICE"],
  ["qsvDevice", "MATINEE_QSV_DEVICE"],
])

const SavedTranscoding = TranscodingSettings.partial()
type Saved = Partial<TranscodingSettings>

let saved: Saved | null = null
let loading: Promise<Saved> | null = null

/** Jellyfin's EncodingOptions defaults, and what an empty device means. */
export function transcodingDefaults(): TranscodingSettings {
  return {
    hardwareAcceleration: env.MATINEE_HARDWARE_ACCELERATION ?? "none",
    vaapiDevice: env.MATINEE_VAAPI_DEVICE ?? "/dev/dri/renderD128",
    qsvDevice: env.MATINEE_QSV_DEVICE ?? "",
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

/** The fields the environment sets. */
export function transcodingFromEnvironment(): TranscodingEnvironmentField[] {
  return [...VARIABLES]
    .filter(([, name]) => variableSet(name))
    .map(([field]) => field)
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
  const stored = parsed.success ? parsed.data : {}
  // Older servers saved the whole form, and a default may have changed to
  // a saved value since. Neither is an override.
  const overrides = overridesOf(stored, transcodingDefaults())
  if (row && !isDeepStrictEqual(overrides, stored)) await write(overrides)
  logOverridden(overrides, VARIABLES)
  saved = overrides
  return saved
}

/** The settings in use: saved values over the defaults. */
export async function transcodingSettings(): Promise<TranscodingSettings> {
  return { ...transcodingDefaults(), ...(await load()) }
}

/**
 * What differs from the defaults saves. An empty device field drops the
 * saved one, so the environment's applies.
 */
function nextSaved(input: TranscodingSettingsInput): Saved {
  const next: Saved = { ...input }
  for (const key of DEVICE_FIELDS) {
    if (!input[key]) delete next[key]
  }
  return overridesOf(next, transcodingDefaults())
}

/** Store the overrides; with none left, the row goes. */
async function write(next: Saved): Promise<void> {
  if (Object.keys(next).length === 0) {
    await db.delete(setting).where(eq(setting.key, KEY))
    return
  }
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
}

export async function saveTranscoding(
  input: TranscodingSettingsInput,
): Promise<TranscodingSettings> {
  const next = nextSaved(input)
  await write(next)
  saved = next
  return { ...transcodingDefaults(), ...next }
}
