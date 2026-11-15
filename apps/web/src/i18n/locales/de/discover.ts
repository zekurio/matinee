import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/discover"

export default {
  "discover.title": "Entdecken",

  "discover.rail.popularFilms": "Beliebte Filme",
  "discover.rail.popularShows": "Beliebte Serien",
  "discover.rail.comingSoon": "Demnächst",
  "discover.rail.forYou": "Empfehlungen für dich",
  "discover.rail.becauseWatched": "Weil du {name} geschaut hast",

  "discover.reason.watched": "Weil du {name} geschaut hast",
  "discover.reason.person": "Mit {name}",
  "discover.reason.taste": "Passend zu dem, was du schaust",
  "discover.notInterested": "Kein Interesse",
  "discover.notInterestedNamed": "Kein Interesse an {name}",
  "discover.dismissed": "{name} taucht nicht mehr in deinen Empfehlungen auf.",
  "discover.dismissFailed": "{name} ließ sich nicht ausblenden.",
  "discover.undo": "Rückgängig",

  "discover.stale": "Einiges davon ist vielleicht nicht aktuell.",
  "discover.railFailed": "Diese Reihe hat nicht geladen.",
  "discover.railsFailed": plural({
    one: "{count} Reihe hat nicht geladen.",
    other: "{count} Reihen haben nicht geladen.",
  }),
  "discover.retry": "Erneut versuchen",
  "discover.failed": "Entdecken geht gerade nicht.",
  "discover.failedHint": "Der Katalog antwortet nicht. Die Suche geht weiter.",
  "discover.empty": "Gerade nichts vorzuschlagen",
  "discover.emptyHint": "Die Suche findet den Rest.",
  "discover.off": "Entdecken ist hier nicht eingerichtet",
  "discover.offHint":
    "Die Suche findet weiter alles in den Mediatheken, die du öffnen kannst.",
  "discover.offAdmin":
    "Dafür braucht es einen TMDB-API-Schlüssel und eine Mediathek, in die Anfragen gehen können.",
  "discover.end": "Das ist die ganze Liste.",
  "discover.moreFailed": "Die nächsten Titel haben nicht geladen.",

  "discover.browse.movie": "Filme durchstöbern",
  "discover.browse.show": "Serien durchstöbern",
  "discover.browse.kind": "Filme oder Serien",
  "discover.browse.kind.movie": "Filme",
  "discover.browse.kind.show": "Serien",
  "discover.browse.sort.popular": "Beliebt",
  "discover.browse.sort.forYou": "Beste Treffer",
  "discover.browse.sort.votes": "Meiste Stimmen",
  "discover.browse.scoreHint": "Von TMDB, von 10",
  "discover.browse.votes": "Stimmen",
  "discover.browse.chip.votes": plural({
    one: "Mindestens {count} Stimme",
    other: "Mindestens {count} Stimmen",
  }),
  "discover.browse.votesStep": "{count}+",
  "discover.browse.only": "Nur",
  "discover.browse.onlyHint": "Demnächst heißt in den nächsten drei Monaten.",
  "discover.browse.recommended": "Empfehlungen für dich",
  "discover.browse.upcoming": "Demnächst",
  "discover.browse.requestable": "Was du anfragen kannst",
  "discover.browse.floorScore":
    "Nur Titel mit mindestens {count} Stimmen, damit nicht eine Handvoll Stimmen die Liste anführt.",
  "discover.browse.floorList":
    "Nur Titel mit mindestens {count} Stimmen, damit die Liste nicht voller Titel ist, die kaum jemand kennt.",
  "discover.browse.floorChange": "Mindestzahl wählen",
  "discover.browse.none.movie": "Keine Filme passen zu diesen Filtern",
  "discover.browse.none.show": "Keine Serien passen zu diesen Filtern",
  "discover.browse.nothing": "Gerade nichts zu zeigen",
  "discover.browse.forYouNone": "Noch keine Empfehlungen",
  "discover.browse.forYouHint":
    "Sie kommen aus dem, was du schaust. Spiel ein paar Titel ab und schau morgen wieder vorbei.",
  "discover.browse.failed": "Diese Titel haben nicht geladen.",
  "discover.browse.optionsFailed": "Die Filter haben nicht geladen.",
} satisfies TranslationOf<typeof source>
