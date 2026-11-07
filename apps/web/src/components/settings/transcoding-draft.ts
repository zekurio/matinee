import {
  type AdminTranscodingSettings,
  type TranscodingSettings,
  TranscodingSettingsInput,
} from "@matinee/contracts"

import { typeOnly } from "./setting-controls"

const NUMBER_FIELDS = [
  "h264Crf",
  "hevcCrf",
  "tonemappingDesat",
  "tonemappingPeak",
  "tonemappingParam",
  "vppTonemappingBrightness",
  "vppTonemappingContrast",
  "downMixAudioBoost",
  "throttleDelaySeconds",
  "segmentKeepSeconds",
] as const
export type NumberField = (typeof NUMBER_FIELDS)[number]

/** What each number field's row says under its name. */
const NUMBER_DESCRIPTIONS = {
  h264Crf: "0 to 51, lower is better. Software encoding only.",
  hevcCrf: "0 to 51, lower is better.",
  tonemappingDesat: "0 turns it off, as recommended.",
  tonemappingPeak: "When metadata is missing. 100 is 1000 nits.",
  tonemappingParam: "Leave at 0.",
  vppTonemappingBrightness: "0 to 100. 16 is recommended.",
  vppTonemappingContrast: "1 to 2. 1 is recommended.",
  downMixAudioBoost: "0.5 to 3. Downmixed surround is quiet; 1 leaves it.",
  throttleDelaySeconds: "Seconds ahead before pausing.",
  segmentKeepSeconds: "Seconds, for seeking back.",
} satisfies Record<NumberField, string>

/**
 * The form. Numbers stay text while typed; device fields hold only a saved
 * value, and an empty one falls back to the environment's placeholder.
 */
export type Draft = Omit<TranscodingSettings, NumberField> &
  Record<NumberField, string>

/** `withForm`'s options for a section of the form. */
export const draftForm = { defaultValues: typeOnly<Draft>() }

export function draftFrom({
  settings,
  defaults,
}: AdminTranscodingSettings): Draft {
  return {
    ...settings,
    vaapiDevice:
      settings.vaapiDevice === defaults.vaapiDevice ? "" : settings.vaapiDevice,
    qsvDevice:
      settings.qsvDevice === defaults.qsvDevice ? "" : settings.qsvDevice,
    h264Crf: String(settings.h264Crf),
    hevcCrf: String(settings.hevcCrf),
    tonemappingDesat: String(settings.tonemappingDesat),
    tonemappingPeak: String(settings.tonemappingPeak),
    tonemappingParam: String(settings.tonemappingParam),
    vppTonemappingBrightness: String(settings.vppTonemappingBrightness),
    vppTonemappingContrast: String(settings.vppTonemappingContrast),
    downMixAudioBoost: String(settings.downMixAudioBoost),
    throttleDelaySeconds: String(settings.throttleDelaySeconds),
    segmentKeepSeconds: String(settings.segmentKeepSeconds),
  }
}

/** The save, checked by the contract's schema before it's sent. */
export function inputFrom(draft: Draft) {
  const number = (value: string) =>
    value.trim() === "" ? Number.NaN : Number(value)
  return TranscodingSettingsInput.safeParse({
    ...draft,
    vaapiDevice: draft.vaapiDevice.trim(),
    qsvDevice: draft.qsvDevice.trim(),
    h264Crf: number(draft.h264Crf),
    hevcCrf: number(draft.hevcCrf),
    tonemappingDesat: number(draft.tonemappingDesat),
    tonemappingPeak: number(draft.tonemappingPeak),
    tonemappingParam: number(draft.tonemappingParam),
    vppTonemappingBrightness: number(draft.vppTonemappingBrightness),
    vppTonemappingContrast: number(draft.vppTonemappingContrast),
    downMixAudioBoost: number(draft.downMixAudioBoost),
    throttleDelaySeconds: number(draft.throttleDelaySeconds),
    segmentKeepSeconds: number(draft.segmentKeepSeconds),
  })
}

const FIELD_NAMES = new Map<string, string>([
  ["vaapiDevice", "VAAPI device"],
  ["qsvDevice", "QSV device"],
  ["h264Crf", "H.264 CRF"],
  ["hevcCrf", "HEVC CRF"],
  ["tonemappingDesat", "Desaturation"],
  ["tonemappingPeak", "Peak"],
  ["tonemappingParam", "Parameter"],
  ["vppTonemappingBrightness", "VPP brightness"],
  ["vppTonemappingContrast", "VPP contrast"],
  ["downMixAudioBoost", "Downmix boost"],
  ["throttleDelaySeconds", "Throttle after"],
  ["segmentKeepSeconds", "Keep segments for"],
])

/** Why `inputFrom` rejected the draft, naming the field to check. */
export function inputError(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
): Error {
  const field = FIELD_NAMES.get(String(issue?.path[0] ?? ""))
  const check = field ? `Check ${field}.` : "Check the fields."
  return new Error(issue ? `${check} ${issue.message}` : check)
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A number field's row: its name and description. */
export function numberRow(key: NumberField) {
  return {
    title: FIELD_NAMES.get(key) ?? key,
    description: NUMBER_DESCRIPTIONS[key],
  }
}
