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

extension Favorites {
  /// The lists without what was taken off here or elsewhere, so it goes at
  /// once, before they're fetched again: Android's `FavoritesLoader.lists`.
  /// A season reads its own mark, so taking a show off keeps its seasons.
  @MainActor public func live(_ viewer: ViewerState) -> Favorites {
    filtering(
      title: viewer.isFavorite,
      season: { title, season in
        season.number.map { viewer.isSeasonFavorite(title, number: $0, fallback: season.favorite) } ?? season.favorite
      },
      episode: viewer.isFavorite)
  }
}
