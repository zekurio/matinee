import { isDeepStrictEqual } from "node:util"

import { log } from "./log"

/*
 * Admin settings store only what an admin changed, as in alloy. Each
 * MATINEE_* variable is a default: a saved field wins, and a field saved
 * with the default's value is no override, so a later change to the
 * variable still applies.
 */

/** The fields of `value` that differ from `defaults`. */
export function overridesOf<T extends object>(
  value: Partial<T>,
  defaults: T,
): Partial<T> {
  const overrides: Partial<T> = {}
  for (const key in value) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) continue
    if (!isDeepStrictEqual(value[key], defaults[key])) {
      overrides[key] = value[key]
    }
  }
  return overrides
}

/**
 * Log each variable the operator set that a saved field overrides, so a
 * change to it that does nothing doesn't go unexplained.
 */
export function logOverridden<T extends object>(
  saved: Partial<T>,
  variables: ReadonlyMap<keyof T, string>,
): void {
  for (const [field, name] of variables) {
    if (saved[field] !== undefined && variableSet(name)) {
      log.info(
        `${name} is set, but a value saved in the admin settings overrides it.`,
      )
    }
  }
}

/** Whether the environment sets the variable, directly or through a file. */
export function variableSet(name: string): boolean {
  return Boolean(process.env[name] || process.env[`${name}_FILE`])
}
