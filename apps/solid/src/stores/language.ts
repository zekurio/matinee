import { t } from "@matinee/contracts/schema"
import { createEffect, createRoot } from "solid-js"

import { activateLocale, browserLocale, LOCALES } from "@/i18n"
import { persisted } from "@/lib/persisted"

const LANGUAGE_KEY = "matinee.language"

/** Follow the browser's languages rather than one picked here. */
export const AUTO_LANGUAGE = "auto"

// The React app's store wrote `{ state: { language }, version }`, and the
// inline script in `index.html` reads that shape to preload the language.
const Stored = t.object({
  state: t.object({ language: t.string().max(35) }),
  version: t.number().optional(),
})

const [stored, setStored] = persisted(LANGUAGE_KEY, Stored, {
  state: { language: AUTO_LANGUAGE },
  version: 0,
})

/**
 * The interface language this device picked: a tag from `LOCALES`, or
 * `auto`. It stays with the device, like the color scheme, so a shared
 * screen can speak another language.
 */
export const language = () => stored().state.language

export function setLanguage(next: string) {
  setStored({ state: { language: next }, version: 0 })
}

/** The language the interface shows for this device's choice. */
function chosenLocale(): string {
  const picked = language()
  // A language that has since gone away falls back to the browser's.
  return LOCALES.includes(picked) ? picked : browserLocale()
}

/** Switches the interface to this device's choice. */
export function applyLanguage(): Promise<void> {
  return activateLocale(chosenLocale())
}

// A choice made here or in another tab applies as it changes.
createRoot(() => {
  createEffect(language, () => void applyLanguage(), { defer: true })
})

// As does a change to the browser's own languages.
window.addEventListener("languagechange", () => void applyLanguage())
