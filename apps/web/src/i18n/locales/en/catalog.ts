import { defineMessages } from "../../catalog"

/*
 * Titles the server doesn't have: their cards, their pages, and where
 * search lists them. The state words are the four a viewer learns, and
 * none of them says "download", which here means saving a file to a
 * device.
 */
export default defineMessages("catalog", {
  "catalog.notHere": "Not here yet",

  // A state, on a card's second line and a poster's badge.
  "catalog.state.asked": "Requested",
  "catalog.state.coming": "On its way",
  "catalog.state.comingPercent": "On its way · {percent}",
  "catalog.state.out": "Out {date}",
  "catalog.state.notOut": "Not out yet",
  "catalog.state.unavailable": "Not available",

  // The marks in a card's corner.
  "catalog.badge.here": "Here now",
  "catalog.badge.fresh": "New, from your request",

  // A season's second line while it airs.
  "catalog.season.airing": "Airing · {aired} of {count}",

  // The title page.
  "catalog.page.stale": "These details may be out of date.",
  "catalog.page.badLink": "This link doesn't lead to a title.",

  // Rows under the title page. A film series' row has the series' name.
  "catalog.related.moreLikeThis": "More like this",
  "catalog.related.stale": "Some of these may be out of date.",

  // Search, under the library's own results.
  "catalog.search.failed": "Couldn't search for new titles right now.",
  "catalog.search.stale": "Some of these may be out of date.",
})
