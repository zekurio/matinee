import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/people"

export default {
  "people.credit.creator": plural({ one: "Idee", other: "Idee" }),
  "people.credit.director": plural({ one: "Regie", other: "Regie" }),
  "people.credit.writer": plural({ one: "Drehbuch", other: "Drehbuch" }),
  "people.credit.actor": plural({ one: "Schauspiel", other: "Besetzung" }),
  "people.studio": plural({ one: "Studio", other: "Studios" }),
  "people.more": plural({ one: "{count} weitere", other: "{count} weitere" }),
  "people.cast": "Besetzung",
  "people.loadError": "{name} konnte nicht geladen werden",
  "people.backHome": "Zurück zur Startseite",
  "people.titleCount": plural({ one: "{count} Titel", other: "{count} Titel" }),
  "people.section.actor": "Schauspiel",
  "people.section.creator": "Idee",
  "people.section.director": "Regie",
  "people.section.writer": "Drehbuch",
} satisfies TranslationOf<typeof source>
