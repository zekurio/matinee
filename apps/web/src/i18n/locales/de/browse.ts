import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/browse"

export default {
  "browse.home.welcome": "Willkommen, {name}",
  "browse.home.noLibraries": "Noch keine Mediatheken",
  "browse.home.noLibrariesAdmin":
    "Füge einen Ordner mit Videos auf diesem Server hinzu, um loszulegen.",
  "browse.home.nothingYet": "Noch nichts zu sehen",
  "browse.home.nothingYetDescription":
    "Dein Konto kann noch nichts öffnen. Frag, wer diesen Server betreibt, ob du Zugriff bekommst.",
  "browse.home.addLibrary": "Mediathek hinzufügen",
  "browse.home.continueWatching": "Weiterschauen",
  "browse.home.nextUp": "Als Nächstes",
  "browse.home.recentlyAdded": "Neu in {library}",
  "browse.home.scanning": "Wird gescannt…",
  "browse.home.emptyShelf": "Hier ist noch nichts.",
  "browse.genre": "Genre",
  "browse.studio": "Studio",
  "browse.titleCount": plural({ one: "{count} Titel", other: "{count} Titel" }),
  "browse.search": "{name} durchsuchen",
  "browse.noMatch": "Nichts passt zu „{query}“",
  "browse.clearSearch": "Suche leeren",
  "browse.genre.none.movie": "Keine Filme in diesem Genre",
  "browse.genre.none.show": "Keine Serien in diesem Genre",
  "browse.studio.none.movie": "Keine Filme von diesem Studio",
  "browse.studio.none.show": "Keine Serien von diesem Studio",
  "browse.showBoth": "Filme und Serien zeigen",
  "browse.genre.empty": "Nichts in diesem Genre",
  "browse.studio.empty": "Nichts von diesem Studio",
  "browse.emptyDescription":
    "In den Mediatheken ist kein Film und keine Serie mit „{name}“ verzeichnet.",
  "browse.backHome": "Zurück zur Startseite",
  "browse.kind": "Art",
  "browse.kind.all": "Alle",
  "browse.kind.movie": "Filme",
  "browse.kind.show": "Serien",
} satisfies TranslationOf<typeof source>
