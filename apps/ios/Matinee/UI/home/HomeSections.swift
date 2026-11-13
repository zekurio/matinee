import MatineeCore
import SwiftUI

/*
 * HomeSections.kt and the sections of HomeScreen.kt: Continue watching and
 * Next up, a library's newest titles, and the note for an account with no
 * library. `RailState`, `railState`, and `failedOutright` are MatineeCore's
 * (Home/), where they're tested; `Notice`, `RailFailure`, and
 * `RailSkeleton` are shared, in components/States.swift.
 */

/// Continue watching or Next up. Loading and empty show nothing: an empty
/// one is the usual case for someone not in the middle of anything, and a
/// placeholder there would only fold away. A failed one says so.
struct EpisodeSection: View {
  let title: String
  let failed: String
  let loader: Loader<[MediaItem]>

  var body: some View {
    switch railState(loader.state) {
    case .loading, .empty: EmptyView()
    case .failed(let message, let disconnected):
      RailFailure(
        title: title, headline: failed, message: message, retrying: loader.refreshing,
        disconnected: disconnected, onRetry: loader.reload)
    case .shown(let items): EpisodeRail(title: title, items: items)
    }
  }
}

/// A row of files to start or resume. One that moved to the front starts the row there again.
private struct EpisodeRail: View {
  let title: String
  let items: [MediaItem]

  var body: some View {
    Rail(title) {
      ForEach(items, id: \.id) { item in
        RailItem(.landscape) { EpisodeCard(item) }
      }
    }
    .id(items.first?.id)
  }
}

/// Home's shelves: those whose refresh failed while they're on screen, for
/// the one notice that says so, and a pull to refresh, which each fetches on.
@Observable final class HomeShelves {
  var stale: [String: any Reloadable] = [:]
  /// Moves with each pull to refresh.
  private(set) var pulls = 0

  func refresh() { pulls += 1 }
}

/// A library's newest titles. One whose refresh failed puts itself in
/// `shelves` while it's on screen. It refreshes when Home comes back, and
/// when it scrolls back into view once the last answer is old enough.
struct LibraryShelf: View {
  let library: Library
  let shelves: HomeShelves
  @State private var entries = Loader<[ShelfEntry]>()
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let title = Str.browseRecentlyAdded(library.name)
    let id = library.id
    let onTitleTap: (() -> Void)? = library.itemCount > 0 ? { nav.library(id, TitleSort.recent) } : nil
    Group {
      switch railState(entries.state) {
      case .loading: RailSkeleton(title: title, art: .poster, onTitleTap: onTitleTap)
      case .failed(let message, let disconnected):
        RailFailure(
          title: title, headline: Str.homeShelfFailed, message: message, retrying: entries.refreshing,
          disconnected: disconnected, onRetry: entries.reload)
      case .empty:
        Rail(title, onTitleTap: onTitleTap) {
          Text(Str.browseEmptyShelf).textStyle(.bodyMedium).foregroundStyle(palette.muted)
            .padding(.vertical, 24)
        }
      case .shown(let shown):
        Rail(title, onTitleTap: onTitleTap) {
          ForEach(shown, id: \.title.id) { entry in
            RailItem(.poster) { ShelfCard(entry) }
          }
        }
      }
    }
    .loads(entries) { api in try await api.media.shelf(libraryId: id, limit: 12) }
    .onChange(of: entries.refreshError != nil, initial: true) { _, failed in
      if failed { shelves.stale[id] = entries } else { shelves.stale[id] = nil }
    }
    .onChange(of: shelves.pulls) { entries.reload() }
    .onDisappear { shelves.stale[id] = nil }
  }
}

/// What Home and Media say to an account that may open no library.
struct NoLibrariesNote: View {
  @Environment(\.user) private var user

  var body: some View {
    switch NoLibraries(admin: user?.isAdmin == true) {
    case .noneExist: EmptyState(.folderPlus, Str.browseHomeNoLibraries, Str.browseHomeNoLibrariesAdmin)
    case .noneOpen: EmptyState(.popcorn, Str.browseHomeNothingYet, Str.browseHomeNothingYetDescription)
    }
  }
}
