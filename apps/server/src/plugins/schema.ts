import { t, type SchemaBoundaryInput } from "@matinee/contracts/schema"
import type { PluginStorageRow } from "@matinee/db"

const Scalar = t.union([t.string(), t.number(), t.boolean()]).nullable()
const ArrayValue = t.array(t.unknown())
const ObjectValue = t.record(t.string(), t.unknown())
function isJson(value: SchemaBoundaryInput, depth = 0): boolean {
  if (depth > 64) return false
  if (Scalar.safeParse(value).success) return true
  const array = ArrayValue.safeParse(value)
  if (array.success) return array.data.every((item) => isJson(item, depth + 1))
  const object = ObjectValue.safeParse(value)
  return (
    object.success &&
    Object.values(object.data).every((item) => isJson(item, depth + 1))
  )
}
export const Json = t.custom<PluginStorageRow["value"]>((value) =>
  isJson(value),
)
