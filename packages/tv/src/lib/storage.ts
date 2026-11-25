import { type Json, parseJson } from "./decode"

/*
 * What the app keeps on the TV, in localStorage. A TV can refuse it, as
 * when its storage is full, so every read and write may fail quietly: the
 * app then runs on what it has in memory until it closes.
 */

export function readStored(key: string): Json | undefined {
  try {
    return parseJson(window.localStorage.getItem(key))
  } catch {
    return undefined
  }
}

export function writeStored(key: string, value: Json) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is off or full. The value still holds until the app closes.
  }
}

export function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing was stored, then.
  }
}
