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
  "discover.browse.sort.scoreHigh": "Highest score",
  "discover.browse.sort.scoreLow": "Lowest score",
  "discover.browse.sort.votes": "Most votes",
  "discover.browse.sort.newest": "Newest",
  "discover.browse.sort.oldest": "Oldest",
  "discover.browse.sort.nameAsc": "Name, A to Z",
  "discover.browse.sort.nameDesc": "Name, Z to A",
  "discover.browse.filters": "Filters",
  "discover.browse.done": "Show titles",
  "discover.browse.genres": "Genres",
  "discover.browse.years": "Release year",
  "discover.browse.score": "User score",
  "discover.browse.scoreHint": "From TMDB, out of 10",
  "discover.browse.votes": "Votes",
  "discover.browse.rating": "Age rating",
  // The country whose ratings these are, by name.
  "discover.browse.ratingHint": "Up to the rating you pick · {country}",
  "discover.browse.language": "Original language",
  "discover.browse.runtime": "Runtime",
  "discover.browse.runtimeHint.movie": "How long the movie is",
  "discover.browse.runtimeHint.show": "How long an episode is",
  "discover.browse.any": "Any",
  "discover.browse.anyYear": "Any year",
  "discover.browse.anyScore": "Any score",
  "discover.browse.anyLanguage": "Any language",
  "discover.browse.anyLength": "Any length",
  // A range's bounds; each side can be open.
  "discover.browse.between": "{low} to {high}",
  "discover.browse.atLeast": "At least {value}",
  "discover.browse.upTo": "Up to {value}",
  "discover.browse.from": "From {value}",
  "discover.browse.lowest": "Lowest",
  "discover.browse.highest": "Highest",
  // The chips for filters in use.
  "discover.browse.chip.scoreBetween": "Score {low} to {high}",
  "discover.browse.chip.scoreAtLeast": "Score at least {value}",
  "discover.browse.chip.scoreUpTo": "Score up to {value}",
  "discover.browse.chip.runtimeBetween": "{low} to {high} long",
  "discover.browse.chip.runtimeAtLeast": "At least {value} long",
  "discover.browse.chip.runtimeUpTo": "Up to {value} long",
  "discover.browse.chip.votes": plural({
    one: "At least {count} vote",
    other: "At least {count} votes",
  }),
  "discover.browse.chip.rating": "Rated up to {rating}",
  // A vote step as a chip: "1,000+".
  "discover.browse.votesStep": "{count}+",
  // A card's line in place of the year: "★ 8.3 · 1985".
  "discover.browse.card.score": "★ {score} · {year}",
  "discover.browse.card.scoreOnly": "★ {score}",
  "discover.browse.floorScore":
    "Only titles with at least {count} votes, so a handful of votes can't top the list.",
  "discover.browse.floorList":
    "Only titles with at least {count} votes, so the list isn't filled with ones hardly anyone has seen.",
  "discover.browse.floorChange": "Choose a minimum",
  "discover.browse.none.movie": "No movies match these filters",
  "discover.browse.none.show": "No shows match these filters",
  "discover.browse.noneHint": "Take a filter off, or widen a range.",
  "discover.browse.nothing": "Nothing to show right now",
  "discover.browse.failed": "These titles didn't load.",
  "discover.browse.optionsFailed": "The filters didn't load.",
})
