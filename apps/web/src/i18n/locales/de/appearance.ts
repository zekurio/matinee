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
} satisfies TranslationOf<typeof source>
