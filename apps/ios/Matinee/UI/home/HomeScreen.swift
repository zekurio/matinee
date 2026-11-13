import MatineeCore
import SwiftUI

/*
 * HomeScreen.kt: the featured banner, Continue watching, Next up, and what
 * each library got last. The loads are HomeData.swift's, the banner
 * Hero.swift's, and the sections HomeSections.swift's.
 */

/// Home: the featured banner, Continue watching, Next up, and what each
/// library got last. Offline mode leaves the server alone: Home is the downloads.
struct HomeScreen: View {
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      if offline {
        OfflineHomeScreen()
      } else {
        OnlineHomeScreen()
      }
    }
    // A tab's first page, which the stack doesn't paint as it does the pages over it.
    .background(palette.background.ignoresSafeArea())
  }
}

private struct OnlineHomeScreen: View {
  @State private var loaders = HomeLoaders()
  @State private var shelves = HomeShelves()
  @Environment(\.windowSize) private var window

  var body: some View {
    GeometryReader { proxy in
      page(topInset: proxy.safeAreaInsets.top)
    }
    .toolbar(.hidden, for: .navigationBar)
    .loadsHome(loaders)
  }

  @ViewBuilder private func page(topInset: CGFloat) -> some View {
    let libraries = loaders.libraries
    if failedOutright(libraries.state, [loaders.resume.state, loaders.nextUp.state, loaders.featured.state]) {
      VStack(spacing: 0) {
        AppHeader()
        if case .failed(let message, let disconnected) = libraries.state {
          ErrorBox(Str.homeFailed, message, disconnected: disconnected) { loaders.all.forEach { $0.reload() } }
        }
      }
    } else {
      content(topInset: topInset)
    }
  }

  private func content(topInset: CGFloat) -> some View {
    let libraries = loaders.libraries
    let stale = loaders.all + Array(shelves.stale.values)
    let staleError = stale.lazy.compactMap(\.refreshError).first
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: 24) {
        banner(topInset: topInset, stale: stale)

        // Other failures to refresh still say what happened; not reaching the server is the header's icon.
        if let staleError, stale.contains(where: { $0.refreshError != nil && !$0.refreshDisconnected }) {
          Notice(Str.loadingStale, staleError, retrying: stale.contains { $0.refreshError != nil && $0.refreshing }) {
            stale.filter { $0.refreshError != nil }.forEach { $0.reload() }
          }
        }

        if libraries.state.value?.isEmpty == true {
          NoLibrariesNote()
        } else {
          EpisodeSection(title: Str.browseContinueWatching, failed: Str.homeContinueFailed, loader: loaders.resume)
          EpisodeSection(title: Str.browseNextUp, failed: Str.homeNextUpFailed, loader: loaders.nextUp)
          switch libraries.state {
          case .loading: RailSkeleton(title: nil, art: .poster)
          case .failed(let message, let disconnected):
            Notice(
              Str.homeLoadFailed, message, retrying: libraries.refreshing, disconnected: disconnected,
              onRetry: libraries.reload)
          case .ready(let list):
            ForEach(list, id: \.id) { library in LibraryShelf(library: library, shelves: shelves) }
          }
        }
      }
      .padding(.bottom, 24)
    }
    .scrollsToTopOnReselect()
    .statusBarScrim()
    .refreshable { await refresh() }
  }

  /// The banner, or Home's header alone without one. Showing what loaded
  /// before while the server can't be reached: the icon, up top.
  @ViewBuilder private func banner(topInset: CGFloat, stale: [any Reloadable]) -> some View {
    let featured = loaders.featured
    let height = heroHeight(window: window.height, wide: isWide(window), topInset: topInset)
    let header = { AppHeader { DisconnectedAction(stale) } }
    switch featured.state {
    case .loading:
      // The art reaches up under the status bar.
      HeroSkeleton(height: height, topInset: topInset, top: header).padding(.top, -topInset)
    case .failed(let message, let disconnected):
      VStack(alignment: .leading, spacing: 8) {
        header()
        Notice(Str.homeFeaturedFailed, message, disconnected: disconnected, onRetry: featured.reload)
      }
    case .ready(let featured):
      let slides = HeroDevArt.fill(featured, standIns: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? []))
      if slides.isEmpty {
        header()
      } else {
        Hero(slides: slides, height: height, topInset: topInset, top: header)
          .id(slides.count)
          .padding(.top, -topInset)
      }
    }
  }

  /// Everything on Home again, as a pull asks; the shelves fetch on their own.
  private func refresh() async {
    loaders.all.forEach { $0.reload() }
    shelves.refresh()
    // All four are out at once already; this only waits for the last.
    await loaders.libraries.settled()
    await loaders.resume.settled()
    await loaders.nextUp.settled()
    await loaders.featured.settled()
  }
}
