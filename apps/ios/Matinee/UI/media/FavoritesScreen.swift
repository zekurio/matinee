import MatineeCore
import MatineeKit
import SwiftUI

/*
 * FavoritesScreen.kt and FavoritesData.kt, after the web's favorites page:
 * what the person marked as favorites, a rail for each kind, shows,
 * seasons, episodes, then movies, each newest first, and only the kinds
 * that have any. What still shows is MatineeCore's (Browse/FavoritesData.swift),
 * with the marks made here over what the server sent, so one taken off goes
 * at once.
 */

/// What the signed-in person marked as favorites, a rail for each kind.
struct FavoritesScreen: View {
  @State private var favorites = Loader<Favorites>()
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    Group {
      switch favorites.state {
      case .loading: FavoritesSkeleton()
      case .failed(let message, let disconnected):
        ErrorBox(Str.favoritesLoadFailed, message, disconnected: disconnected, onRetry: favorites.reload)
      case .ready(let all):
        let lists = viewer.map { all.live($0) } ?? all
        if lists.isEmpty {
          ScrollView {
            EmptyState(icon: .heart, title: Str.favoritesEmpty, description: Str.favoritesEmptyHint)
              .padding(.vertical, Space.s16)
          }
          .refreshable { await refresh() }
        } else {
          rails(lists)
        }
      }
    }
    .topBar(Str.favoritesTitle) { DisconnectedAction(favorites) }
    .loads(favorites) { api in
      // The server answers nil only for someone who doesn't share them, never for one's own.
      guard let username = await session.lastUser?.username else {
        return Favorites(shows: [], seasons: [], episodes: [], movies: [])
      }
      #if DEBUG
        if BrowseFixtures.on {
          return try await BrowseFixtures.favorites(loadFavorites(api, username: username), api: api)
        }
      #endif
      return try await loadFavorites(api, username: username)
    }
  }

  private func rails(_ lists: Favorites) -> some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: Space.s10) {
        if !lists.shows.isEmpty {
          Rail(Str.favoritesShows) {
            ForEach(lists.shows, id: \.id) { title in
              RailItem(.poster) { PosterCard(title, detail: formatYear(title.year)) }
            }
          }
        }
        if !lists.seasons.isEmpty {
          Rail(Str.favoritesSeasons) {
            ForEach(lists.seasons, id: \.self) { entry in
              RailItem(.poster) { SeasonPosterCard(title: entry.title, season: entry.season) }
            }
          }
        }
        if !lists.episodes.isEmpty {
          Rail(Str.favoritesEpisodes) {
            ForEach(lists.episodes, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } }
          }
        }
        if !lists.movies.isEmpty {
          Rail(Str.favoritesMovies) {
            ForEach(lists.movies, id: \.id) { title in
              RailItem(.poster) { PosterCard(title, detail: formatYear(title.year)) }
            }
          }
        }
      }
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s8)
    }
    .refreshable { await refresh() }
  }

  private func refresh() async {
    favorites.reload()
    await favorites.settled()
  }
}

/// Favorites while they load: two rails of blank posters, as the web's skeleton.
private struct FavoritesSkeleton: View {
  var body: some View {
    VStack(alignment: .leading, spacing: Space.s10) {
      RailSkeleton(title: nil, art: .poster)
      RailSkeleton(title: nil, art: .poster)
    }
    .padding(.top, Space.s2)
    .frame(maxHeight: .infinity, alignment: .top)
  }
}
