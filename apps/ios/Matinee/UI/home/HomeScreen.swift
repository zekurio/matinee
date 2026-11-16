import MatineeCore
import MatineeKit
import SwiftUI

/*
 * HomeScreen.kt, after the web's home.tsx: the featured carousel, Continue
 * watching, Next up, the recommendation rows, My requests, and what each
 * library got last. The loads are HomeData.swift's, the carousel
 * HomeCarousel.swift's, and the sections HomeSections.swift's; which rows
 * show is MatineeCore's `homeRows`. Offline, Home is the downloads
 * (OfflineHome.swift).
 *
 * This is the pattern a screen follows (Matinee/UI/README.md): its loads in
 * a class the screen holds in `@State`, `.loads` for each, the states drawn
 * from MatineeCore's helpers, components from components/, and the kit for
 * everything with a look.
 */

/// Home: the featured titles, what to watch next, what the viewer might
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
    // Home draws its own top: its header, the logo on a phone.
    .hidesSystemNavigationBar()
  }
}

private struct OnlineHomeScreen: View {
  @State private var loaders = HomeLoaders()
  @State private var shelves = HomeShelves()
  /// My requests, loaded here rather than in its row, so an empty one is left out.
  @State private var asked = Loader<RequestPage>()
  @Environment(\.shellStyle) private var style
  @Environment(\.actions) private var actions

  var body: some View {
    page
      .loadsHome(loaders)
    #if DEBUG
      .onChange(of: standIns, initial: true) { HomeDevData.standIns.titles = standIns }
    #endif
  }

  @ViewBuilder private var page: some View {
    let libraries = loaders.libraries
    if failedOutright(libraries.state, [loaders.resume.state, loaders.nextUp.state, loaders.featured.state]) {
      if case .failed(let message, let disconnected) = libraries.state {
        ErrorBox(Str.homeFailed, message, disconnected: disconnected) { loaders.all.forEach { $0.reload() } }
      }
    } else {
      content
    }
  }

  private var content: some View {
    let libraries = loaders.libraries
    // Rows that have nothing are left out of the list rather than drawn
    // empty, since the list puts its gap around every one.
    let rows = homeRows(
      resume: loaders.resume.state, nextUp: loaders.nextUp.state,
      recommendations: homeRecommendations(loaders.recommendations.state.value),
      hiding: actions?.hidden.keys ?? [], asked: asked.state.value?.items ?? [])
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: style == .tablet ? Space.s10 : Space.s6) {
        // An iPad in a regular width opens with the web's banner
        // (Hero.swift); the iPhone, and an iPad in a narrow split, with the cards.
        if style == .tablet {
          let stale: [any Reloadable] = loaders.all + Array(shelves.loaders.values)
          HomeBanner(loaders: loaders) { HomeHeader(stale: stale) }
        } else {
          top
        }
        if libraries.state.value?.isEmpty == true {
          NoLibrariesNote()
        } else {
          ForEach(rows) { row in
            switch row {
            case .continueWatching: EpisodeSection(title: Str.browseContinueWatching, loader: loaders.resume)
            case .nextUp: EpisodeSection(title: Str.browseNextUp, loader: loaders.nextUp)
            case .recommended(let rail, let shown): RecommendationRail(rail: rail, shown: shown)
            // What the viewer asked for, on its way or lately come, as Android's Home has it.
            case .asked: AskedRow(items: asked.state.value?.items ?? [], fresh: true)
            }
          }
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
    // Home's header sits below the status bar, not behind it, so at rest
    // there's nothing to shade, and the frost's feather would blur the
    // logo. It comes in as the page scrolls under the bar.
    .statusBarScrim(fadesIn: true)
    .loadsHomeAsked(asked)
    .refreshable { await refresh() }
  }

  /// Home's header, then the featured titles: their cards, or while they
  /// load, their place. With none, or when they failed, the header alone.
  private var top: some View {
    let stale: [any Reloadable] = loaders.all + Array(shelves.loaders.values)
    return VStack(alignment: .leading, spacing: 0) {
      HomeHeader(stale: stale)
      switch loaders.featured.state {
      case .loading:
        HomeCarouselSkeleton()
      case .failed:
        EmptyView()
      case .ready(let featured):
        let slides = HomeCarouselDevData.slides(
          HomeDevData.fill(
            featured, standIns: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? [])))
        if !slides.isEmpty {
          // Other titles start the row at its first card again.
          HomeCarousel(slides: slides).id(slides.map(\.title.id))
        }
      }
    }
  }

  /// Everything on Home again, as a pull asks; the shelves fetch on their own.
  private func refresh() async {
    loaders.all.forEach { $0.reload() }
    asked.reload()
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

/// Home's header over the featured titles. A phone's, always: the logo,
/// and the cloud while the server can't be reached. An iPad's tabs have the
/// logo, so there it shows only with the cloud, and is a little room under
/// the tabs otherwise.
private struct HomeHeader: View {
  let stale: [any Reloadable]
  @Environment(\.offline) private var offline
  @Environment(\.shellStyle) private var style

  var body: some View {
    if style == .phone || offline || stale.contains(where: { $0.refreshError != nil && $0.refreshDisconnected }) {
      AppHeader { DisconnectedAction(stale) }
    } else {
      Color.clear.frame(height: Space.s4)
    }
  }
}
