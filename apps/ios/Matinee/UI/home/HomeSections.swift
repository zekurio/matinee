import MatineeCore
import MatineeKit
import SwiftUI

/*
 * HomeSections.kt and the sections of HomeScreen.kt: Continue watching and
 * Next up, a library's newest titles, and what an account with no library
 * is told. `RailState`, `railState`, and `failedOutright` are MatineeCore's
 * (Home/), where they're tested.
 *
 * What failed is left out, as on the web and Android, and loads again when
 * Home comes back; only a Home with nothing at all says so, with an
 * `ErrorBox`. Not reaching the server is the cloud in Home's header.
 */

/// Continue watching or Next up. Loading and empty show nothing: an empty
/// one is the usual case for someone not in the middle of anything, and a
/// placeholder there would only fold away. A failed one is left out too.
struct EpisodeSection: View {
  let title: String
  let loader: Loader<[MediaItem]>

  var body: some View {
    if case .shown(let items) = railState(loader.state) {
      Rail(title) {
        ForEach(items, id: \.id) { item in
          RailItem(.landscape) { EpisodeCard(item) }
        }
      }
      // By the rail as well: Continue watching and Next up can start with the
      // same file, as one just started moves from one to the other, and two
      // views with one id in Home's lazy stack show as one, the other gone.
      // One that moved to the front starts the row there again.
      .id("\(title)\n\(items.first?.id ?? "")")
    }
  }
}

/// Home's shelves, each loading on its own: the ones that can't reach the
/// server, for the cloud in Home's header, and a pull to refresh, which
/// each fetches again on.
@Observable final class HomeShelves {
  private(set) var loaders: [String: any Reloadable] = [:]
  /// Moves with each pull to refresh.
  private(set) var pulls = 0

  func refresh() { pulls += 1 }

  func track(_ id: String, _ loader: (any Reloadable)?) { loaders[id] = loader }
}

/// A library's newest titles, its heading a link to the whole library.
/// One that failed is left out. It refreshes when Home comes back, and when
/// it scrolls back into view once the last answer is old enough.
struct LibraryShelf: View {
  let library: Library
  let shelves: HomeShelves
  @State private var entries = Loader<[ShelfEntry]>()
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter

  var body: some View {
    let title = Str.browseRecentlyAdded(library.name)
    let id = library.id
    let onTitleTap: (() -> Void)? = library.itemCount > 0 ? { nav.library(id, TitleSort.recent) } : nil
    Group {
      switch railState(entries.state) {
      case .loading: RailSkeleton(title: title, art: .poster, onTitleTap: onTitleTap)
      case .failed: EmptyView()
      case .empty:
        VStack(alignment: .leading, spacing: Space.s3) {
          SectionTitle(title, action: onTitleTap)
          Text(Str.browseEmptyShelf).textStyle(.sm).foregroundStyle(palette.mutedForeground)
            .padding(.vertical, Space.s6)
        }
        .padding(.horizontal, gutter)
        .frame(maxWidth: .infinity, alignment: .leading)
      case .shown(let shown):
        Rail(title, onTitleTap: onTitleTap) {
          ForEach(shown, id: \.title.id) { entry in
            RailItem(.poster) { ShelfCard(entry) }
          }
        }
      }
    }
    .loads(entries) { api in try await api.media.shelf(libraryId: id, limit: 12) }
    .onAppear { shelves.track(id, entries) }
    .onDisappear { shelves.track(id, nil) }
    .onChange(of: shelves.pulls) { entries.reload() }
  }
}

/// What Home says to an account that may open no library: an admin, that
/// there are none yet and where to add one; anyone else, that none is open
/// to them yet.
struct NoLibrariesNote: View {
  @Environment(\.user) private var user

  var body: some View {
    switch NoLibraries(admin: user?.isAdmin == true) {
    case .noneExist:
      EmptyState(icon: .folderPlus, title: Str.browseHomeNoLibraries, description: Str.browseHomeNoLibrariesAdmin)
        .padding(.vertical, Space.s8)
    case .noneOpen:
      EmptyState(icon: .popcorn, title: Str.browseHomeNothingYet, description: Str.browseHomeNothingYetDescription)
        .padding(.vertical, Space.s8)
    }
  }
}

/// One of Home's recommendation rows, of titles on the server the viewer
/// hasn't watched: "Recommended for you", or what's like something they
/// watched. `shown` is its titles not marked "Not interested"; Home lists
/// the row only with some (`homeRows`), and loading, failing, and having
/// none show nothing: a new account has none, and a placeholder would only
/// fold away. A long press on a card offers "Not interested", which takes
/// it off at once.
struct RecommendationRail: View {
  let rail: HomeRecommendationRail
  let shown: [RecommendedTitle]

  var body: some View {
    Rail(name(rail.name)) {
      ForEach(shown, id: \.title.id) { pick in
        RailItem(.poster) {
          PosterCard(pick.title, detail: formatYear(pick.title.year), recommended: pick.ref)
        }
      }
    }
  }

  private func name(_ name: RecommendationRailName) -> String {
    switch name {
    case .forYou: Str.webDiscoverRailForYou
    case .becauseWatched(let title): Str.webDiscoverRailBecauseWatched(title)
    }
  }
}
