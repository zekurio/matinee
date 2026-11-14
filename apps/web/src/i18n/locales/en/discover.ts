import { defineMessages, plural } from "../../catalog"

/*
 * Discover: rows of titles for when there's nothing in mind yet, on its
 * own page on wider screens and under the search field on phones. Its
 * cards and their states use the catalog's words.
 */
export default defineMessages("discover", {
  "discover.title": "Discover",

  // The rows, in the order the server sends them.
  "discover.rail.becauseWatched": "Because you watched {title}",
  "discover.rail.popularFilms": "Popular movies",
  "discover.rail.popularShows": "Popular shows",
  "discover.rail.comingSoon": "Coming soon",
  "discover.rail.othersAsked": "Requested by others",

  // A card in Coming soon, in place of the year: "14 Aug · Movie".
  "discover.card.release": "{date} · {kind}",

  "discover.stale": "Some of these may be out of date.",
  "discover.railFailed": "This row didn't load.",
  "discover.railsFailed": plural({
    one: "{count} row didn't load.",
    other: "{count} rows didn't load.",
  }),
  "discover.retry": "Try again",
  "discover.failed": "Discover isn't available right now.",
  "discover.failedHint": "The catalog didn't answer. Search still works.",
  "discover.empty": "Nothing to suggest right now",
  "discover.emptyHint": "Search finds the rest.",
  "discover.off": "Discover isn't set up here",
  "discover.offHint":
    "Search still finds everything in the libraries you can open.",
  "discover.offAdmin":
    "It needs a TMDB API key and a library that requests can go to.",
  "discover.gone": "This row isn't on Discover anymore",
  "discover.back": "Back to Discover",
  "discover.end": "That's the whole list.",
  "discover.moreFailed": "The next titles didn't load.",

  // Browsing all movies or all shows with filters and a sort.
  "discover.browse.movie": "Browse movies",
  "discover.browse.show": "Browse shows",
  "discover.browse.sort.popular": "Popular",
  "discover.browse.sort.votes": "Most votes",
  "discover.browse.scoreHint": "From TMDB, out of 10",
  "discover.browse.votes": "Votes",
  "discover.browse.chip.votes": plural({
    one: "At least {count} vote",
    other: "At least {count} votes",
  }),
  // A vote step as a chip: "1,000+".
  "discover.browse.votesStep": "{count}+",
  "discover.browse.floorScore":
    "Only titles with at least {count} votes, so a handful of votes can't top the list.",
  "discover.browse.floorList":
    "Only titles with at least {count} votes, so the list isn't filled with ones hardly anyone has seen.",
  "discover.browse.floorChange": "Choose a minimum",
  "discover.browse.none.movie": "No movies match these filters",
  "discover.browse.none.show": "No shows match these filters",
  "discover.browse.nothing": "Nothing to show right now",
  "discover.browse.failed": "These titles didn't load.",
  "discover.browse.optionsFailed": "The filters didn't load.",
})
