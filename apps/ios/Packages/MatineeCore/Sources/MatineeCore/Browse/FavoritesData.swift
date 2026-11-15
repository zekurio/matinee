import Foundation

public let FAVORITES_LIMIT = 200

public func loadFavorites(_ api: MatineeApi, username: String) async throws -> Favorites {
  try await api.profiles.favorites(username: username, limit: FAVORITES_LIMIT)
    ?? Favorites(shows: [], seasons: [], episodes: [], movies: [])
}

extension Favorites {
  public var isEmpty: Bool {
    shows.isEmpty && seasons.isEmpty && episodes.isEmpty && movies.isEmpty
  }

  /// Applies live marks without reordering the server's newest-first lists.
  /// A season predicate is supplied by the viewer-state owner, independently
  /// of the title's mark. Removing a show must not remove its favorite seasons.
  public func filtering(
    title: (TitleSummary) -> Bool,
    season: (TitleSummary, Season) -> Bool,
    episode: (MediaItem) -> Bool
  ) -> Favorites {
    Favorites(shows: shows.filter(title), seasons: seasons.filter { season($0.title, $0.season) },
      episodes: episodes.filter(episode), movies: movies.filter(title))
  }
}

extension Favorite {
  /// Dispatches all four kinds through the same live-mark predicates.
  public func isFavorite(
    title: (TitleSummary) -> Bool,
    season: (TitleSummary, Season) -> Bool,
    episode: (MediaItem) -> Bool
  ) -> Bool {
    switch self {
    case .movie(let entry): title(entry.title)
    case .show(let entry): title(entry.title)
    case .showSeason(let entry): season(entry.title, entry.season)
    case .episode(let entry): episode(entry.item)
    }
  }
}
