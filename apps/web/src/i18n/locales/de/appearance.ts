import type { TranslationOf } from "../../catalog"
import type source from "../en/appearance"

export default {
  "appearance.language": "Sprache",
  "appearance.language.title": "Sprache der Oberfläche",
  "appearance.language.auto": "Wie dieser Browser ({language})",
  "appearance.colorScheme": "Farbschema",
  "appearance.colorScheme.system": "System",
  "appearance.colorScheme.light": "Hell",
  "appearance.colorScheme.dark": "Dunkel",
  "appearance.tvMode": "TV-Modus",
  "appearance.tvMode.title": "TV-Ansicht verwenden",
  "appearance.tvMode.hint":
    "Dieser Browser öffnet Matinee in der TV-Ansicht, mit großen Zeilen und Gamepad oder Fernbedienung, statt der Desktop-App. Derselbe Schalter steht in den Einstellungen der TV-Ansicht.",
} satisfies TranslationOf<typeof source>
