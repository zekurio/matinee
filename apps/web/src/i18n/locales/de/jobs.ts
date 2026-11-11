import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/jobs"

export default {
  "jobs.queues": "Hintergrundaufgaben",
  "jobs.loadFailed": "Die Aufträge konnten nicht geladen werden. {error}",
  "jobs.retry": "Erneut versuchen",

  "jobs.fact.status": "Status",
  "jobs.fact.lastRun": "Letzter Lauf",
  "jobs.fact.currentRun": "Aktueller Lauf",
  "jobs.fact.nextRun": "Nächster Lauf",

  "jobs.queue.library-scan.name": "Mediathek-Scans",
  "jobs.queue.library-scan.description":
    "Durchsucht Mediatheksordner nach neuen, geänderten und entfernten Dateien.",
  "jobs.queue.media-probe.name": "Medieninfo",
  "jobs.queue.media-probe.description":
    "Liest die Streams neuer und geänderter Dateien mit ffprobe.",
  "jobs.queue.metadata.name": "Metadaten",
  "jobs.queue.metadata.description":
    "Ruft Details, Artwork und Folgen von TMDB oder TheTVDB ab.",
  "jobs.queue.thumbnails.name": "Miniaturbilder",
  "jobs.queue.thumbnails.description":
    "Nimmt ein Einzelbild aus Videos, die kein Artwork haben.",
  "jobs.queue.trickplay.name": "Trickplay-Bilder",
  "jobs.queue.trickplay.description":
    "Erstellt die Vorschaubilder, die die Zeitleiste beim Spulen zeigt.",
  "jobs.queue.artwork.name": "Artwork",
  "jobs.queue.artwork.description":
    "Lädt Bilder vom Metadatenanbieter herunter, skaliert sie und liest ihre unscharfen Platzhalter aus.",
  "jobs.queue.subtitles.name": "Untertitel",
  "jobs.queue.subtitles.description":
    "Wandelt Untertitel in WebVTT um und kopiert PGS-Untertitel aus Videos.",
  "jobs.queue.avatars.name": "Profilbilder",
  "jobs.queue.avatars.description":
    "Schneidet und skaliert Uploads und die Bilder, die Anmeldeanbieter schicken.",
  "jobs.queue.downloads.name": "Download-Kodierungen",
  "jobs.queue.downloads.description":
    "Kodiert das Video von Downloads in einer anderen Größe oder einem anderen Codec, während die App oder der Browser sie abruft.",
  "jobs.queue.downloads.note":
    "Downloads, die gleichzeitig kodiert werden. Jeder belegt einen Encoder wie ein Stream; erhöhe den Wert, wenn der Server mithält.",
  "jobs.queue.download-copies.name": "Download-Kopien",
  "jobs.queue.download-copies.description":
    "Stellt Downloads zusammen, die ihr Video unverändert behalten, während die App oder der Browser sie abruft.",

  "jobs.queue.running": "{active} von {concurrency} aktiv",
  "jobs.queue.waiting": plural({
    one: "{count} wartet",
    other: "{count} warten",
  }),
  "jobs.queue.idle": "Leerlauf",
  "jobs.queue.done": plural({
    one: "{count} erledigt",
    other: "{count} erledigt",
  }),
  "jobs.queue.failed": plural({
    one: "{count} fehlgeschlagen",
    other: "{count} fehlgeschlagen",
  }),
  "jobs.queue.paused": "Pausiert",
  "jobs.queue.actions": "Aktionen für {queue}",
  "jobs.queue.details": "Details",
  "jobs.queue.pause": "Pausieren",
  "jobs.queue.resume": "Fortsetzen",
  "jobs.queue.clear": "Wartende Aufträge entfernen",
  "jobs.queue.pauseFailed": "{queue} konnte nicht pausiert werden",
  "jobs.queue.resumeFailed": "{queue} konnte nicht fortgesetzt werden",
  "jobs.queue.clearFailed": "{queue} konnte nicht geleert werden",

  "jobs.task.scan-libraries.name": "Mediatheken scannen",
  "jobs.task.scan-libraries.description":
    "Sucht in jeder Mediathek nach neuen, geänderten und entfernten Dateien, für Änderungen, die die Ordnerüberwachung nicht sieht, etwa auf einer Netzwerkfreigabe, in die ein anderer Rechner schreibt.",
  "jobs.task.refresh-metadata.name": "Metadaten aktualisieren",
  "jobs.task.refresh-metadata.description":
    "Ruft Metadaten für Titel ohne Treffer und für veraltete ab, für neue Folgen und Artwork.",
  "jobs.task.probe-media.name": "Medieninfo lesen",
  "jobs.task.probe-media.description":
    "Führt ffprobe für Dateien aus, die noch nicht gelesen wurden. Scans reihen ihre neuen Dateien selbst ein.",
  "jobs.task.prefetch-artwork.name": "Artwork abrufen",
  "jobs.task.prefetch-artwork.description":
    "Lädt Bilder herunter, für die der Server noch keinen unscharfen Platzhalter hat, Poster und Hintergründe zuerst. Metadatenabrufe reihen ihre Bilder selbst ein; diese Aufgabe holt nach einem Neustart oder einem fehlgeschlagenen Download auf.",
  "jobs.task.make-trickplay.name": "Trickplay-Bilder erstellen",
  "jobs.task.make-trickplay.description":
    "Erstellt die Vorschaubilder der Zeitleiste für Videos, die keine haben oder deren Datei oder Einstellungen sich geändert haben, neueste zuerst. Scans reihen ihre neuen Dateien selbst ein. Löscht auch die Bilder von Dateien, die nicht mehr da sind.",
  "jobs.task.clean-transcodes.name": "Transkodierungen aufräumen",
  "jobs.task.clean-sessions.name": "Abgelaufene Sitzungen löschen",
  "jobs.task.clean-sessions.description":
    "Entfernt abgelaufene Anmeldungen aus der Datenbank.",

  "jobs.task.sync-oidc-accounts.name": "Anbieterkonten synchronisieren",
  "jobs.task.sync-oidc-accounts.description":
    "Rollen, Profilbilder und Zugriff beim Anmeldeanbieter für Konten mit einem Refresh-Token aktualisieren.",

  "jobs.task.neverRan": "Noch nie gelaufen",
  "jobs.task.took": "Dauer {took}",
  "jobs.task.cancelledAfter": "Abgebrochen nach {took}",
  "jobs.task.failed": "Fehlgeschlagen",
  "jobs.task.failedWith": "Fehlgeschlagen: {error}",
  "jobs.task.running": "Läuft…",
  "jobs.task.started": "Gestartet {when}",
  "jobs.task.percent": "{percent} %",
  "jobs.task.progress": "Fortschritt von {task}",
  "jobs.task.run": "Jetzt ausführen",
  "jobs.task.cancel": "Abbrechen",
  "jobs.task.startFailed": "{task} konnte nicht gestartet werden",
  "jobs.task.cancelFailed": "{task} konnte nicht abgebrochen werden",

  "jobs.schedule.manual": "Läuft, wenn du sie startest",
  "jobs.schedule.atStartup": "Läuft beim Start",
  "jobs.schedule.afterStartup": "Läuft {delay} nach dem Start",
  "jobs.schedule.daily": "Täglich",
  "jobs.schedule.daily.atStartup": "Täglich und beim Start",
  "jobs.schedule.daily.afterStartup": "Täglich und {delay} nach dem Start",
  "jobs.schedule.hourly": "Stündlich",
  "jobs.schedule.hourly.atStartup": "Stündlich und beim Start",
  "jobs.schedule.hourly.afterStartup": "Stündlich und {delay} nach dem Start",
  "jobs.schedule.every": "Alle {interval}",
  "jobs.schedule.every.atStartup": "Alle {interval} und beim Start",
  "jobs.schedule.every.afterStartup":
    "Alle {interval} und {delay} nach dem Start",
  "jobs.schedule.notScheduled": "Nicht geplant",
  "jobs.schedule.afterThisRun": "Nach diesem Lauf",

  "jobs.concurrency": "Parallelität",
  "jobs.concurrency.limits": "Standard {default}, höchstens {max}.",
  "jobs.concurrency.decrease": "{queue} verringern",
  "jobs.concurrency.increase": "{queue} erhöhen",
  "jobs.concurrency.atOnce": plural({
    one: "{count} Auftrag gleichzeitig",
    other: "{count} Aufträge gleichzeitig",
  }),

  "jobs.details.running": "Aktiv",
  "jobs.details.nothingRunning": "Gerade läuft nichts.",
  "jobs.details.pausedNothingRunning": "Pausiert. Gerade läuft nichts.",
  "jobs.details.runningFor": "Seit {span}",
  "jobs.details.failures": "Letzte Fehler",
  "jobs.details.noFailures": "Keine seit dem Serverstart.",
  "jobs.details.kept": "Die letzten fünf seit dem Serverstart.",
  "jobs.details.retryOnRestart":
    "Die letzten fünf seit dem Serverstart. Jeder Auftrag wird nach einem Neustart des Servers erneut versucht.",
  "jobs.details.retryAfter":
    "Die letzten fünf seit dem Serverstart. Jeder Auftrag wird nach {span} erneut versucht.",
} satisfies TranslationOf<typeof source>
