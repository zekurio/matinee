import type {
  CapabilityCheck,
  HardwareAcceleration,
  HardwareCapability,
  TranscodingCapabilities,
} from "@matinee/contracts"
import { useSelector } from "@tanstack/react-form"
import type { ReactNode } from "react"

import { useFieldContext, withForm } from "@/lib/form"

import { InputField, SwitchField, typeOnly } from "./setting-controls"
import { draftForm, type NumberField, numberRow } from "./transcoding-draft"

export const ACCELERATION_LABELS = new Map<HardwareAcceleration, string>([
  ["none", "None (software)"],
  ["vaapi", "VAAPI (Intel, AMD)"],
  ["qsv", "Intel Quick Sync"],
  ["nvenc", "NVIDIA NVENC"],
  ["videotoolbox", "Apple VideoToolbox"],
])

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

/** A check's reason under its switch when it didn't run here. */
export function checkNote(
  check: CapabilityCheck | undefined,
  text: string,
): ReactNode {
  if (!check || check.status === "ok") return text
  const reason =
    check.status === "missing"
      ? "This ffmpeg build or GPU doesn't have it."
      : `It failed on this server: ${firstLine(check)}`
  return (
    <>
      {text} <span className="text-destructive">{reason}</span>
    </>
  )
}

/**
 * A switch for something this server may lack, bound to its form field.
 * Without it the switch can only be turned off, and `unavailable` replaces
 * the description.
 */
export function CapabilitySwitchField({
  description,
  unavailable,
  available,
  ...row
}: {
  title: string
  description?: ReactNode
  unavailable?: string
  available: boolean
}) {
  const field = useFieldContext<boolean>()
  const checked = useSelector(field.store, (state) => state.value)
  return (
    <SwitchField
      {...row}
      description={available ? description : (unavailable ?? description)}
      disabled={!available && !checked}
    />
  )
}

/** The number fields' rows in order, each named and described by its field. */
export const NumberRows = withForm({
  ...draftForm,
  props: typeOnly<{ fields: readonly NumberField[] }>(),
  render: function Render({ form, fields }) {
    return fields.map((key) => (
      <form.AppField key={key} name={key}>
        {() => <InputField inputMode="decimal" {...numberRow(key)} />}
      </form.AppField>
    ))
  },
})
