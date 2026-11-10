import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/playback"

export default {
  "playback.languages.title": "Sprachen",
  "playback.audio.title": "Audio",
  "playback.audio.fileDefault": "Standard der Datei",
  "playback.audio.original": "Originalsprache",
  "playback.subtitles.title": "Untertitel",
  "playback.subtitles.mode.default.label": "Wie in der Datei",
  "playback.subtitles.mode.always.label": "Immer",
  "playback.subtitles.mode.foreign.label": "Bei fremdsprachigem Audio",
  "playback.subtitles.mode.forced.label": "Nur erzwungene",
  "playback.subtitles.mode.off.label": "Aus",
  "playback.subtitles.language": "Untertitelsprache",
  "playback.subtitles.deviceLanguage": "Sprache dieses Geräts ({language})",
  "playback.subtitles.remember": "Meine Auswahl merken",

  "playback.skip.title": "Springen",
  "playback.skip.back": "Zurückspringen um",
  "playback.skip.forward": "Vorspringen um",
  "playback.skip.seconds": plural({
    one: "{count} Sekunde",
    other: "{count} Sekunden",
  }),

  "playback.device.title": "Dieses Gerät",
  "playback.quality.title": "Qualität",
  "playback.quality.preset": "{height}p, {bitrate}",
  "playback.quality.original": "Original",
  "playback.videoCodec.title": "Videocodec",
  "playback.audioCodec.title": "Audiocodec",
  "playback.codec.automatic": "Automatisch ({codec})",
  "playback.autoplay.title": "Nächste Folge abspielen",

  "playback.passthrough.title": "Audio-Passthrough",
} satisfies TranslationOf<typeof source>
