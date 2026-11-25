import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/library"

export default {
  "library.scanning": "Ordner werden gescannt…",
  "library.fetchingMetadata": "Metadaten werden geladen…",
  "library.scanRunning": "Der Scan läuft noch.",
  "library.noVideosHint":
    "Prüfe, ob die Ordner der Mediathek Videodateien enthalten, die der Server lesen kann.",
  "library.showMore": "Mehr anzeigen",
  "library.clearFilters": "Filter zurücksetzen",
  "library.loadFailed": "Diese Mediathek konnte nicht geladen werden",
  "library.noFilterMatch.movies": "Keine Filme passen zu diesen Filtern",
  "library.noFilterMatch.shows": "Keine Serien passen zu diesen Filtern",
  "library.none.movies": "Keine Filme gefunden",
  "library.none.shows": "Keine Serien gefunden",
  "library.none.media": "Keine Filme oder Serien gefunden",
  "library.filters": "Filter",
  "library.filtersOn": plural({
    one: "Filter, {count} aktiv",
    other: "Filter, {count} aktiv",
  }),
  "library.filter": "Filtern",
  "library.sort": "Sortierung",
  "library.sortCurrent": "Sortierung: {sort}",
  "library.sortBy": "Sortieren nach",
  "library.sortPrefix": "Sortierung:",
} satisfies TranslationOf<typeof source>
