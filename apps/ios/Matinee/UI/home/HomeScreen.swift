import MatineeCore
import MatineeKit
import SwiftUI

/*
 * HomeScreen.kt, after the web's home.tsx: the featured banner, Continue
 * watching, Next up, the recommendation rows, and what each library got
 * last. The loads are HomeData.swift's, the banner Hero.swift's, and the
 * sections HomeSections.swift's. Offline, Home is the downloads
 * (OfflineHome.swift).
 *
 * This is the pattern a screen follows (Matinee/UI/README.md): its loads in
 * a class the screen holds in `@State`, `.loads` for each, the states drawn
 * from MatineeCore's helpers, components from components/, and the kit for
 * everything with a look.
 */

/// Home: the featured banner, what to watch next, what the viewer might
/// like, and what each library got last. Offline mode leaves the server
/// alone: Home is the downloads.
struct HomeScreen: View {
  @Environment(\.offline) private var offline

  var body: some View {
    Group {
      if offline {
        OfflineHomeScreen()
      } else {
        OnlineHomeScreen()
      }
    }
    // Home draws its own top: the banner's art reaches under the status bar.
    .hidesSystemNavigationBar()
  }
}

private struct OnlineHomeScreen: View {
  @State private var loaders = HomeLoaders()
  @State private var shelves = HomeShelves()
  @Environment(\.windowSize) private var window
  @Environment(\.shellStyle) private var style

  var body: some View {
    GeometryReader { proxy in
      page(topInset: proxy.safeAreaInsets.top)
    }
    .loadsHome(loaders)
    #if DEBUG
      .onChange(of: standIns, initial: true) { HomeDevData.standIns.titles = standIns }
    #endif
  }

  @ViewBuilder private func page(topInset: CGFloat) -> some View {
    let libraries = loaders.libraries
    if failedOutright(libraries.state, [loaders.resume.state, loaders.nextUp.state, loaders.featured.state]) {
      if case .failed(let message, let disconnected) = libraries.state {
        ErrorBox(Str.homeFailed, message, disconnected: disconnected) { loaders.all.forEach { $0.reload() } }
      }
    } else {
      content(topInset: topInset)
    }
  }

  private func content(topInset: CGFloat) -> some View {
    let libraries = loaders.libraries
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: style == .tablet ? Space.s10 : Space.s6) {
        banner(topInset: topInset)
        if libraries.state.value?.isEmpty == true {
          NoLibrariesNote()
        } else {
          EpisodeSection(title: Str.browseContinueWatching, loader: loaders.resume)
          EpisodeSection(title: Str.browseNextUp, loader: loaders.nextUp)
          RecommendationRails(loader: loaders.recommendations)
          switch libraries.state {
          case .loading: RailSkeleton(title: nil, art: .poster)
          case .failed: EmptyView()
          case .ready(let list):
            ForEach(list, id: \.id) { library in LibraryShelf(library: library, shelves: shelves) }
          }
        }
      }
      .padding(.bottom, Space.s6)
    }
    .scrollsToTopOnReselect()
    .statusBarScrim()
    .refreshable { await refresh() }
  }

  /// The banner, or with none, Home's header alone. Showing what loaded
  /// before while the server can't be reached: the cloud, up top.
  @ViewBuilder private func banner(topInset: CGFloat) -> some View {
    let featured = loaders.featured
    let height = heroHeight(
      window: window.height, wide: heroIsWide(width: window.width, height: window.height), topInset: topInset)
    let stale: [any Reloadable] = loaders.all + Array(shelves.loaders.values)
    let header = { AppHeader(topInset: topInset) { DisconnectedAction(stale) } }
    switch featured.state {
    case .loading:
      // The art reaches up under the status bar, and on an iPad the tabs.
      HeroSkeleton(height: height, top: header).padding(.top, -topInset)
    case .failed:
      NoBanner(stale: stale)
    case .ready(let featured):
      let slides = HomeDevData.fill(
        featured, standIns: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? []))
      if slides.isEmpty {
        NoBanner(stale: stale)
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
    // All of them are out at once already; this only waits for them.
    await loaders.libraries.settled()
    await loaders.resume.settled()
    await loaders.nextUp.settled()
    await loaders.featured.settled()
    await loaders.recommendations.settled()
  }

  #if DEBUG
    /// The titles on Home, for the stand-in recommendations of `-dev.recommendations`.
    private var standIns: [TitleSummary] {
      ((loaders.featured.state.value ?? []).map(\.title)
        + (loaders.resume.state.value ?? []).compactMap(\.title)
        + (loaders.nextUp.state.value ?? []).compactMap(\.title))
    }
  #endif
}

/// Home's top without a banner: room under the status bar, as the web
/// leaves, or the header when it has something to say.
private struct NoBanner: View {
  let stale: [any Reloadable]
  @Environment(\.offline) private var offline

  var body: some View {
    if offline || stale.contains(where: { $0.refreshError != nil && $0.refreshDisconnected }) {
      AppHeader { DisconnectedAction(stale) }
    } else {
      Color.clear.frame(height: Space.s2)
    }
  }
}
