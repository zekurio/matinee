import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The TV's navigation: TvApp.kt's NavHost, with the phone's routes mapped
 * to TV pages. One stack, Home at its root: a page from the drawer goes on
 * top of Home, so Menu from it comes back to Home, and a page opened from a
 * page goes on top of that. Menu steps back one page at a time; at Home it
 * opens the drawer, and from the drawer on Home it leaves the app
 * (TVShell.swift).
 *
 * Pages open each other through the environment's `Navigator`, the iPhone
 * app's (Matinee/UI/Navigator.swift), which this fills in for a TV. The
 * phone's pages a TV leaves out (downloads, the admin pages, the image
 * editor, identify, linking a device) have no route here, and their
 * navigator entries do nothing; neither has a single library's grid, as on
 * Android TV: the drawer's Movies and Shows take every library at once.
 */

/// The shared `Navigator` names the phone's tabs; on a TV they're the
/// drawer's pages. Home is Home, Search and the profile are theirs, Media
/// is Home (the drawer's Movies and Shows take its place), and Downloads
/// has none. Only `Navigator` uses this.
enum ShellTab: String, Codable, CaseIterable, Hashable {
  case home, media, downloads, profile, search
}

/// A TV page, by what it needs to load: Android TV's routes in TvApp.kt.
enum TVRoute: Hashable, Codable {
  case search
  case favorites
  /// Every movie or every show on the server, from the drawer, by `TitleKind`.
  case kind(String)
  case title(id: String)
  /// `season` is nil for the files without a season number.
  case season(titleId: String, season: Int?)
  case episode(itemId: String)
  case person(name: String, tmdbId: String?)
  /// A genre's or a studio's titles, across the server.
  case browse(genre: String?, studio: String?)
  case profile
  /// Everything the signed-in person watched last, from the profile.
  case recent
  case settings
  /// One of Settings' categories, by its key.
  case settingsPage(String)
}

/// The player, over everything: a file, and where to start, or nil to go on where the person left off.
struct TVPlayerRequest: Identifiable, Hashable {
  let itemId: String
  let start: Double?
  let id = UUID()
}

/// The drawer's entries, by the page each opens.
enum TVDrawerPage: String, CaseIterable {
  case profile, search, home, favorites, movies, shows, settings

  /// The page it opens; nil for Home, the stack's root.
  var route: TVRoute? {
    switch self {
    case .profile: .profile
    case .search: .search
    case .home: nil
    case .favorites: .favorites
    case .movies: .kind(TitleKind.movie)
    case .shows: .kind(TitleKind.show)
    case .settings: .settings
    }
  }

  /// The entry a page belongs to, if any, as Android's `entryKey`.
  init?(_ route: TVRoute) {
    switch route {
    case .search: self = .search
    case .favorites: self = .favorites
    case .kind(let kind): self = kind == TitleKind.show ? .shows : .movies
    case .profile, .recent: self = .profile
    case .settings, .settingsPage: self = .settings
    default: return nil
    }
  }
}

/// The signed-in TV app's navigation: the stack of pages over Home, and the
/// player. One per signed-in app.
@Observable final class TVNav {
  var path: [TVRoute] = []
  var player: TVPlayerRequest?

  /// The drawer's entry to mark: the page on top's own, or that of the
  /// nearest page under it that has one, else Home.
  var drawerPage: TVDrawerPage {
    path.reversed().lazy.compactMap(TVDrawerPage.init).first ?? .home
  }

  /// The page on top's own entry, if it has one; Home's when the stack is empty.
  var shownPage: TVDrawerPage? {
    guard let top = path.last else { return .home }
    return TVDrawerPage(top)
  }

  /// A page from the drawer, on top of Home so Menu goes back there; Home itself goes back to Home.
  func drawer(_ page: TVDrawerPage) {
    path = page.route.map { [$0] } ?? []
  }

  /// Opens `route`; `single` leaves it be when it's already on top.
  func push(_ route: TVRoute, single: Bool = false) {
    if single, path.last == route { return }
    path.append(route)
  }

  /// Back to `route` when it's on the stack, the nearest one, else opens it.
  func up(to route: TVRoute) {
    if let index = path.lastIndex(of: route) {
      path = Array(path.prefix(through: index))
    } else {
      push(route)
    }
  }

  func back() {
    if !path.isEmpty { path.removeLast() }
  }

  func home() { path = [] }

  var navigator: Navigator {
    Navigator(
      back: { [weak self] in self?.back() },
      home: { [weak self] in self?.home() },
      tab: { [weak self] tab in
        switch tab {
        case .home, .media: self?.home()
        case .search: self?.drawer(.search)
        case .profile: self?.drawer(.profile)
        case .downloads: break
        }
      },
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
      favorites: { [weak self] in self?.push(.favorites, single: true) },
      recent: { [weak self] in self?.push(.recent, single: true) },
      settings: { [weak self] in self?.push(.settings, single: true) },
      settingsPage: { [weak self] in self?.push(.settingsPage($0), single: true) },
      backWith: { [weak self] _, _ in self?.back() },
      play: { [weak self] in self?.player = TVPlayerRequest(itemId: $0, start: $1) }
    )
  }
}

/// The page for `route`.
struct TVRouteScreen: View {
  let route: TVRoute

  var body: some View {
    switch route {
    case .search: TVSearchScreen()
    case .favorites: TVFavoritesScreen()
    case .kind(let kind): TVKindScreen(kind: kind)
    case .title(let id): TVTitleScreen(id: id)
    case .season(let titleId, let season): TVSeasonScreen(titleId: titleId, season: season)
    case .episode(let itemId): TVEpisodeScreen(itemId: itemId)
    case .person(let name, let tmdbId): TVPersonScreen(name: name, tmdbId: tmdbId)
    case .browse(let genre, let studio): TVBrowseScreen(genre: genre, studio: studio)
    case .profile: TVProfileScreen()
    case .recent: TVRecentScreen()
    case .settings: TVSettingsScreen()
    case .settingsPage(let key): TVSettingsScreen(page: key)
    }
  }
}

// MARK: Paths

/// A route as text, for the `-dev.route` launch argument: the iPhone app's
/// paths where a TV has the page (`title/<id>`, `season/<titleId>/<number>`,
/// `episode/<id>`, `person/<name>`, `genre/<name>`, `studio/<name>`,
/// `favorites`, `recent`, `settings`, `settings/<key>`, `search`, `profile`,
/// `player/<itemId>?start=30`), and the TV's own `movies` and `shows`.
enum TVRoutePath {
  enum Target: Equatable {
    case drawer(TVDrawerPage)
    case page(TVRoute)
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
    if rest.isEmpty, let page = TVDrawerPage(rawValue: head) { return .drawer(page) }
    switch (head, rest.first) {
    case ("player", let id?): return .player(itemId: id, start: query["start"].flatMap(Double.init))
    case ("recent", nil): return .page(.recent)
    case ("title", let id?): return .page(.title(id: id))
    case ("season", let id?): return .page(.season(titleId: id, season: rest.dropFirst().first.flatMap { Int($0) }))
    case ("episode", let id?): return .page(.episode(itemId: id))
    case ("person", let name?): return .page(.person(name: name, tmdbId: query["tmdbId"]))
    case ("genre", let name?): return .page(.browse(genre: name, studio: nil))
    case ("studio", let name?): return .page(.browse(genre: nil, studio: name))
    case ("settings", let key?): return .page(.settingsPage(key))
    default: return nil
    }
  }
}

extension TVNav {
  /// Opens what a `TVRoutePath` names, over Home.
  func open(_ target: TVRoutePath.Target) {
    switch target {
    case .drawer(let page): drawer(page)
    case .page(let route): path = [route]
    case .player(let itemId, let start): player = TVPlayerRequest(itemId: itemId, start: start)
    }
  }
}
