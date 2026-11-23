import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/jobs"

export default {
  "jobs.task.dispatch-requests.name": "Anfragen senden",
  "jobs.task.dispatch-requests.description":
    "Angenommene Anfragen zum Senden finden.",
  "jobs.task.poll-requests.name": "Fortschritt der Anfragen lesen",
  "jobs.task.poll-requests.description":
    "Aktive Anfragen einmal je Verbindung prüfen.",
  "jobs.task.reconcile-requests.name": "Eingänge für Anfragen abgleichen",
  "jobs.task.reconcile-requests.description":
    "Abspielbare Filme und Staffeln für angenommene Anfragen finden.",
  "jobs.queue.request-dispatch.name": "Anfragen übermitteln",
  "jobs.queue.request-dispatch.description":
    "Angenommene Titel an die Bibliotheksverbindung übermitteln.",
  "jobs.queue.request-progress.name": "Anfragenfortschritt",
  "jobs.queue.request-progress.description":
    "Fortschritt von Titeln prüfen, die unterwegs sind.",
  "jobs.queue.request-arrival.name": "Eingetroffene Anfragen",
  "jobs.queue.request-arrival.description":
    "Neue Bibliothekstitel ihren Anfragen zuordnen.",
  "jobs.queue.catalog.name": "Katalog",
  "jobs.queue.catalog.description":
    "Zwischengespeicherte Katalog- und Entdecken-Antworten aktualisieren.",
  "jobs.queue.title-features.name": "Titelmerkmale",
  "jobs.queue.title-features.description":
    "Genres, Schlagwörter und Beteiligte von Titeln bei TMDB holen, für Empfehlungen.",
  "jobs.queue.recommendations.name": "Empfehlungen",
  "jobs.queue.recommendations.description":
    "Die Empfehlungen jeder Person danach berechnen, was sie geschaut hat.",

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
  "jobs.queue.subtitle-prepare.name": "Untertitel vorbereiten",
  "jobs.queue.subtitle-prepare.description":
    "Indizierte Textuntertitel zwischenspeichern, ohne Videospuren zu lesen.",
  "jobs.task.prepare-subtitles.name": "Untertitel vorbereiten",
  "jobs.task.prepare-subtitles.description":
    "Indizierte Textuntertitel zwischenspeichern und Ausgaben entfernter oder geänderter Dateien löschen. Bilduntertitel bleiben auf Abruf.",
  "jobs.queue.trickplay.name": "Trickplay-Bilder",
  "jobs.queue.trickplay.description":
    "Erstellt die Vorschaubilder, die die Zeitleiste beim Spulen zeigt.",
  "jobs.queue.media-segments.name": "Intros und Abspann",
  "jobs.queue.media-segments.description":
    "Findet Intro und Abspann jeder Folge, für „Intro überspringen“ und um die nächste Folge schon während des Abspanns anzubieten.",
  "jobs.queue.artwork.name": "Artwork",
  "jobs.queue.artwork.description":
    "Lädt Bilder vom Metadatenanbieter herunter, skaliert sie und liest ihre unscharfen Platzhalter aus.",
  "jobs.queue.subtitle-fonts.name": "Untertitelschriften",
  "jobs.queue.subtitle-fonts.description":
    "Extrahiert eingebettete Schriftarten für formatierte Untertitel.",
  "jobs.queue.subtitles.name": "Untertitel",
  "jobs.queue.subtitles.description":
    "Wandelt Untertitel in WebVTT um und kopiert PGS-Untertitel aus Videos.",
  "jobs.queue.avatars.name": "Profilbilder",
  "jobs.queue.avatars.description":
    "Schneidet und skaliert die Bilder, die Leute hochladen.",
  "jobs.queue.downloads.name": "Download-Kodierungen",
  "jobs.queue.downloads.description":
    "Kodiert das Video von Downloads in einer anderen Größe oder einem anderen Codec, während die App oder der Browser sie abruft.",
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
  "jobs.task.prepare-discover.name": "Entdecken vorbereiten",
  "jobs.task.prepare-discover.description":
    "Liest die Reihen von Entdecken vorab und holt ihre Poster, damit sie schon beim ersten Öffnen ihre unscharfen Platzhalter zeigen.",
  "jobs.task.recommend-titles.name": "Empfehlungen aktualisieren",
  "jobs.task.recommend-titles.description":
    "Berechnet die Empfehlungen neu für alle, die seitdem etwas geschaut haben oder deren Liste einen Tag alt ist. Wer einen Titel zu Ende schaut oder einen Favoriten markiert, kommt von selbst in die Warteschlange.",
  "jobs.task.make-trickplay.name": "Trickplay-Bilder erstellen",
  "jobs.task.make-trickplay.description":
    "Erstellt die Vorschaubilder der Zeitleiste für Videos, die keine haben oder deren Datei oder Einstellungen sich geändert haben, neueste zuerst. Scans reihen ihre neuen Dateien selbst ein. Löscht auch die Bilder von Dateien, die nicht mehr da sind.",
  "jobs.task.find-segments.name": "Intros und Abspann finden",
  "jobs.task.find-segments.description":
    "Sucht Intro und Abspann von Folgen, die noch nicht untersucht wurden oder deren Datei sich geändert hat, in ihren Kapiteln und im Ton, den sie mit ihrer Staffel teilen. Scans reihen ihre neuen Dateien selbst ein.",
  "jobs.task.clean-transcodes.name": "Transkodierungen aufräumen",
  "jobs.task.clean-sessions.name": "Abgelaufene Sitzungen löschen",
  "jobs.task.clean-sessions.description":
    "Entfernt abgelaufene Anmeldungen aus der Datenbank.",
  "jobs.task.forget-browsed-pages.name": "Gefilterte Katalogseiten vergessen",
  "jobs.task.forget-browsed-pages.description":
    "Löscht Seiten des gefilterten Katalogs, die eine Woche lang niemand geöffnet hat.",

  "jobs.task.sync-oidc-accounts.name": "Anbieterkonten synchronisieren",
  "jobs.task.sync-oidc-accounts.description":
    "Rollen, Profilbilder und Zugriff beim Anmeldeanbieter für Konten mit einem Refresh-Token aktualisieren.",

  "jobs.task.neverRan": "Noch nie gelaufen",
  "jobs.task.took": "Dauer {took}",
  "jobs.task.cancelledAfter": "Abgebrochen nach {took}",
  "jobs.task.failed": "Fehlgeschlagen",
  "jobs.task.failedWith": "Fehlgeschlagen: {error}",
  "jobs.task.failedUnknown":
    "Das ist fehlgeschlagen. Details stehen im Server-Log.",
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
  "jobs.schedule.every.atStartup": "{every} und beim Start",
  "jobs.schedule.every.afterStartup": "{every} und {delay} nach dem Start",
  "jobs.schedule.everySeconds": plural({
    one: "Jede Sekunde",
    other: "Alle {count} Sekunden",
  }),
  "jobs.schedule.everyMinutes": plural({
    one: "Jede Minute",
    other: "Alle {count} Minuten",
  }),
  "jobs.schedule.everyHours": plural({
    one: "Jede Stunde",
    other: "Alle {count} Stunden",
  }),
  "jobs.schedule.everyDays": plural({
    one: "Jeden Tag",
    other: "Alle {count} Tage",
  }),
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
