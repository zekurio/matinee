import type { TranslationOf } from "../../catalog"
import type source from "../en/serverAppearance"

export default {
  "serverAppearance.loadFailed":
    "Die Akzentfarbe konnte nicht geladen werden. {error}",
  "serverAppearance.title": "Akzentfarbe",
  "serverAppearance.description":
    "Wird vom Matinee-Design für alle auf diesem Server verwendet.",
  "serverAppearance.presets": "Vorgeschlagene Akzentfarben",
  "serverAppearance.default": "Standard",
  "serverAppearance.mode.light": "Heller Modus",
  "serverAppearance.mode.dark": "Dunkler Modus",
  "serverAppearance.accent.light": "Akzentfarbe im hellen Modus",
  "serverAppearance.accent.dark": "Akzentfarbe im dunklen Modus",
} satisfies TranslationOf<typeof source>
