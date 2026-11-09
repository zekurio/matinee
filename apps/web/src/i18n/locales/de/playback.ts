import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/playback"

export default {
  "playback.languages.title": "Sprachen",
  "playback.languages.description": "Wird mit deinem Konto synchronisiert.",
  "playback.audio.title": "Audio",
  "playback.audio.description": "Sonst die Standardspur der Datei.",
  "playback.audio.fileDefault": "Standard der Datei",
  "playback.audio.original": "Originalsprache",
  "playback.subtitles.title": "Untertitel",
  "playback.subtitles.mode.default.label": "Wie in der Datei",
  "playback.subtitles.mode.default.description": "Die Standardspur der Datei.",
  "playback.subtitles.mode.always.label": "Immer",
  "playback.subtitles.mode.always.description": "Vollständige Untertitel.",
  "playback.subtitles.mode.foreign.label": "Bei fremdsprachigem Audio",
  "playback.subtitles.mode.foreign.description":
    "Vollständige Untertitel, wenn das Audio in einer anderen Sprache ist.",
  "playback.subtitles.mode.forced.label": "Nur erzwungene",
  "playback.subtitles.mode.forced.description":
    "Nur Schilder und fremdsprachige Dialoge.",
  "playback.subtitles.mode.off.label": "Aus",
  "playback.subtitles.mode.off.description":
    "Bis du im Player eine Spur auswählst.",
  "playback.subtitles.language": "Untertitelsprache",
  "playback.subtitles.deviceLanguage": "Sprache dieses Geräts ({language})",
  "playback.subtitles.remember": "Meine Auswahl merken",
  "playback.subtitles.remember.description":
    "Untertitel, die du im Player auswählst, gelten auch für das nächste Video.",

  "playback.device.title": "Dieses Gerät",
  "playback.device.description": "Nur in diesem Browser gespeichert.",
  "playback.quality.title": "Qualität",
  "playback.quality.description": "In welcher Qualität Videos starten.",
  "playback.quality.preset": "{height}p, {bitrate}",
  "playback.quality.original": "Original",
  "playback.videoCodec.title": "Videocodec",
  "playback.videoCodec.description":
    "Für Transkodierungen. AV1 und HEVC sehen besser aus, belasten den Server aber stärker.",
  "playback.videoCodec.only":
    "Der einzige Codec, den dieser Browser und der Server gemeinsam haben.",
  "playback.audioCodec.title": "Audiocodec",
  "playback.audioCodec.description":
    "Stereo, für Audio, das dieser Browser nicht abspielen kann.",
  "playback.codec.automatic": "Automatisch ({codec})",
  "playback.skip.title": "Springen um",
  "playback.skip.description":
    "Die Sprungtasten, die Pfeiltasten sowie J und L.",
  "playback.skip.seconds": plural({
    one: "{count} Sekunde",
    other: "{count} Sekunden",
  }),
  "playback.autoplay.title": "Nächste Folge abspielen",
  "playback.autoplay.description": "Startet nach einem kurzen Countdown.",

  "playback.passthrough.title": "Audio-Passthrough",
  "playback.passthrough.description":
    "Formate, die dieser Browser direkt abspielt. Schalte eines aus, damit der Server es umwandelt.",
  "playback.passthrough.ac3": "Dolby Digital Surround.",
  "playback.passthrough.eac3": "Dolby Digital Plus, einschließlich Atmos.",
  "playback.passthrough.flac": "Verlustfrei. Braucht deutlich mehr Bandbreite.",
  "playback.passthrough.alac":
    "Apple Lossless. Braucht deutlich mehr Bandbreite.",
} satisfies TranslationOf<typeof source>
