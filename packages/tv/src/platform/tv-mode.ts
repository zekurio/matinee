/*
 * TV mode: Matinee's TV UI in a browser on a couch PC, rather than on a
 * Samsung TV. The desktop app's account menu and its Appearance settings
 * turn it on; the TV UI's own settings turn it off again. Both documents
 * run on one origin, so they share this key in `localStorage`.
 */

/** The key both documents read TV mode from, as `true` or `false`. */
export const TV_MODE_STORAGE_KEY = "matinee.tvMode"

/** Whether this browser opens Matinee on the TV UI. */
export function isTvMode(): boolean {
  try {
    return window.localStorage.getItem(TV_MODE_STORAGE_KEY) === "true"
  } catch {
    // Storage that's blocked: the browser starts on the desktop app.
    return false
  }
}

/** Turns TV mode on or off for this browser. */
export function setTvMode(on: boolean): void {
  try {
    window.localStorage.setItem(TV_MODE_STORAGE_KEY, on ? "true" : "false")
  } catch {
    // Storage that's full or blocked: the choice lasts for this visit.
  }
}
