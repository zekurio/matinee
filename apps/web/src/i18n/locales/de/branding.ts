import type { TranslationOf } from "../../catalog"
import type source from "../en/branding"

export default {
  "branding.loadFailed":
    "Die Branding-Einstellungen konnten nicht geladen werden. {error}",
  "branding.title": "Akzentfarbe",
  "branding.presets": "Vorgeschlagene Akzentfarben",
  "branding.default": "Standard",
  "branding.mode.light": "Heller Modus",
  "branding.mode.dark": "Dunkler Modus",
  "branding.accent.light": "Akzentfarbe im hellen Modus",
  "branding.accent.dark": "Akzentfarbe im dunklen Modus",
  "branding.backdrop.title": "Anmeldeseite",
  "branding.backdrop.enabled": "Artwork hinter dem Formular zeigen",
  "branding.backdrop.source":
    "Zeigt Titel aus den Mediatheken, die die Gruppe Alle öffnet.",
  "branding.backdrop.artwork": "Artwork",
  "branding.backdrop.artwork.mixed": "Poster und Szenenbilder",
  "branding.backdrop.artwork.posters": "Poster",
  "branding.backdrop.artwork.thumbs": "Szenenbilder",
  "branding.backdrop.blur": "Unschärfe",
  "branding.backdrop.blurValue": "{value} px",
  "branding.backdrop.fade": "Ausblenden",
  "branding.backdrop.fadeValue": "{value} %",
  "branding.backdrop.preview": "Vorschau",
  "branding.backdrop.shuffle": "Neu mischen",
  "branding.backdrop.previewOff": "Die Anmeldeseite zeigt kein Artwork.",
  "branding.backdrop.empty":
    "Noch kein Artwork zum Zeigen. Die Mediatheken, die die Gruppe Alle öffnet, haben keine Titel mit Bildern, die der Server schon heruntergeladen hat.",
} satisfies TranslationOf<typeof source>
