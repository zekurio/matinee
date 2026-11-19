/*
 * Reading values the app didn't make: what it stored on the TV, and what
 * an error from the server carries. The rest of the repository parses
 * such values with the contract's `t` schemas, but TypeBox, which they
 * build on, needs regular expression features the engines of TVs before
 * 2020 lack, so a script with it in doesn't even load there. These do the
 * little the app needs instead.
 */

/** A value as `JSON.parse` gives it. */
export type Json = null | boolean | number | string | Json[] | JsonObject
export type JsonObject = { [key: string]: Json }

/** The value in `text`, or undefined when it isn't JSON. */
export function parseJson(text: string | null): Json | undefined {
  if (text === null) return undefined
  try {
    // SAFETY: JSON.parse returns nothing but the values Json lists.
    return JSON.parse(text) as Json
  } catch {
    return undefined
  }
}

export function isText(value: Json | undefined): value is string {
  return value === String(value)
}

export function isNumber(value: Json | undefined): value is number {
  return value === Number(value)
}

export function isFlag(value: Json | undefined): value is boolean {
  return value === true || value === false
}

export function isList(value: Json | undefined): value is Json[] {
  return Array.isArray(value)
}

export function isRecord(value: Json | undefined): value is JsonObject {
  return (
    value !== null &&
    value !== undefined &&
    !Array.isArray(value) &&
    Object(value) === value
  )
}

/** The text at `key`, or undefined when there's none or it's something else. */
export function textAt(
  value: Json | undefined,
  key: string,
): string | undefined {
  const found = isRecord(value) ? value[key] : undefined
  return isText(found) ? found : undefined
}

export function numberAt(
  value: Json | undefined,
  key: string,
): number | undefined {
  const found = isRecord(value) ? value[key] : undefined
  return isNumber(found) ? found : undefined
}

export function flagAt(
  value: Json | undefined,
  key: string,
): boolean | undefined {
  const found = isRecord(value) ? value[key] : undefined
  return isFlag(found) ? found : undefined
}

/** `value` when it's one of `choices`, else `fallback`. */
export function oneOf<Choice extends string>(
  choices: readonly Choice[],
  value: Json | undefined,
  fallback: Choice,
): Choice {
  return choices.find((choice) => choice === value) ?? fallback
}
