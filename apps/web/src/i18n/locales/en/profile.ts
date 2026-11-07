import { defineMessages } from "../../catalog"

export default defineMessages("profile", {
  // The profile page.
  "profile.loadFailed": "Couldn't load this profile",
  "profile.backHome": "Back to Home",
  "profile.private": "{name} keeps their profile private",
  "profile.recent": "Recently watched",

  // The header: name, role, and the ways to share or change it.
  "profile.admin": "Admin",
  "profile.joined": "Joined {date}",
  "profile.edit": "Edit profile",
  "profile.shareTitle": "{name} on Matinee",
  "profile.shareFailed": "Couldn't share this profile",
  "profile.share": "Share",
  "profile.copyLink": "Copy link",
  "profile.copied": "Copied link",
  "profile.tryAgain": "Try again",

  // Favorites.
  "profile.favorites": "Favorites",
  "profile.favoriteEpisodes": "Favorite episodes",
  "profile.noFavorites": "No favorites yet",
  "profile.noFavoritesHint":
    "Tap the heart on a movie, show, or episode to keep it here.",

  // Statistics.
  "profile.statistics": "Statistics",
  "profile.stoppedSharing": "{name} stopped sharing their statistics",
  "profile.selfEmpty": "Your statistics fill in as you watch",
  "profile.selfEmptyHint":
    "Watch time and your most watched titles show up here after your first play.",
  "profile.findSomething": "Find something to watch",
  "profile.otherEmpty": "{name} hasn't watched anything yet",
  "profile.otherEmptyHint":
    "Their statistics show up here after their first play.",
  "profile.nothingWatched": "Nothing watched {period}",
  "profile.showAllTime": "Show all time",
})
