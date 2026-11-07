import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/search"

export default {
  "search.title": "Suche",
  "search.failed":
    "Die Suche hat nicht geklappt. Versuch es gleich noch einmal.",
  "search.section.profiles": "Profile",
  "search.section.cast": "Besetzung & Crew",
  "search.section.genres": "Genres",
  "search.section.studios": "Studios",

  "search.shortcut": "Strg K",
  "search.field": "Filme, Serien, Personen und mehr suchen",
  "search.clear": "Suche leeren",
  "search.close": "Suche schließen",
  "search.cancel": "Abbrechen",
  "search.searching": "Suche läuft …",
  "search.noMatch": "Nichts passt zu „{query}“.",
  "search.everyResult": "Alle Ergebnisse für „{query}“",
  "search.titles": plural({ one: "{count} Titel", other: "{count} Titel" }),
  "search.kind.movie": "Film",
  "search.kind.show": "Serie",

  "search.page.documentTitle": "„{query}“",
  "search.page.intro":
    "Finde Filme, Serien, Besetzung und Crew, Genres, Studios und Profile.",
  "search.page.heading": "Ergebnisse für „{query}“",
  "search.page.noMatch": "Nichts passt zu „{query}“",
  "search.page.noMatchHint":
    "Prüf die Schreibweise oder versuch es mit einem Teil des Namens.",
  "search.page.capped":
    "Es werden jeweils die ersten {limit} angezeigt. Mit ein, zwei weiteren Wörtern grenzt du die Suche ein.",
  "search.count.profiles": plural({
    one: "{count} Profil",
    other: "{count} Profile",
  }),
  "search.count.movies": plural({
    one: "{count} Film",
    other: "{count} Filme",
  }),
  "search.count.shows": plural({
    one: "{count} Serie",
    other: "{count} Serien",
  }),
  "search.count.cast": plural({
    one: "{count} Person",
    other: "{count} Personen",
  }),
  "search.count.genres": plural({
    one: "{count} Genre",
    other: "{count} Genres",
  }),
  "search.count.studios": plural({
    one: "{count} Studio",
    other: "{count} Studios",
  }),
} satisfies TranslationOf<typeof source>
