import { t } from "@matinee/contracts/schema"

/** Whatever `JSON.parse` returns, before it's checked. */
export type JsonInput = ReturnType<JSON["parse"]>

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue }

const ObjectRecord = t.record(t.string(), t.unknown())

export function isObjectRecord(
  value: JsonInput,
): value is Record<string, JsonValue> {
  return ObjectRecord.safeParse(value).success && !Array.isArray(value)
}

export function isStringValue(value: JsonInput): value is string {
  return t.string().safeParse(value).success
}

export function isFiniteNumberValue(value: JsonInput): value is number {
  return t.number().safeParse(value).success
}
