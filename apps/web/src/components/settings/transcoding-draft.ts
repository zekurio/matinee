import {
  type AdminTranscodingSettings,
  TranscodingSettings,
} from "@matinee/contracts"

import { type MessageKey, tr, translateKnown } from "@/i18n"

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
  return TranscodingSettings.safeParse({
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

/** The fields a rejected save can name, by their path in the input. */
const FIELD_NAMES = new Map<string, MessageKey>([
  ["vaapiDevice", "transcoding.field.vaapiDevice"],
  ["qsvDevice", "transcoding.field.qsvDevice"],
  ...NUMBER_FIELDS.map((key): [string, MessageKey] => [
    key,
    `transcoding.field.${key}`,
  ]),
])

/** Why `inputFrom` rejected the draft, naming the field to check. */
export function inputError(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
): Error {
  const field = FIELD_NAMES.get(String(issue?.path[0] ?? ""))
  const check = field
    ? tr("transcoding.checkField", { field: tr(field) })
    : tr("transcoding.checkFields")
  return new Error(
    issue
      ? tr("transcoding.checkFieldIssue", {
          check,
          issue: translateKnown(issue.message),
        })
      : check,
  )
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A number field's row: its name, and what it says under the name. */
export function numberRow(key: NumberField) {
  return {
    title: tr(`transcoding.field.${key}`),
    description: tr(`transcoding.number.${key}`),
  }
}
