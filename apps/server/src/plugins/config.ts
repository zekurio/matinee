import type {
  PluginConfigField,
  PluginConfigValue,
  PluginConfigValues,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { PluginRow } from "@matinee/db"
import { ORPCError } from "@orpc/server"

export function resolveConfig(
  fields: PluginConfigField[],
  row?: PluginRow,
  environment?: Record<
    string,
    { value: string | number | boolean | undefined }
  >,
): PluginConfigValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      (field.type === "secret"
        ? row?.secrets[field.key]
        : row?.config[field.key]) ??
        environment?.[field.key]?.value ??
        field.default ??
        null,
    ]),
  )
}
export function missingConfig(
  fields: PluginConfigField[],
  values: PluginConfigValues,
): boolean {
  return fields.some(
    (field) =>
      field.required && (values[field.key] == null || values[field.key] === ""),
  )
}
/**
 * The keys of the saved values that the fields no longer take. An update
 * can narrow a field: a lower maximum, one option fewer, another type.
 * A value saved under the old manifest then has to be looked at again
 * before the plugin runs with it.
 */
export function invalidConfig(
  fields: PluginConfigField[],
  values: PluginConfigValues,
): string[] {
  return fields
    .filter((field) => !validValue(field, values[field.key] ?? null))
    .map((field) => field.key)
}
export function validateValue(
  field: PluginConfigField,
  value: PluginConfigValue,
): void {
  if (!validValue(field, value))
    throw new ORPCError("BAD_REQUEST", {
      message: `Check the value for ${field.label} (${field.key}).`,
    })
}
function validValue(
  field: PluginConfigField,
  value: PluginConfigValue,
): boolean {
  if (value === null) return true
  let valid = false
  if (field.type === "boolean") valid = t.boolean().safeParse(value).success
  else if (field.type === "number") {
    const number = t.number().safeParse(value)
    valid =
      number.success &&
      (field.min === undefined || number.data >= field.min) &&
      (field.max === undefined || number.data <= field.max)
  } else {
    const text = t.string().max(10000).safeParse(value)
    if (text.success) {
      valid = true
      if (field.type === "select")
        valid = field.options.some((option) => option.value === text.data)
      if (field.type === "url") {
        try {
          const url = new URL(text.data)
          valid =
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
        } catch {
          valid = false
        }
      }
    }
  }
  return valid
}
