/// Navigation payloads from Android Nav.kt, independent of any UI navigator.
/// Existing app-target routes remain available during screen replacement.
public enum CoreRoute: Codable, Hashable, Sendable {
  case home, media, favorites, search, recent, profile, settings, linkDevice, downloads
  case library(id: String, sort: String? = nil)
  case kind(String)
  case title(String)
  /// Nil represents Android's -1 sentinel for unnumbered files.
  case season(titleId: String, number: Int?)
  case episode(String)
  case person(name: String, tmdbId: String? = nil)
  case browse(genre: String? = nil, studio: String? = nil)
  case settingsPage(String)
  case downloadsShow(String)
  case identify(titleId: String)
  case catalog(kind: String, provider: String, providerId: String, library: String? = nil)
  case discoverRail(String)
  case catalogBrowse(kind: String)
  case asked
  case requests(list: String = "waiting")
  /// Nil represents Android's -1 sentinel for an absent season or episode.
  case images(titleId: String, season: Int? = nil, episode: Int? = nil)
  case libraryEditor(id: String? = nil)
  case folderPicker(start: String? = nil, added: [String] = [])
}
