import MatineeCore
import MatineeKit
import SwiftUI

/*
 * FavoritesScreen.kt and FavoritesData.kt: the titles and episodes the
 * person marked as favorites. Which still show is MatineeCore's
 * `FavoritesFilter` (Home/).
 */

/// At most this many of each, newest first.
private let LIMIT = 200

/// The titles and episodes the person marked as favorites, newest first.
struct FavoritesScreen: View {
  @State private var titles = Loader<[TitleSummary]>()
  @State private var items = Loader<[MediaItem]>()
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    Group {
      if case .failed(let message, let disconnected) = titles.state {
        ErrorBox(Str.favoritesLoadFailed, message, disconnected: disconnected, onRetry: titles.reload)
      } else if let viewer, let shows = FavoritesFilter.titles(titles.state, viewer) {
        let episodes = FavoritesFilter.episodes(items.state, viewer)
        if shows.isEmpty && episodes.isEmpty {
          ScrollView { FavoritesEmpty() }.refreshable { await refresh() }
        } else {
          list(shows: shows, episodes: episodes)
        }
      } else {
        LoadingBox()
      }
    }
    .legacyTopBar(Str.favoritesTitle)
    .loads(titles) { api in
      guard let username = await session.lastUser?.username,
        let saved = try await api.profiles.favorites(username: username, limit: LIMIT) else { return [] }
      return saved.shows + saved.movies
    }
    .loads(items) { api in
      guard let username = await session.lastUser?.username else { return [] }
      return try await api.profiles.favorites(username: username, limit: LIMIT)?.episodes ?? []
    }
  }

  private func list(shows: [TitleSummary], episodes: [MediaItem]) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        if !shows.isEmpty && !episodes.isEmpty {
          SectionTitle(Str.favoritesTitles).padding(.horizontal, Space.gutter)
        }
        if !shows.isEmpty {
          CardGrid {
            ForEach(shows, id: \.id) { title in PosterCard(title, detail: formatYear(title.year)) }
          }
        }
        if !episodes.isEmpty {
          SectionTitle(Str.favoritesEpisodes)
            .padding(.horizontal, Space.gutter)
            .padding(.top, shows.isEmpty ? 0 : 8)
          CardGrid {
            ForEach(episodes, id: \.id) { item in EpisodeCard(item) }
          }
        }
      }
      .padding(.top, 8)
      .padding(.bottom, 32)
    }
    .refreshable { await refresh() }
  }

  private func refresh() async {
    titles.reload()
    items.reload()
    await titles.settled()
    await items.settled()
  }
}

private struct FavoritesEmpty: View {
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      LucideIcon(.heart, size: 28, tint: palette.mutedForeground)
      Gap(12)
      Text(Str.favoritesEmpty).textStyle(.base, weight: .semibold).multilineTextAlignment(.center)
      Gap(4)
      Text(Str.favoritesEmptyHint).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 32)
    .padding(.vertical, 64)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}
