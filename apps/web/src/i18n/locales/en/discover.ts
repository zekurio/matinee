import { defineMessages, plural } from "../../catalog"

/*
 * Discover: rows of titles for when there's nothing in mind yet, on its
 * own page on wider screens and under the search field on phones. Its
 * cards and their states use the catalog's words.
 */
export default defineMessages("discover", {
  "discover.title": "Discover",

  // The rows, in the order the server sends them.
  "discover.rail.popularFilms": "Popular movies",
  "discover.rail.popularShows": "Popular shows",
  "discover.rail.comingSoon": "Coming soon",
  // Recommendations from what the viewer watched, on Discover and on Home.
  "discover.rail.forYou": "Recommended for you",
  "discover.rail.becauseWatched": "Because you watched {name}",

  // The card in Discover's first row, an admin's waiting requests or a
  // person's own. The row is titled `requests.title`.
  "discover.request.waiting": "Waiting",
  "discover.request.askedWhen": "First requested {when}",

  // Why a title is recommended, on its card's tooltip.
  "discover.reason.watched": "Because you watched {name}",
  "discover.reason.person": "With {name}",
  "discover.reason.taste": "Picked from what you watch",
  "discover.notInterested": "Not interested",
  "discover.notInterestedNamed": "Not interested in {name}",
  "discover.dismissed": "You won't see {name} in your recommendations.",
  "discover.dismissFailed": "Couldn't hide {name}.",
  "discover.undo": "Undo",

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
  "discover.end": "That's the whole list.",
  "discover.moreFailed": "The next titles didn't load.",

  // Browsing all movies or all shows with filters and a sort. Each row's
  // heading opens one, with the row's filters and sort.
  "discover.browse.movie": "Browse movies",
  "discover.browse.show": "Browse shows",
  "discover.browse.sort.popular": "Popular",
  // The viewer's recommendations, best first.
  "discover.browse.sort.forYou": "Best match",
  "discover.browse.sort.votes": "Most votes",
  "discover.browse.scoreHint": "From TMDB, out of 10",
  "discover.browse.votes": "Votes",
  // A vote step as a chip: "1,000+".
  "discover.browse.votesStep": "{count}+",
  // Filters that narrow what's listed rather than describe a title.
  "discover.browse.only": "Only",
  "discover.browse.onlyHint": "Coming soon looks three months ahead.",
  "discover.browse.recommended": "Recommended for you",
  "discover.browse.upcoming": "Coming soon",
  "discover.browse.requestable": "Ones to ask for",
  "discover.browse.floorScore":
    "Only titles with at least {count} votes, so a handful of votes can't top the list.",
  "discover.browse.floorList":
    "Only titles with at least {count} votes, so the list isn't filled with ones hardly anyone has seen.",
  "discover.browse.none.movie": "No movies match these filters",
  "discover.browse.none.show": "No shows match these filters",
  "discover.browse.nothing": "Nothing to show right now",
  "discover.browse.forYouNone": "No recommendations yet",
  "discover.browse.forYouHint":
    "They come from what you watch. Play a few things and look again tomorrow.",
  "discover.browse.failed": "These titles didn't load.",
  "discover.browse.optionsFailed": "The filters didn't load.",
})
