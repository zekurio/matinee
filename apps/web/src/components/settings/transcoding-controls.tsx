import type {
  CapabilityCheck,
  HardwareAcceleration,
  HardwareCapability,
  TranscodingCapabilities,
} from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { For, Show } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import type { Form } from "@/lib/form"

import { type FieldName, InputField, SwitchField } from "./setting-controls"
import { SettingNote } from "./settings-panel"
import { type Draft, type NumberField, numberRow } from "./transcoding-draft"

/** "Intel Quick Sync", "None (software)". */
export function accelerationLabel(acceleration: HardwareAcceleration): string {
  return tr(`transcoding.acceleration.${acceleration}`)
}

export const label = (labels: Map<string, string>, value: string) =>
  labels.get(value) ?? value

/** The first line of what ffmpeg said, for a reason under a disabled option. */
export function firstLine(check: CapabilityCheck): string | null {
  return check.error?.split("\n").find(Boolean) ?? null
}

/** Whether this ffmpeg build has the acceleration at all. */
export function accelerationAvailable(
  capabilities: TranscodingCapabilities,
  acceleration: HardwareAcceleration,
): boolean {
  if (acceleration === "none") return true
  const hardware = hardwareOf(capabilities, acceleration)
  return hardware !== null && hardware.device.status !== "missing"
}

export function hardwareOf(
  capabilities: TranscodingCapabilities,
  acceleration: HardwareAcceleration,
): HardwareCapability | null {
  return (
    capabilities.hardware.find(
      (entry) => entry.acceleration === acceleration,
    ) ?? null
  )
}

/** Why a check didn't run here, for under its switch; nothing when it did. */
export function checkNote(
  check: CapabilityCheck | undefined,
): JSX.Element | undefined {
  if (!check || check.status === "ok") return undefined
  const detail = firstLine(check)
  return (
    <span class="text-destructive">
      {check.status === "missing"
        ? tr("transcoding.check.missing")
        : detail
          ? tr("transcoding.check.failed", { error: translateKnown(detail) })
          : tr("transcoding.check.failedPlain")}
    </span>
  )
}

/**
 * A switch for something this server may lack, bound to its form field.
 * Without it the switch can only be turned off, and `unavailable` says why
 * under it.
 */
export function CapabilitySwitchField<Values extends object>(props: {
  form: Form<Values>
  name: FieldName<Values, boolean>
  title: string
  unavailable?: JSX.Element
  available: boolean
}) {
  const checked = () => props.form.values()[props.name] === true
  return (
    <SwitchField
      form={props.form}
      name={props.name}
      title={props.title}
      disabled={!props.available && !checked()}
      footer={
        <Show when={!props.available && props.unavailable}>
          <SettingNote>{props.unavailable}</SettingNote>
        </Show>
      }
    />
  )
}

/** The number fields' rows in order, each named by its field. */
export function NumberRows(props: {
  form: Form<Draft>
  fields: readonly NumberField[]
}) {
  return (
    <For each={props.fields}>
      {(key) => (
        <InputField
          form={props.form}
          name={key}
          inputmode="decimal"
          title={numberRow(key).title}
        />
      )}
    </For>
  )
}
