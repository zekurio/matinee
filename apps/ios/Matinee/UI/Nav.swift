import MatineeCore
import SwiftUI

/*
 * Nav.kt: the app's pages, as the web app's routes in apps/web/src/routes,
 * and how one opens another. Android keeps one back stack with the tab
 * bar on each tab's first page; iOS gives each tab a stack of its own, as
 * its apps do, so a tab keeps its place while another is open. Pages
 * opened from a tab go on that tab's stack. The player opens over
 * everything, in landscape on a phone, as Android's own PlayerActivity.
 *
 * Pages don't edit this file: they open each other through the
 * environment's `Navigator`, and every route a page needs is here.
 */

/// The shell's tabs, by their first page, in the tab bar's order: Home,
/// Media, Downloads, and the profile, then search on its own.
enum ShellTab: String, Codable, CaseIterable, Hashable {
  case home, media, downloads, profile, search
}

/// A page opened from a tab's first page, with what it needs to load.
/// Android's `…Route` classes, less the tabs' own, which are `ShellTab`.
enum Route: Hashable, Codable {
  case favorites
  /// Everything the signed-in person watched last, a file per title, from the profile.
  case recent
  /// `sort` is a `TitleSort`, or nil for the library's own.
  case library(id: String, sort: String?)
  case title(id: String)
  /// `season` is nil for the files without a season number.
  case season(titleId: String, season: Int?)
  case episode(itemId: String)
  case person(name: String)
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
  var tab: ShellTab = .home
  var paths: [ShellTab: [Route]] = [:]
  var player: PlayerRequest?
  /// Moves each time the open tab is picked again on its first page, for
  /// that page to scroll to its top.
  private(set) var reselected: [ShellTab: Int] = [:]
  let results = NavResults()
  let offline: Bool

  init(offline: Bool) { self.offline = offline }

  /// The tabs there are: offline, only what works without the server, Home
  /// from the downloads, the downloads, and the profile with settings.
  var tabs: [ShellTab] {
    offline ? [.home, .downloads, .profile] : ShellTab.allCases
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
      self.tab = tab
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

  /// Home's first page, from anywhere: Android's pop back to Home, which
  /// sits under every other page there.
  func home() {
    paths[tab] = []
    paths[.home] = []
    tab = .home
  }

  var navigator: Navigator {
    Navigator(
      back: { [weak self] in self?.back() },
      home: { [weak self] in self?.home() },
      tab: { [weak self] in self?.select($0) },
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
      person: { [weak self] in self?.push(.person(name: $0)) },
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
      play: { [weak self] in self?.player = PlayerRequest(itemId: $0, start: $1) }
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

  /// Puts back what `data` kept, if it was this `owner`'s.
  func restore(_ data: Data?, owner: String) {
    guard let data, let saved = try? JSONDecoder().decode(Saved.self, from: data), saved.owner == owner
    else { return }
    for pages in saved.paths where tabs.contains(pages.tab) { paths[pages.tab] = pages.routes }
    tab = tabs.contains(saved.tab) ? saved.tab : .home
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
    case .favorites: FavoritesScreen()
    case .recent: RecentScreen()
    case .library(let id, let sort): LibraryScreen(id: id, sort: sort)
    case .title(let id): TitleScreen(id: id)
    case .season(let titleId, let season): SeasonScreen(titleId: titleId, season: season)
    case .episode(let itemId): EpisodeScreen(itemId: itemId)
    case .person(let name): PersonScreen(name: name)
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
    }
  }
}

/// One tab: its first page, and the pages opened from it on a stack of its own.
struct TabStack: View {
  let tab: ShellTab
  @Environment(ShellNav.self) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    // Every page on the stack, the first too, on the theme's background:
    // the stack's own is the system's black or white.
    NavigationStack(path: nav.path(tab)) {
      TabRoot(tab: tab)
        .background(palette.background.ignoresSafeArea())
        .environment(\.tabReselected, nav.reselected[tab, default: 0])
        .environment(\.tabRoot, true)
        .navigationDestination(for: Route.self) { route in
          RouteScreen(route: route)
            .background(palette.background.ignoresSafeArea())
            .environment(\.tabRoot, false)
        }
    }
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
  /// of its own watches `\.tabReselected` instead.
  func scrollsToTopOnReselect() -> some View { modifier(ScrollsToTop()) }
}

private struct ScrollsToTop: ViewModifier {
  @Environment(\.tabReselected) private var reselected
  @State private var position = ScrollPosition(edge: .top)

  func body(content: Content) -> some View {
    content
      .scrollPosition($position)
      .onChange(of: reselected) { withMotion(Motion.move) { position.scrollTo(edge: .top) } }
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
    case ("person", let name?): return .page(.home, .person(name: name))
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
    default: return nil
    }
  }
}

extension ShellNav {
  /// Opens what `path` names (`RoutePath`): its tab, with the page on top of its first page.
  func open(_ target: RoutePath.Target) {
    switch target {
    case .tab(let tab):
      guard tabs.contains(tab) else { return }
      self.tab = tab
      paths[tab] = []
    case .page(let tab, let route):
      let tab = tabs.contains(tab) ? tab : .home
      self.tab = tab
      paths[tab] = [route]
    case .player(let itemId, let start):
      player = PlayerRequest(itemId: itemId, start: start)
    }
  }
}
