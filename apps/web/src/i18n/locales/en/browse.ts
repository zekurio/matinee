import { defineMessages, plural } from "../../catalog"

export default defineMessages("browse", {
  // Home: the welcome without libraries, the rows, and the shelves.
  "browse.home.welcome": "Welcome, {name}",
  "browse.home.noLibraries": "No libraries yet",
  "browse.home.noLibrariesAdmin":
    "Add a folder of videos on this server to start watching.",
  // For an account that opens no library, which may be in no group yet.
  "browse.home.nothingYet": "Nothing to watch yet",
  "browse.home.nothingYetDescription":
    "There's nothing your account can open yet. Ask whoever runs this server to give you access.",
  "browse.home.addLibrary": "Add a library",
  "browse.home.continueWatching": "Continue watching",
  "browse.home.nextUp": "Next up",
  "browse.home.recentlyAdded": "Recently added in {library}",
  "browse.home.scanning": "Scanning…",
  "browse.home.emptyShelf": "Nothing here yet.",
  // A genre's or a studio's page.
  "browse.genre": "Genre",
  "browse.studio": "Studio",
  "browse.titleCount": plural({
    one: "{count} title",
    other: "{count} titles",
  }),
  "browse.search": "Search {name}",
  "browse.noMatch": "Nothing matches “{query}”",
  "browse.noFilterMatch": "Nothing here matches these filters",
  "browse.clearSearch": "Clear search",
  "browse.genre.none.movie": "No movies in this genre",
  "browse.genre.none.show": "No shows in this genre",
  "browse.studio.none.movie": "No movies from this studio",
  "browse.studio.none.show": "No shows from this studio",
  "browse.showBoth": "Show movies and shows",
  "browse.genre.empty": "Nothing in this genre",
  "browse.studio.empty": "Nothing from this studio",
  "browse.emptyDescription":
    "No movie or show in the libraries lists “{name}”.",
  "browse.backHome": "Back to Home",
  // The movies-or-shows chips.
  "browse.kind": "Kind",
  "browse.kind.all": "All",
  "browse.kind.movie": "Movies",
  "browse.kind.show": "Shows",
  // The page header.
})
