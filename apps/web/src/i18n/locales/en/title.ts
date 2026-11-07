import { defineMessages, plural } from "../../catalog"

export default defineMessages("title", {
  // Shared by the title, season, and episode pages.
  "title.backHome": "Back to Home",
  "title.play": "Play",
  "title.resume": "Resume",
  "title.playName": "Play {name}",
  "title.resumeName": "Resume {name}",
  "title.moreActions": "More actions",
  "title.moreActionsFor": "More actions for {name}",
  "title.more": "More",
  "title.less": "Less",
  // A season's name after its show's, like "Severance: Season 2".
  "title.seasonOf": "{show}: {season}",
  "title.seasonCount": plural({
    one: "{count} season",
    other: "{count} seasons",
  }),
  "title.episodeCount": plural({
    one: "{count} episode",
    other: "{count} episodes",
  }),

  // title-page.tsx
  "title.loadError": "Couldn't load this title",

  // title-header.tsx: the facts under the name.
  "title.rating": "Rated {rating}",

  // title-menu.tsx
  "title.menu.fixMatch": "Fix match…",
  "title.menu.refresh": "Refresh metadata",
  "title.refresh.done": "Updated {name}",
  "title.refresh.doneDescription": "Fetched again from {provider}.",
  "title.refresh.error": "Couldn't fetch metadata",
  "title.match.none":
    "{provider} had no match for “{path}”, so the name comes from the folder.",
  "title.match.waiting":
    "Waiting for {provider}. The name comes from the folder for now.",

  // identify-dialog.tsx
  "title.identify.title": "Fix match",
  "title.identify.description":
    "Search {provider} and pick the entry for {path}.",
  "title.identify.name": "Name",
  "title.identify.year": "Year",
  "title.identify.anyYear": "Any",
  "title.identify.search": "Search",
  "title.identify.empty":
    "{provider} found nothing for “{query}”. Try the original title, or leave the year empty.",
  "title.identify.current": "Current match",
  "title.identify.matched": "Matched to {name}",

  // next-up.tsx
  "title.nextUp.continue": "Continue watching",
  "title.nextUp.next": "Next up",

  // episodes.tsx
  "title.episodes": "Episodes",
  "title.episodes.error": "Couldn't load the episodes. {error}",
  // An episode's number before its name, like "S1E2: Pilot".
  "title.episodes.codedName": "{code}: {name}",

  // seasons-rail.tsx
  "title.seasons": "Seasons",
  "title.seasons.more": "More seasons",
  "title.seasons.left": plural({
    one: "{count} episode left to watch",
    other: "{count} episodes left to watch",
  }),

  // season-page.tsx
  "title.season.showError": "Couldn't load this show",
  "title.season.missing": "{name} has no such season",
  "title.season.all": "See all seasons",
  "title.season.watched": "Watched",
  "title.season.watchedCount": plural({
    one: "{count} watched",
    other: "{count} watched",
  }),

  // The episode's page.
  "title.episode.loadError": "Couldn't load this episode",
  "title.episode.moreFrom": "More from {season}",
  "title.episode.moreFromSeason": "More from this season",
  "title.episode.specials": "Specials",
  "title.episode.season": "Season {number}",
  "title.episode.number": "Episode {number}",
})
