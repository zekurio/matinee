import type { TranslationOf } from "../../catalog"
import type source from "../en/metadata"

export default {
  "metadata.status.continuing": "Fortlaufend",
  "metadata.status.ended": "Beendet",
  "metadata.status.unreleased": "Noch nicht veröffentlicht",
} satisfies TranslationOf<typeof source>
