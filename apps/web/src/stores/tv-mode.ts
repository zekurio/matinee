import { t } from "@matinee/contracts/schema"
import { TV_MODE_STORAGE_KEY } from "@matinee/tv/tv-mode"

import { persisted } from "@/lib/persisted"

const [stored, setStored] = persisted(TV_MODE_STORAGE_KEY, t.boolean(), false)

/**
 * Whether this browser opens Matinee on the TV UI, for a computer on the
 * sofa. The TV document reads the same key from `localStorage`, so turning
 * it off there turns it off here too.
 */
export const tvMode = stored

/**
 * Remembers TV mode and opens the TV UI. It's a document of its own, so
 * the browser loads it in place of this one; fullscreen waits for the
 * first key or click, since a page can't ask for it while it loads.
 */
export function enterTvMode() {
  setStored(true)
  window.location.assign("/tv/")
}

/** Turns TV mode off, staying on the desktop page that's open. */
export function leaveTvMode() {
  setStored(false)
}
