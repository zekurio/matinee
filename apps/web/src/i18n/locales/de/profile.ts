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
  "profile.favoriteEpisodes": "Lieblingsfolgen",
  "profile.noFavorites": "Noch keine Favoriten",
  "profile.noFavoritesHint":
    "Tippe bei einem Film, einer Serie oder einer Folge auf das Herz, um sie hier zu sammeln.",

  "profile.statistics": "Statistiken",
  "profile.stoppedSharing": "{name} teilt die Statistiken nicht mehr",
  "profile.selfEmpty": "Deine Statistiken füllen sich, während du schaust",
  "profile.selfEmptyHint":
    "Sehzeit und deine meistgeschauten Titel erscheinen hier nach deiner ersten Wiedergabe.",
  "profile.findSomething": "Etwas zum Schauen finden",
  "profile.otherEmpty": "{name} hat noch nichts geschaut",
  "profile.otherEmptyHint":
    "Die Statistiken erscheinen hier nach der ersten Wiedergabe.",
  "profile.nothingWatched": "Nichts geschaut {period}",
  "profile.showAllTime": "Gesamten Zeitraum zeigen",
} satisfies TranslationOf<typeof source>
