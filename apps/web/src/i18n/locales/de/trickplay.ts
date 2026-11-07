import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/trickplay"

export default {
  "trickplay.loadFailed":
    "Die Trickplay-Einstellungen konnten nicht geladen werden. {error}",
  "trickplay.checkFields": "Überprüfe die Felder.",
  "trickplay.title": "Trickplay-Bilder",
  "trickplay.description": "Vorschaubilder über der Zeitleiste beim Spulen.",
  "trickplay.descriptionCount": plural({
    one: "Vorschaubilder über der Zeitleiste beim Spulen. {ready} von {count} Video hat sie.",
    other:
      "Vorschaubilder über der Zeitleiste beim Spulen. {ready} von {count} Videos haben sie.",
  }),
  "trickplay.enabled": "Trickplay-Bilder erstellen",
  "trickplay.enabled.description":
    "Beim Scannen und durch eine tägliche Aufgabe erstellt.",
  "trickplay.interval": "Intervall",
  "trickplay.interval.description": "Kürzer braucht mehr Speicherplatz.",
  "trickplay.interval.option": plural({
    one: "Jede {count} Sekunde",
    other: "Alle {count} Sekunden",
  }),
  "trickplay.width": "Breite",
  "trickplay.width.description":
    "Breiter sieht auf großen Bildschirmen schärfer aus.",
  "trickplay.width.option": "{width} px",
  "trickplay.keyframesOnly": "Nur Keyframes",
  "trickplay.keyframesOnly.description":
    "Um ein Vielfaches schneller, aber Vorschaubilder können ein, zwei Sekunden danebenliegen.",
  "trickplay.hardwareDecoding": "Hardware-Dekodierung",
  "trickplay.hardwareDecoding.description":
    "Nutzt {decoder} für die unter Transkodierung aktivierten Codecs.",
  "trickplay.hardwareDecoding.unavailable":
    "Richte zuerst unter Transkodierung eine GPU ein.",
  "trickplay.regenerates":
    "Wenn du Intervall, Breite oder die Keyframe-Einstellung änderst, werden die Bilder aller Videos im Hintergrund neu erstellt.",
} satisfies TranslationOf<typeof source>
