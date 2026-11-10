import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/downloads"

export default {
  "downloads.menuItem": "Herunterladen",
  "downloads.title": "{name} herunterladen",
  "downloads.description":
    "Lade das Original oder eine angepasste Version herunter.",
  "downloads.version": "Version",
  "downloads.original": "Original",
  "downloads.original.description": "{format} · {size}",
  "downloads.custom": "Angepasst",
  "downloads.custom.description": "Größe, Spuren und Untertitel wählen.",
  "downloads.custom.unavailable":
    "Der Server hat die Spuren dieser Datei noch nicht gelesen.",

  "downloads.video": "Video",
  "downloads.video.keep": "Original, {codec} {resolution}",
  "downloads.video.preset": "{resolution}, {bitrate}",
  "downloads.container": "Format",
  "downloads.codec": "Codec",
  "downloads.keepHdr": "HDR behalten",

  "downloads.audio": "Tonspuren",
  "downloads.audio.loading": "Tonspuren werden geladen…",
  "downloads.audio.keep": "{format} behalten",
  "downloads.audio.convert": "{codec} {layout}",
  "downloads.audio.include": "{track} einschließen",
  "downloads.audio.format": "Format von {track}",
  "downloads.audio.none": "Wähle mindestens eine Tonspur.",

  "downloads.burnIn": "Untertitel einbrennen",
  "downloads.burnIn.none": "Keine",
  "downloads.subtitles.inFile": "Untertitel",
  "downloads.subtitles.include": "{track} einschließen",
  "downloads.subtitles": "Untertiteldateien",
  "downloads.subtitles.description":
    "Dateien neben dem Video, nicht darin. Speichere die gewünschten.",
  "downloads.subtitles.save": "{track} speichern",

  "downloads.estimate": "Etwa {size}",
  "downloads.estimating": "Größe wird berechnet…",
  "downloads.toneMapped": "HDR wird in SDR umgewandelt.",
  "downloads.cancel": "Abbrechen",
  "downloads.submit": "Herunterladen",
  "downloads.started": "Download gestartet",
  "downloads.started.description":
    "Die Datei wird während des Downloads umgewandelt. Das kann etwas dauern.",
  "downloads.startFailed": "Der Download konnte nicht gestartet werden",

  "downloads.all.description":
    "Speichert jede Originaldatei mit allen Spuren. Für eine Version für dieses Gerät lade eine Folge einzeln herunter.",
  "downloads.all.files": plural({
    one: "{count} Datei",
    other: "{count} Dateien",
  }),
  "downloads.all.browser":
    "Dein Browser fragt vielleicht, ob diese Seite mehrere Dateien herunterladen darf.",
  "downloads.all.loadFailed":
    "Die Dateien konnten nicht geladen werden. {error}",
  "downloads.all.empty": "Es gibt keine Dateien zum Herunterladen.",
  "downloads.all.started": plural({
    one: "{count} Datei wird heruntergeladen",
    other: "{count} Dateien werden heruntergeladen",
  }),
  "downloads.all.started.description":
    "Lass diese Seite offen, bis dein Browser alle gestartet hat.",
} satisfies TranslationOf<typeof source>
