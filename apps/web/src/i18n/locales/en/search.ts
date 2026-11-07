import { defineMessages, plural } from "../../catalog"

export default defineMessages("search", {
  // Shared by the spotlight and the search page.
  "search.title": "Search",
  "search.failed": "The search didn't go through. Try again in a moment.",
  "search.section.profiles": "Profiles",
  "search.section.cast": "Cast & crew",
  "search.section.genres": "Genres",
  "search.section.studios": "Studios",

  // The spotlight: the header button, the field, and its rows.
  "search.shortcut": "Ctrl K",
  "search.field": "Search movies, shows, people, and more",
  "search.clear": "Clear search",
  "search.close": "Close search",
  "search.cancel": "Cancel",
  "search.searching": "Searching…",
  "search.noMatch": "Nothing matches “{query}”.",
  "search.everyResult": "Every result for “{query}”",
  "search.titles": plural({ one: "{count} title", other: "{count} titles" }),
  "search.kind.movie": "Movie",
  "search.kind.show": "Show",

  // The search page.
  "search.page.documentTitle": "“{query}”",
  "search.page.intro":
    "Find movies, shows, cast and crew, genres, studios, and profiles.",
  "search.page.heading": "Results for “{query}”",
  "search.page.noMatch": "Nothing matches “{query}”",
  "search.page.noMatchHint": "Check the spelling, or try part of the name.",
  "search.page.capped":
    "Showing the first {limit} of each. Add a word or two to narrow it down.",
  // A section's count beside its heading.
  "search.count.profiles": plural({
    one: "{count} profile",
    other: "{count} profiles",
  }),
  "search.count.movies": plural({
    one: "{count} movie",
    other: "{count} movies",
  }),
  "search.count.shows": plural({ one: "{count} show", other: "{count} shows" }),
  "search.count.cast": plural({
    one: "{count} person",
    other: "{count} people",
  }),
  "search.count.genres": plural({
    one: "{count} genre",
    other: "{count} genres",
  }),
  "search.count.studios": plural({
    one: "{count} studio",
    other: "{count} studios",
  }),
})
