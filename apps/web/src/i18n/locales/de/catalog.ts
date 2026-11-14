import type { TranslationOf } from "../../catalog"
import type source from "../en/catalog"

export default {
  "catalog.notHere": "Noch nicht hier",

  "catalog.state.asked": "Angefragt",
  "catalog.state.coming": "Unterwegs",
  "catalog.state.comingPercent": "Unterwegs · {percent}",
  "catalog.state.out": "Ab {date}",
  "catalog.state.notOut": "Noch nicht erschienen",
  "catalog.state.unavailable": "Nicht verfügbar",

  "catalog.badge.here": "Jetzt da",
  "catalog.badge.fresh": "Neu, auf deine Anfrage",

  "catalog.season.airing": "Läuft · {aired} von {count}",

  "catalog.page.stale": "Diese Angaben sind vielleicht nicht aktuell.",
  "catalog.page.badLink": "Dieser Link führt zu keinem Titel.",

  "catalog.related.moreLikeThis": "Ähnliche Titel",
  "catalog.related.stale": "Einiges davon ist vielleicht nicht aktuell.",

  "catalog.search.failed": "Die Suche nach neuen Titeln geht gerade nicht.",
  "catalog.search.stale": "Einiges davon ist vielleicht nicht aktuell.",
} satisfies TranslationOf<typeof source>
