import type { TranslationOf } from "../../catalog"
import type source from "../en/profile"

export default {
  "profile.loadFailed": "Dieses Profil konnte nicht geladen werden",
  "profile.backHome": "Zurück zur Startseite",
  "profile.private": "{name} hält das Profil privat",
  "profile.recent": "Zuletzt geschaut",

  "profile.admin": "Admin",
  "profile.joined": "Dabei seit {date}",
  "profile.edit": "Profil bearbeiten",
  "profile.shareTitle": "{name} auf Matinee",
  "profile.shareFailed": "Dieses Profil konnte nicht geteilt werden",
  "profile.share": "Teilen",
  "profile.copyLink": "Link kopieren",
  "profile.copied": "Link kopiert",
  "profile.tryAgain": "Erneut versuchen",

  "profile.favorites": "Favoriten",
  "profile.noFavorites": "Noch keine Favoriten",
  "profile.noFavoritesHint":
    "Tippe bei einem Titel auf das Herz, um ihn hier zu speichern.",

  "profile.favorites.shows": "Serien",
  "profile.favorites.seasons": "Staffeln",
  "profile.favorites.episodes": "Folgen",
  "profile.favorites.movies": "Filme",
  "profile.favorites.loadFailed":
    "Diese Favoriten konnten nicht geladen werden",
  "profile.favorites.hidden": "{name} teilt die Favoriten nicht",
  "profile.favorites.otherEmpty": "{name} hat noch keine Favoriten",

  "profile.statistics": "Statistiken",
  "profile.stoppedSharing": "{name} teilt die Statistiken nicht mehr",
  "profile.selfEmpty": "Noch nichts geschaut",
  "profile.selfEmptyHint":
    "Deine Sehzeit und deine meistgeschauten Titel erscheinen hier.",
  "profile.findSomething": "Etwas zum Schauen finden",
  "profile.otherEmpty": "{name} hat noch nichts geschaut",
  "profile.otherEmptyHint":
    "Die Statistiken erscheinen hier nach der ersten Wiedergabe.",
  "profile.nothingWatched": "Nichts geschaut {period}",
  "profile.showAllTime": "Gesamten Zeitraum zeigen",
} satisfies TranslationOf<typeof source>
