import { defineMessages, plural } from "../../catalog"

export default defineMessages("library", {
  // What the server is doing to a library, and the empty and paging states.
  "library.scanning": "Scanning folders…",
  "library.fetchingMetadata": "Fetching metadata…",
  "library.scanRunning": "The scan is still running.",
  "library.noVideosHint":
    "Check that the library folders contain video files the server can read.",
  "library.showMore": "Show more",
  "library.clearSearch": "Clear search",
  "library.clearFilters": "Clear filters",
  "library.loadFailed": "Couldn't load this library",
  // A library's poster grid, by the library's kind.
  "library.search.movies": "Search movies",
  "library.search.shows": "Search shows",
  "library.noMatch.movies": "No movies match “{query}”",
  "library.noMatch.shows": "No shows match “{query}”",
  "library.noFilterMatch.movies": "No movies match these filters",
  "library.noFilterMatch.shows": "No shows match these filters",
  "library.none.movies": "No movies found",
  "library.none.shows": "No shows found",
  // Sorts.
  "library.sort.name": "Name",
  "library.sort.recent": "Recently added",
  "library.sort.year": "Year",
  // Filter, sort, and search controls.
  "library.filters": "Filters",
  "library.filtersOn": plural({
    one: "Filters, {count} on",
    other: "Filters, {count} on",
  }),
  "library.removeFilter": "Remove filter {name}",
  "library.clearAll": "Clear all",
  "library.filter": "Filter",
  "library.genre": "Genre",
  "library.anyGenre": "Any genre",
  "library.studio": "Studio",
  "library.anyStudio": "Any studio",
  "library.any": "Any",
  "library.clearFilter": "Clear filter",
  "library.closeFilter": "Close filter",
  "library.sort": "Sort",
  "library.sortCurrent": "Sort: {sort}",
  "library.sortBy": "Sort by",
  "library.sortPrefix": "Sort:",
})
