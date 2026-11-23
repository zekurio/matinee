import { defineMessages } from "../../catalog"

/*
 * The filter panel and sort that Discover's browse and the libraries
 * share.
 */
export default defineMessages("filters", {
  "filters.sort.scoreHigh": "Highest score",
  "filters.sort.scoreLow": "Lowest score",
  "filters.sort.newest": "Newest",
  "filters.sort.oldest": "Oldest",
  "filters.sort.nameAsc": "Name, A to Z",
  "filters.sort.nameDesc": "Name, Z to A",
  "filters.title": "Filters",
  "filters.done": "Show titles",
  "filters.genres": "Genres",
  "filters.years": "Release year",
  "filters.score": "User score",
  "filters.rating": "Age rating",
  // The country whose ratings these are, by name.
  "filters.ratingHint": "Up to the rating you pick · {country}",
  "filters.language": "Original language",
  "filters.runtime": "Runtime",
  "filters.runtimeHint.movie": "How long the movie is",
  "filters.runtimeHint.show": "How long an episode is",
  "filters.runtimeHint.both": "How long the movie or an episode is",
  "filters.any": "Any",
  "filters.anyYear": "Any year",
  "filters.anyScore": "Any score",
  "filters.anyLanguage": "Any language",
  "filters.anyLength": "Any length",
  // A range's bounds; each side can be open.
  "filters.between": "{low} to {high}",
  "filters.atLeast": "At least {value}",
  "filters.upTo": "Up to {value}",
  "filters.from": "From {value}",
  "filters.lowest": "Lowest",
  "filters.highest": "Highest",
  "filters.noneHint": "Take a filter off, or widen a range.",
  "filters.studios": "Studios",
  "filters.findStudio": "Find a studio",
  "filters.noStudio": "No studio by that name",
  "filters.scoreHint": "Out of 10",
  // With movies and shows, each kind's ratings get a row: "Movies · United States".
  "filters.ratingHintBoth": "Up to the rating you pick",
  "filters.ratingRow.movie": "Movies · {country}",
  "filters.ratingRow.show": "Shows · {country}",
  "filters.progress": "Progress",
  "filters.watch.unwatched": "Unwatched",
  "filters.watch.inProgress": "In progress",
  "filters.watch.watched": "Watched",
  "filters.sort.recentNew": "Recently added",
  "filters.sort.recentOld": "First added",
  "filters.sort.longest": "Longest",
  "filters.sort.shortest": "Shortest",
  // A card's line in place of the year, sorted by score or runtime: "★ 8.3 · 1985".
  "filters.card.score": "★ {score} · {year}",
  "filters.card.scoreOnly": "★ {score}",
  "filters.card.runtime": "{runtime} · {year}",
  "filters.card.runtimeOnly": "{runtime}",
})
