import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Nav.kt: the app's pages, as the web app's routes in apps/web/src/routes,
 * and how one opens another. Android keeps one back stack with the tab
 * bar on each tab's first page; iOS gives each tab a stack of its own, as
 * its apps do, so a tab keeps its place while another is open. Pages
 * opened from a tab go on that tab's stack, and cover its tabs, as on
 * Android, Findroid, and the web's phone layout. The player opens over
 * everything, in landscape on a phone, as Android's own PlayerActivity.
 *
 * A phone's tabs are Home, Media, and Downloads, after Findroid's: search
 * is the field at the top of Media, and the profile a page on Home's
 * stack, opened from the account in Home's header. A tablet keeps both as
 * places of their own in the web's bar. Which tabs there are and where
 * each place lands is MatineeCore's (Shell/ShellLayout.swift), where it's
 * tested.
 *
 * Pages don't edit this file except to add their route: they open each
 * other through the environment's `Navigator`.
 */

/// The shell's places, by their first page: Home, Media, and Downloads,
/// the phone's tabs, then the profile and search, which a tablet's bar has
/// too. MatineeCore's `ShellPage`; the Apple TV app has its own `ShellTab`
/// for the shared `Navigator`.
typealias ShellTab = ShellPage

/// A page opened from a tab's first page, with what it needs to load.
/// Android's `…Route` classes, less the tabs' own, which are `ShellTab`.
enum Route: Hashable, Codable {
  /// The signed-in person's profile, on Home's stack on a phone, from the account in Home's header.
  case profile
  case favorites
  /// Everything the signed-in person watched last, a file per title, from the profile.
  case recent
  /// `sort` is a `TitleSort`, or nil for the library's own.
  case library(id: String, sort: String?)
  case title(id: String)
  /// `season` is nil for the files without a season number.
  case season(titleId: String, season: Int?)
  case episode(itemId: String)
  /// `tmdbId` is the provider's, when the credit that opened it has one.
  case person(name: String, tmdbId: String?)
  /// A genre's or a studio's titles, across the server.
  case browse(genre: String?, studio: String?)
  case settings
  /// One of Settings' categories, by `SettingsPage.key`.
  case settingsPage(String)
  /// Signing in a TV or another app by its QR code or code, from Settings' Account page.
  case linkDevice
  /// A downloaded show's episodes.
  case downloadsShow(titleId: String)
  /// An admin picking the provider entry a title is, when its match is wrong or missing.
  case identify(titleId: String)
  /// An admin's image editor for a title, or with a season, a season, and with an episode too, an episode.
  case images(titleId: String, season: Int?, episode: Int?)
  /// An admin adding a library, or with `id`, changing one.
  case libraryEditor(id: String?)
  /// The server's folders, for the library being edited: opening at `start`, with the folders in `added` marked.
  case folderPicker(start: String?, added: [String])
  /// A title the server doesn't have, by its provider's ids; `library`, where an ask would go.
  case catalog(kind: String, provider: String, providerId: String, library: String?)
  /// What the signed-in person asked for, from Home and the profile.
  case asked
  /// An admin's queue of requests, on `list` (a `RequestQueueList`), or Waiting.
  case requests(list: String?)
  /// All the provider's movies or shows, or the viewer's recommendations
  /// of them, with the server's filters; a Discover row's heading opens it
  /// with the row's filters and sort.
  case catalogBrowse(CatalogBrowseStart)
}

/// The player, over everything: a file, and where to start, or nil to go on where the person left off.
struct PlayerRequest: Identifiable, Hashable {
  let itemId: String
  let start: Double?
  let id = UUID()
}

/// What a page hands back to the one under it as it closes, as Android's
/// `savedStateHandle`: the folder picker's folder for the library editor.
/// The page under takes it once it shows again.
@Observable final class NavResults {
  private var values: [String: String] = [:]

  func put(_ key: String, _ value: String) { values[key] = value }

  /// The value left under `key`, once; nil after it was taken.
  func take(_ key: String) -> String? { values.removeValue(forKey: key) }

  func peek(_ key: String) -> String? { values[key] }
}

/// The signed-in shell's navigation: the tab open, each tab's stack, and
/// the player. One per signed-in app, as Android's `Navigator`.
@Observable final class ShellNav {
  private(set) var tab: ShellTab = .home
  /// The tab the bars draw as open: it follows `tab` a moment later, so the
  /// new tab's bar, which appears with the page, slides its pill across.
  private(set) var barTab: ShellTab = .home
  var paths: [ShellTab: [Route]] = [:]
  var player: PlayerRequest?
  /// Moves each time the open tab is picked again on its first page, for
  /// that page to scroll to its top.
  private(set) var reselected: [ShellTab: Int] = [:]
  /// Search was asked for on a phone: Media's field takes the keyboard once
  /// Media shows, and puts this back.
  var searchPending = false
  let results = NavResults()
  let offline: Bool
  /// A phone's tabs or a tablet's, as the shell is laid out now.
  private(set) var layout: ShellLayout = .phone

  init(offline: Bool) { self.offline = offline }

  /// The tabs there are (MatineeCore's `shellTabs`): on a phone Home,
  /// Media, and Downloads; on a tablet the profile and search too.
  /// Offline, only what works without the server.
  var tabs: [ShellTab] { shellTabs(layout, offline: offline) }

  /// The shell's layout changed, as an iPad's split view narrows: the open
  /// place, if the new layout has no tab for it, moves with its pages to
  /// where it lives there, the profile onto Home and search onto Media.
  func setLayout(_ layout: ShellLayout) {
    guard layout != self.layout else { return }
    self.layout = layout
    settle()
  }

  /// Moves the open place to its landing when it isn't a tab now.
  private func settle() {
    guard !tabs.contains(tab) else { return }
    let old = tab
    let landing = shellLanding(old, layout: layout, offline: offline)
    let pages = paths[old] ?? []
    if landing.underProfile {
      paths[landing.tab] = [.profile] + pages
    } else if landing.tab == .media {
      // Search's pages, as a Discover row's Browse, on Media.
      paths[.media] = pages
    }
    paths[old] = []
    tab = landing.tab
    barTab = landing.tab
  }

  /// Opens `page` where it lives (MatineeCore's `shellLanding`): a tab as
  /// `select` does; on a phone, search as Media with its field taking the
  /// keyboard, and the profile as a page on Home.
  func go(_ page: ShellTab) {
    let landing = shellLanding(page, layout: layout, offline: offline)
    if landing.underProfile {
      paths[landing.tab] = [.profile]
      if tab != landing.tab { show(landing.tab) }
    } else if landing.focusesSearch {
      paths[landing.tab] = []
      searchPending = true
      if tab != landing.tab { show(landing.tab) }
    } else {
      select(landing.tab)
    }
  }

  func path(_ tab: ShellTab) -> Binding<[Route]> {
    Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
  }

  /// Picks `tab`. The open one picked again goes back to its first page,
  /// and on its first page, to the page's top.
  func select(_ tab: ShellTab) {
    guard tabs.contains(tab) else { return }
    if tab == self.tab {
      if paths[tab]?.isEmpty == false {
        paths[tab] = []
      } else {
        reselected[tab, default: 0] += 1
      }
    } else {
      show(tab)
    }
  }

  /// Opens `tab`, and moves the bars' pill to it once its page is up.
  private func show(_ tab: ShellTab) {
    self.tab = tab
    DispatchQueue.main.async { [weak self] in
      withMotion(Motion.move) { self?.barTab = tab }
    }
  }

  private var current: [Route] { paths[tab] ?? [] }

  /// Opens `route` on the open tab's stack; `single` leaves it be when it's already on top.
  func push(_ route: Route, single: Bool = false) {
    if single, current.last == route { return }
    paths[tab, default: []].append(route)
  }

  /// Back to `route` when it's on the open tab's stack, the nearest one, else opens it.
  func up(to route: Route) {
    if let index = current.lastIndex(of: route) {
      paths[tab] = Array(current.prefix(through: index))
    } else {
      push(route)
    }
  }

  func back() {
    if !current.isEmpty { paths[tab]?.removeLast() }
  }

  /// Puts `route` in place of the page on top, as a catalog page becomes
  /// the library title's once it arrives.
  func replaceTop(with route: Route) {
    var pages = current
    guard !pages.isEmpty else { return push(route) }
    pages[pages.count - 1] = route
    paths[tab] = pages
  }

  /// Home's first page, from anywhere: Android's pop back to Home, which
  /// sits under every other page there.
  func home() {
    paths[tab] = []
    paths[.home] = []
    show(.home)
  }

  var navigator: Navigator {
    Navigator(
      back: { [weak self] in self?.back() },
      home: { [weak self] in self?.home() },
      tab: { [weak self] in self?.go($0) },
      item: { [weak self] item in
        if let title = item.title, title.kind == TitleKind.movie {
          self?.push(.title(id: title.id))
        } else {
          self?.push(.episode(itemId: item.id))
        }
      },
      titleId: { [weak self] in self?.push(.title(id: $0)) },
      titleUp: { [weak self] in self?.up(to: .title(id: $0)) },
      season: { [weak self] in self?.push(.season(titleId: $0, season: $1)) },
      seasonUp: { [weak self] in self?.up(to: .season(titleId: $0, season: $1)) },
      episode: { [weak self] in self?.push(.episode(itemId: $0)) },
      person: { [weak self] in self?.push(.person(name: $0, tmdbId: $1)) },
      genre: { [weak self] in self?.push(.browse(genre: $0, studio: nil)) },
      studio: { [weak self] in self?.push(.browse(genre: nil, studio: $0)) },
      library: { [weak self] in self?.push(.library(id: $0, sort: $1)) },
      favorites: { [weak self] in self?.push(.favorites, single: true) },
      recent: { [weak self] in self?.push(.recent, single: true) },
      settings: { [weak self] in self?.push(.settings, single: true) },
      settingsPage: { [weak self] in self?.push(.settingsPage($0), single: true) },
      linkDevice: { [weak self] in self?.push(.linkDevice, single: true) },
      libraryEditor: { [weak self] in self?.push(.libraryEditor(id: $0), single: true) },
      folderPicker: { [weak self] in self?.push(.folderPicker(start: $0, added: $1), single: true) },
      backWith: { [weak self] key, value in
        self?.results.put(key, value)
        self?.back()
      },
      identify: { [weak self] in self?.push(.identify(titleId: $0), single: true) },
      images: { [weak self] in
        self?.push(.images(titleId: $0.titleId, season: $0.season, episode: $0.episode), single: true)
      },
      downloadsShow: { [weak self] in self?.push(.downloadsShow(titleId: $0), single: true) },
      play: { [weak self] in self?.player = PlayerRequest(itemId: $0, start: $1) },
      catalog: { [weak self] ref, library in
        self?.push(.catalog(kind: ref.kind, provider: ref.provider, providerId: ref.providerId, library: library))
      },
      arrived: { [weak self] in self?.replaceTop(with: .title(id: $0)) },
      asked: { [weak self] in self?.push(.asked, single: true) },
      requests: { [weak self] in self?.push(.requests(list: $0), single: true) },
      catalogBrowse: { [weak self] in self?.push(.catalogBrowse($0), single: true) }
    )
  }

  // MARK: Restoration

  /// What's kept across launches, as Android's saved back stack: the tab
  /// and each tab's pages, for the account and server they were opened on.
  struct Saved: Codable, Equatable {
    var owner: String
    var tab: ShellTab
    /// Each tab's pages, in the tabs' order, so the same pages always save the same.
    var paths: [Pages]

    struct Pages: Codable, Equatable {
      var tab: ShellTab
      var routes: [Route]
    }
  }

  func saved(owner: String) -> Saved {
    Saved(
      owner: owner, tab: tab,
      paths: ShellTab.allCases.compactMap { tab in
        paths[tab].flatMap { $0.isEmpty ? nil : Saved.Pages(tab: tab, routes: $0) }
      })
  }

  /// Puts back what `data` kept, if it was this `owner`'s. The place that
  /// was open, when this layout has no tab for it, moves to where it lives
  /// here, with its pages.
  func restore(_ data: Data?, owner: String) {
    guard let data, let saved = try? JSONDecoder().decode(Saved.self, from: data), saved.owner == owner
    else { return }
    for pages in saved.paths where tabs.contains(pages.tab) || pages.tab == saved.tab {
      paths[pages.tab] = pages.routes
    }
    tab = saved.tab
    settle()
    barTab = tab
  }
}

/// The first page of each tab.
struct TabRoot: View {
  let tab: ShellTab

  var body: some View {
    switch tab {
    case .home: HomeScreen()
    case .media: MediaScreen()
    case .downloads: DownloadsScreen()
    case .profile: ProfileScreen()
    case .search: SearchScreen()
    }
  }
}

/// The page for `route`.
struct RouteScreen: View {
  let route: Route
  @Environment(ShellNav.self) private var nav

  var body: some View {
    switch route {
    case .profile: ProfileScreen()
    case .favorites: FavoritesScreen()
    case .recent: RecentScreen()
    case .library(let id, let sort): LibraryScreen(id: id, sort: sort)
    case .title(let id): TitleScreen(id: id)
    case .season(let titleId, let season): SeasonScreen(titleId: titleId, season: season)
    case .episode(let itemId): EpisodeScreen(itemId: itemId)
    case .person(let name, let tmdbId): PersonScreen(name: name, tmdbId: tmdbId)
    case .browse(let genre, let studio): BrowseScreen(genre: genre, studio: studio)
    case .settings: SettingsScreen()
    case .settingsPage(let key): SettingsPageScreen(key: key)
    case .linkDevice: LinkDeviceScreen()
    case .downloadsShow(let titleId): DownloadsShowScreen(titleId: titleId)
    case .identify(let titleId): IdentifyScreen(titleId: titleId)
    case .images(let titleId, let season, let episode):
      ImagesScreen(target: ImageTarget(titleId: titleId, season: season, episode: episode))
    case .libraryEditor(let id): LibraryEditorScreen(id: id, results: nav.results)
    case .folderPicker(let start, let added): FolderPickerScreen(start: start, added: added)
    case .catalog(let kind, let provider, let providerId, let library):
      CatalogScreen(ref: CatalogRef(kind: kind, provider: provider, providerId: providerId), library: library)
    case .asked: AskedScreen()
    case .requests(let list): RequestsScreen(start: list)
    case .catalogBrowse(let start): CatalogBrowseScreen(start: start)
    }
  }
}

/// One tab: its first page with the tabs on it, and the pages opened from
/// it on a stack of its own.
struct TabStack: View {
  let tab: ShellTab
  @Environment(ShellNav.self) private var nav

  var body: some View {
    // Every page on the stack, the first too, on the theme's background:
    // the stack's own is the system's black or white.
    NavigationStack(path: nav.path(tab)) {
      root.navigationDestination(for: Route.self) { route in page(route) }
    }
  }

  private var root: some View {
    TabRoot(tab: tab)
      .tabBars(tab)
      .pageBackground()
      .environment(\.tabReselected, nav.reselected[tab, default: 0])
      .environment(\.tabRoot, true)
  }

  private func page(_ route: Route) -> some View {
    let home: (() -> Void)? = nav.offline ? nil : { [nav] in nav.home() }
    return RouteScreen(route: route)
      .pageBackground()
      .environment(\.tabRoot, false)
      .environment(\.homeAction, home)
  }
}

extension EnvironmentValues {
  /// Moves each time the person picks the tab this page is the first page
  /// of while it shows: scroll to the top, as iOS apps do. `scrollsToTopOnReselect`
  /// does it for a plain scroll view.
  @Entry var tabReselected = 0

  /// The page is a tab's first page, not one opened from it.
  @Entry var tabRoot = false
}

extension View {
  /// On a tab's first page: back to the top when the tab is picked again.
  /// Goes on the page's `ScrollView`. A page that keeps a `ScrollPosition`
  /// of its own watches `\.tabReselected` instead. In debug builds,
  /// `devScroll` names a launch argument that starts the page that far down.
  func scrollsToTopOnReselect(devScroll: String? = nil) -> some View { modifier(ScrollsToTop(devScroll: devScroll)) }
}

private struct ScrollsToTop: ViewModifier {
  let devScroll: String?
  @Environment(\.tabReselected) private var reselected
  @State private var position = ScrollPosition(edge: .top)

  func body(content: Content) -> some View {
    content
      .scrollPosition($position)
      .onChange(of: reselected) { withMotion(Motion.move) { position.scrollTo(edge: .top) } }
    #if DEBUG
      .task {
        guard let key = devScroll, let y = Double(UserDefaults.standard.string(forKey: key) ?? "") else { return }
        try? await Task.sleep(for: .seconds(3))
        position.scrollTo(y: y)
      }
    #endif
  }
}

/// The player over everything, in landscape on a phone, in the dark theme, as Android's PlayerActivity.
struct PlayerCover: View {
  let request: PlayerRequest
  @Environment(ThemeStore.self) private var theme

  var body: some View {
    PlayerScreen(itemId: request.itemId, start: request.start)
      .forceDarkTheme(theme)
      .background(Color.black.ignoresSafeArea())
      .onAppear { Orientation.lock(.landscape) }
      .onDisappear { Orientation.unlock() }
      .persistentSystemOverlays(.hidden)
      .statusBarHidden()
  }
}

// MARK: Paths

/// A route as text, for the `-dev.route` launch argument and anything else
/// that names a page: `title/<id>`, `season/<titleId>/<number>`,
/// `settings/account`, `player/<itemId>?start=30`, and so on. Names and ids
/// are percent-encoded.
enum RoutePath {
  /// Where the path goes: a tab's first page, a page on a tab, or the player.
  enum Target: Equatable {
    case tab(ShellTab)
    case page(ShellTab, Route)
    case player(itemId: String, start: Double?)
  }

  static func parse(_ text: String) -> Target? {
    guard let components = URLComponents(string: text) else { return nil }
    let parts = components.path.split(separator: "/").map { $0.removingPercentEncoding ?? String($0) }
    let query = Dictionary(
      (components.queryItems ?? []).compactMap { item in item.value.map { (item.name, $0) } },
      uniquingKeysWith: { $1 })
    guard let head = parts.first else { return nil }
    let rest = Array(parts.dropFirst())
    let one = rest.first
    if let tab = ShellTab(rawValue: head), rest.isEmpty { return .tab(tab) }
    switch (head, one) {
    case ("player", let id?): return .player(itemId: id, start: query["start"].flatMap(Double.init))
    case ("favorites", nil): return .page(.media, .favorites)
    case ("recent", nil): return .page(.profile, .recent)
    case ("library", let id?): return .page(.media, .library(id: id, sort: query["sort"]))
    case ("title", let id?): return .page(.home, .title(id: id))
    case ("season", let id?):
      return .page(.home, .season(titleId: id, season: rest.dropFirst().first.flatMap { Int($0) }))
    case ("episode", let id?): return .page(.home, .episode(itemId: id))
    case ("person", let name?): return .page(.home, .person(name: name, tmdbId: query["tmdbId"]))
    case ("genre", let name?): return .page(.home, .browse(genre: name, studio: nil))
    case ("studio", let name?): return .page(.home, .browse(genre: nil, studio: name))
    case ("settings", nil): return .page(.profile, .settings)
    case ("settings", let key?): return .page(.profile, .settingsPage(key))
    case ("link-device", nil): return .page(.profile, .linkDevice)
    case ("downloads", let id?): return .page(.downloads, .downloadsShow(titleId: id))
    case ("identify", let id?): return .page(.home, .identify(titleId: id))
    case ("images", let id?):
      let numbers = rest.dropFirst().map { Int($0) }
      return .page(
        .home, .images(titleId: id, season: numbers.first ?? nil, episode: numbers.dropFirst().first ?? nil))
    case ("library-editor", let id): return .page(.profile, .libraryEditor(id: id))
    case ("folder-picker", nil):
      return .page(
        .profile,
        .folderPicker(
          start: query["start"], added: query["added"].map { $0.split(separator: ",").map(String.init) } ?? []))
    case ("catalog", let kind?):
      let ids = Array(rest.dropFirst())
      guard ids.count == 2 else { return nil }
      return .page(.home, .catalog(kind: kind, provider: ids[0], providerId: ids[1], library: query["library"]))
    case ("asked", nil): return .page(.profile, .asked)
    case ("requests", let list): return .page(.profile, .requests(list: list))
    case ("discover-browse", let kind?): return .page(.search, .catalogBrowse(CatalogBrowseStart(kind: kind)))
    default: return nil
    }
  }
}

extension ShellNav {
  /// Opens what `path` names (`RoutePath`) where it lives in this layout
  /// (MatineeCore's `shellLanding` and `shellStack`): a place, with search
  /// taking the keyboard on a phone; a page on top of its place's first
  /// page, which on a phone puts a page of the profile's, as Settings, on
  /// Home over the profile.
  func open(_ target: RoutePath.Target) {
    switch target {
    case .tab(let page):
      let landing = shellLanding(page, layout: layout, offline: offline)
      show(landing.tab)
      paths[landing.tab] = landing.underProfile ? [.profile] : []
      if landing.focusesSearch { searchPending = true }
    case .page(let owner, let route):
      let landing = shellStack(for: owner, layout: layout, offline: offline)
      show(landing.tab)
      paths[landing.tab] = (landing.underProfile ? [.profile] : []) + [route]
    case .player(let itemId, let start):
      player = PlayerRequest(itemId: itemId, start: start)
    }
  }
}
