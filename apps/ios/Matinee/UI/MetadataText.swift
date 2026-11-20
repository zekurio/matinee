import Foundation
import MatineeCore

/*
 * MetadataText.kt: the server's words for what metadata providers name in
 * their own, genre keys, title statuses, and a client's browser and
 * system, in the app's language. The messages are the web's, through
 * Android's strings_web_metadata.xml.
 */

/// A genre key's words, or nil for a provider's own name the server has no key for.
private func genreWords(_ genre: String) -> String? {
  switch genre {
  case "action": Str.webMetadataGenreAction
  case "adventure": Str.webMetadataGenreAdventure
  case "animation": Str.webMetadataGenreAnimation
  case "anime": Str.webMetadataGenreAnime
  case "awards-show": Str.webMetadataGenreAwardsShow
  case "children": Str.webMetadataGenreChildren
  case "comedy": Str.webMetadataGenreComedy
  case "crime": Str.webMetadataGenreCrime
  case "documentary": Str.webMetadataGenreDocumentary
  case "drama": Str.webMetadataGenreDrama
  case "eastern": Str.webMetadataGenreEastern
  case "family": Str.webMetadataGenreFamily
  case "fantasy": Str.webMetadataGenreFantasy
  case "food": Str.webMetadataGenreFood
  case "game-show": Str.webMetadataGenreGameShow
  case "history": Str.webMetadataGenreHistory
  case "home-and-garden": Str.webMetadataGenreHomeAndGarden
  case "horror": Str.webMetadataGenreHorror
  case "indie": Str.webMetadataGenreIndie
  case "martial-arts": Str.webMetadataGenreMartialArts
  case "mini-series": Str.webMetadataGenreMiniSeries
  case "music": Str.webMetadataGenreMusic
  case "musical": Str.webMetadataGenreMusical
  case "mystery": Str.webMetadataGenreMystery
  case "news": Str.webMetadataGenreNews
  case "podcast": Str.webMetadataGenrePodcast
  case "politics": Str.webMetadataGenrePolitics
  case "reality": Str.webMetadataGenreReality
  case "romance": Str.webMetadataGenreRomance
  case "science-fiction": Str.webMetadataGenreScienceFiction
  case "soap": Str.webMetadataGenreSoap
  case "special-interest": Str.webMetadataGenreSpecialInterest
  case "sport": Str.webMetadataGenreSport
  case "suspense": Str.webMetadataGenreSuspense
  case "talk-show": Str.webMetadataGenreTalkShow
  case "thriller": Str.webMetadataGenreThriller
  case "travel": Str.webMetadataGenreTravel
  case "tv-movie": Str.webMetadataGenreTvMovie
  case "war": Str.webMetadataGenreWar
  case "western": Str.webMetadataGenreWestern
  default: nil
  }
}

/// The genre keys the app has words for, in the contract's order.
private let genreKeys = [
  "action",
  "adventure",
  "animation",
  "anime",
  "awards-show",
  "children",
  "comedy",
  "crime",
  "documentary",
  "drama",
  "eastern",
  "family",
  "fantasy",
  "food",
  "game-show",
  "history",
  "home-and-garden",
  "horror",
  "indie",
  "martial-arts",
  "mini-series",
  "music",
  "musical",
  "mystery",
  "news",
  "podcast",
  "politics",
  "reality",
  "romance",
  "science-fiction",
  "soap",
  "special-interest",
  "sport",
  "suspense",
  "talk-show",
  "thriller",
  "travel",
  "tv-movie",
  "war",
  "western",
]

/// A genre's name: a key's in the app's language, or the provider's own.
func genreName(_ genre: String) -> String {
  genreWords(genre) ?? genre
}

/// Genres in the app language's alphabetical order.
func byGenreName<T>(_ list: [T], _ genre: (T) -> String) -> [T] {
  list.sorted { genreName(genre($0)).localizedStandardCompare(genreName(genre($1))) == .orderedAscending }
}

/// The genre keys whose names in the app's language contain `query`, comma separated, for the search to send.
func genresNamed(_ query: String) -> String? {
  let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines)
  if wanted.isEmpty { return nil }
  let keys = genreKeys.filter { genreName($0).localizedCaseInsensitiveContains(wanted) }
  return keys.isEmpty ? nil : keys.joined(separator: ",")
}

/// A title's status in the app's language; nil for one this app doesn't know.
func titleStatusName(_ status: String?) -> String? {
  switch status ?? "" {
  case "continuing": Str.webMetadataStatusContinuing
  case "ended": Str.webMetadataStatusEnded
  case "canceled": Str.webMetadataStatusCanceled
  case "upcoming": Str.webMetadataStatusUpcoming
  case "in-production": Str.webMetadataStatusInProduction
  case "pilot": Str.webMetadataStatusPilot
  case "released": Str.webMetadataStatusReleased
  default: nil
  }
}

/// Like "Firefox on Linux", or whichever of the two is known.
func clientName(_ client: ClientAgent) -> String? {
  if let browser = client.browser, let system = client.system {
    return Str.webMetadataClient(browser, system)
  }
  return client.browser ?? client.system
}
