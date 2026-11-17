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
  /// The featured title in view, by its id: the phone's cards and the iPad's
  /// banner each open on it and keep it up to date, so an iPad's window that
  /// crosses between the two keeps the same title in view.
  @State private var featured: String?
  @State private var position = ScrollPosition(edge: .top)
  @State private var scroll = HomeScroll()
  @Environment(\.shellStyle) private var style
  @Environment(\.actions) private var actions
  @Environment(\.tabReselected) private var reselected

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
    let moved: (String, Double) -> Void = { id, top in rowMoved(id, top: top) }
    let stale: [any Reloadable] = loaders.all + Array(shelves.loaders.values)
    let slides = cardSlides
    let spacing = style == .tablet ? Space.s10 : Space.s6
    let header = HomeHeaderPlacement(style.layout, cards: slides != nil, rowSpacing: spacing)
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: spacing) {
        // An iPad in a regular width opens with the web's banner
        // (Hero.swift); the iPhone, and an iPad in a narrow split, with the cards.
        if style == .tablet {
          HomeBanner(loaders: loaders, showing: $featured) { HomeHeader(stale: stale) }
        } else if let slides {
          cards(slides)
        }
        if libraries.state.value?.isEmpty == true {
          NoLibrariesNote()
        } else {
          ForEach(rows) { row in
            Group {
              switch row {
              case .continueWatching: EpisodeSection(title: Str.browseContinueWatching, loader: loaders.resume)
              case .nextUp: EpisodeSection(title: Str.browseNextUp, loader: loaders.nextUp)
              case .recommended(let rail, let shown): RecommendationRail(rail: rail, shown: shown)
              // What the viewer asked for, on its way or lately come, as Android's Home has it.
              case .asked: AskedRow(items: asked.state.value?.items ?? [], fresh: true)
              }
            }
            .homeRow(row.id, moved: moved)
          }
          switch libraries.state {
          case .loading: RailSkeleton(title: nil, art: .poster)
          case .failed: EmptyView()
          case .ready(let list):
            ForEach(list, id: \.id) { library in
              LibraryShelf(library: library, shelves: shelves).homeRow("library-\(library.id)", moved: moved)
            }
          }
        }
      }
      // Inside the rows' space, so their tops count from where the page starts.
      .padding(.top, header.gap)
      .coordinateSpace(.named(HomeScroll.rows))
      .padding(.bottom, Space.s6)
    }
    .scrollPosition($position)
    // A phone's header stays put while the page scrolls on behind it, the
    // cards 8 under it at rest and the pull's spinner under it too; an
    // iPad's rides on the banner. The same page either way, for the crossing.
    .fixedHeader(hidden: !header.pinned, backdrop: header.backdrop.kit) { HomeHeader(stale: stale) }
    .onScrollGeometryChange(for: Double.self) { geometry in
      geometry.contentOffset.y + geometry.contentInsets.top
    } action: { [scroll] _, offset in
      scroll.offset = offset
    }
    // Where the person leaves it: by then the rows are laid out as they see them.
    .onScrollPhaseChange { [scroll] _, phase in
      if phase == .idle { scroll.anchor = ScrollAnchor(offset: scroll.offset, tops: scroll.tops) }
    }
    // Back to the top when the tab is picked again on Home.
    .onChange(of: reselected) { toTop() }
    // An iPad's window crossing between the shells: the banner and the cards
    // differ in height, so the row at the top is held there, not the points.
    .onChange(of: style) { holdRow() }
    #if DEBUG
      // -dev.home.scroll 400: that far down once Home has loaded, to see it scrolled in a screenshot.
      .task {
        guard let y = Double(UserDefaults.standard.string(forKey: "dev.home.scroll") ?? "") else { return }
        try? await Task.sleep(for: .seconds(3))
        position.scrollTo(y: y)
      }
    #endif
    .loadsHomeAsked(asked)
    .refreshable { await refresh() }
  }

  /// The featured titles under a phone's header: their slides, none while
  /// they load, when their place shows, and nil with none or when they
  /// failed, when the rows start under the header.
  private var cardSlides: [FeaturedTitle]? {
    switch loaders.featured.state {
    case .loading: return []
    case .failed: return nil
    case .ready(let featured):
      let slides = HomeCarouselDevData.slides(
        HomeDevData.fill(featured, standIns: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? [])))
      return slides.isEmpty ? nil : slides
    }
  }

  /// The featured titles' cards, or while they load, their place.
  @ViewBuilder private func cards(_ slides: [FeaturedTitle]) -> some View {
    if slides.isEmpty {
      HomeCarouselSkeleton()
    } else {
      // Other titles start the row at its first card again.
      HomeCarousel(slides: slides, showing: $featured).id(slides.map(\.title.id))
    }
  }

  /// Keeps the row at the top where the person left it while the shell
  /// changes over it, as its rows settle at their new heights. Its place is
  /// the one from before: the rows are already laid out anew by the time
  /// the change is seen here.
  private func holdRow() {
    guard let anchor = scroll.anchor else { return }
    scroll.held = anchor
    scroll.holds += 1
    let hold = scroll.holds
    Task { await release(hold) }
  }

  private func toTop() {
    scroll.anchor = nil
    withMotion(Motion.move) { position.scrollTo(edge: .top) }
  }

  /// A row's top moved: where the row at the top is held, the page follows it.
  private func rowMoved(_ id: String, top: Double) {
    scroll.tops[id] = top
    if let held = scroll.held, held.row == id { position.scrollTo(y: held.offset(top: top)) }
  }

  /// Lets go of the row once the rows have settled, putting it in place a
  /// last time in case its top didn't move at all.
  private func release(_ hold: Int) async {
    try? await Task.sleep(for: HomeScroll.settling)
    guard hold == scroll.holds, let held = scroll.held else { return }
    if let top = scroll.tops[held.row] { position.scrollTo(y: held.offset(top: top)) }
    scroll.held = nil
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

/// Where Home is scrolled, for holding the row at its top in place while
/// the shell changes over it (`ScrollAnchor`). Not observed: it changes as
/// the page scrolls, and nothing draws from it.
private final class HomeScroll {
  /// How far from rest the page is scrolled.
  var offset: Double = 0
  /// Each row laid out so far, by its top from the top of the page: the
  /// rows under the featured titles, which aren't one, since they're what
  /// changes height.
  var tops: [String: Double] = [:]
  /// The row at the top where the page last came to rest.
  var anchor: ScrollAnchor?
  /// The row held at the top while the rows settle.
  var held: ScrollAnchor?
  /// Counts holds, so only the latest lets go.
  var holds = 0

  /// The rows' coordinate space.
  static let rows = "home.rows"
  /// How long the rows take to settle at their new heights.
  static let settling: Duration = .milliseconds(600)
}

extension View {
  /// One of Home's rows, which tells Home where its top is among them.
  fileprivate func homeRow(_ id: String, moved: @escaping (String, Double) -> Void) -> some View {
    onGeometryChange(for: Double.self) { proxy in
      proxy.frame(in: .named(HomeScroll.rows)).minY
    } action: { top in
      moved(id, top)
    }
  }
}

/// Home's header. A phone's, always, staying put above the page: the logo,
/// the cloud while the server can't be reached, search, and the account
/// (`AppHeader`). An iPad's tabs have the logo, search, and the account, so
/// there it rides on the banner, showing only with the cloud, and is a
/// little room under the tabs otherwise.
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
