import Foundation

/*
 * ProfileScreen.kt's favorites rail and FavoritesData.kt's
 * `ViewerState.isFavorite(Favorite)`: the profile sends its favorites of
 * every kind in one list, newest first, and a heart taken off here in
 * this run takes the card off at once, before the profile is fetched
 * again. What the person marked here overrides what the server sent.
 */

extension ViewerState {
  /// Whether `favorite` is still one, by the marks made here over what the
  /// server sent: a movie or show by its title, a season by its number (the
  /// files without a season number aren't a season to mark, so never), an
  /// episode by itself.
  public func isFavorite(_ favorite: Favorite) -> Bool {
    switch favorite {
    case .movie(let movie): isFavorite(movie.title)
    case .show(let show): isFavorite(show.title)
    case .showSeason(let entry):
      entry.season.number.map { isSeasonFavorite(entry.title, number: $0, fallback: entry.season.favorite) } ?? false
    case .episode(let episode): isFavorite(episode.item)
    }
  }
}

/// The profile's favorites rail: the server's list in its order, less the
/// ones taken off here since. Without `viewer`, as in a preview, the list
/// as it came.
@MainActor public func shownFavorites(_ profile: Profile, viewer: ViewerState?) -> [Favorite] {
  let favorites = profile.favorites ?? []
  guard let viewer else { return favorites }
  return favorites.filter(viewer.isFavorite)
}
