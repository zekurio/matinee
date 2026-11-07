import { t } from "@matinee/contracts/schema"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { activateLocale, browserLocale, LOCALES } from "@/i18n"

const LANGUAGE_KEY = "matinee.language"

/** Follow the browser's languages rather than one picked here. */
export const AUTO_LANGUAGE = "auto"

const LanguageChoice = t.object({ language: t.string().max(35) })

type LanguageState = {
  /** A tag from `LOCALES`, or `auto`. */
  language: string
  setLanguage: (language: string) => void
}

/**
 * The interface language this device picked. It stays with the device,
 * like the color scheme, so a shared screen can speak another language.
 */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: AUTO_LANGUAGE,
      setLanguage: (language) => {
        set({ language })
        void applyLanguage()
      },
    }),
    {
      name: LANGUAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ language }) => ({ language }),
      merge: (stored, current) => {
        const parsed = LanguageChoice.safeParse(stored)
        return {
          ...current,
          language: parsed.success ? parsed.data.language : AUTO_LANGUAGE,
        }
      },
    },
  ),
)

/** The language the interface shows for this device's choice. */
export function chosenLocale(): string {
  const { language } = useLanguageStore.getState()
  // A language that has since gone away falls back to the browser's.
  return LOCALES.includes(language) ? language : browserLocale()
}

/** Switches the interface to this device's choice. */
export function applyLanguage(): Promise<void> {
  return activateLocale(chosenLocale())
}

// A change made in another tab applies here too.
window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== LANGUAGE_KEY) return
  void Promise.resolve(useLanguageStore.persist.rehydrate()).then(applyLanguage)
})

// As does a change to the browser's own languages.
window.addEventListener("languagechange", () => void applyLanguage())
