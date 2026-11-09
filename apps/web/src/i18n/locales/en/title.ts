import { defineMessages, plural } from "../../catalog"

export default defineMessages("title", {
  // Shared by the title, season, and episode pages.
  "title.backHome": "Back to Home",
  "title.play": "Play",
  "title.resume": "Resume",
  "title.playName": "Play {name}",
  "title.resumeName": "Resume {name}",
  "title.moreActions": "More actions",
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
  "title.menu.fixMatch": "Fix match",
  "title.menu.refresh": "Refresh metadata",
  // Also in the season's and the episode's menus.
  "title.menu.editImages": "Edit images",
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

  // image-editor.tsx
  "title.images.title": "Edit images",
  "title.images.description":
    "Pick images for {name} from {provider}, or upload your own. What you pick stays when the metadata is fetched again.",
  "title.images.descriptionLocal": "Upload images for {name}.",
  // Names the row of image kinds for screen readers.
  "title.images.slots": "Image",
  "title.images.slot.poster": "Poster",
  "title.images.slot.backdrop": "Backdrop",
  "title.images.slot.logo": "Logo",
  // An episode's picture, a frame the provider picked.
  "title.images.slot.still": "Still",
  "title.images.state.none": "None",
  "title.images.state.noneFrame": "None, so a frame from the file shows",
  "title.images.state.removed": "Removed",
  "title.images.state.uploaded": "Uploaded",
  "title.images.state.picked": "Picked by hand",
  "title.images.state.pickedFrom": "Picked from {provider}",
  "title.images.state.from": "From {provider}",
  "title.images.upload": "Upload",
  "title.images.remove": "Remove",
  "title.images.reset": "Use {provider}'s",
  "title.images.allLanguages": "All languages",
  // An image's size in pixels.
  "title.images.size": "{width} × {height}",
  "title.images.noText": "No text",
  "title.images.use": "Use this image",
  "title.images.inUse": "In use",
  "title.images.empty": "{provider} has none to pick from.",
  "title.images.emptyLanguage":
    "{provider} has none in the library's language, in English, or without text. Turn on All languages for the rest.",
  "title.images.unmatched":
    "{provider} has no match for this title, so there's nothing to pick from. Fix the match, or upload an image.",
  "title.images.noProvider":
    "This library has no metadata provider, so there's nothing to pick from. Upload an image instead.",
  "title.images.error": "Couldn't change the image",
  "title.images.loadError": "Couldn't load the images. {error}",

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
