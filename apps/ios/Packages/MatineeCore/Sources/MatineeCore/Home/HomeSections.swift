import Foundation

/*
 * HomeSections.kt's logic, and the few rules Hero.kt, HomeScreen.kt, and
 * FavoritesData.kt lay their pages out by: what a rail shows for its load,
 * when Home is one error, what an account without a library is told, how
 * tall the banner is, which facts a slide lists, and how its repeating
 * pages map to slides.
 */

/// What a Home rail shows for its load: an empty answer is not a failure.
public enum RailState<T> {
  case loading
  case empty
  case failed(String, disconnected: Bool = false)
  case shown([T])
}

extension RailState: Equatable where T: Equatable {}

public func railState<T>(_ load: Load<[T]>) -> RailState<T> {
  switch load {
  case .loading: .loading
  case .failed(let message, let disconnected): .failed(message, disconnected: disconnected)
  case .ready(let items): items.isEmpty ? .empty : .shown(items)
  }
}

/// A section's load, whatever it holds, for `failedOutright`.
public protocol SectionLoad {
  /// It failed, or came back with nothing.
  var failedOrEmpty: Bool { get }
}

extension Load: SectionLoad where T: Collection {
  public var failedOrEmpty: Bool {
    switch self {
    case .loading: false
    case .failed: true
    case .ready(let value): value.isEmpty
    }
  }
}

/// Home is one error page only when nothing on it could show: the
/// libraries failed, and every other section failed or came back empty.
/// Otherwise each failed section says so in its place, under what did load.
public func failedOutright<L>(_ libraries: Load<L>, _ sections: [any SectionLoad]) -> Bool {
  libraries.isFailed && sections.allSatisfy(\.failedOrEmpty)
}

/// What Home and Media say to an account that may open no library. An
/// admin sees every library, so none means none exist; anyone else may be
/// in no group that opens one.
public enum NoLibraries: Equatable, Sendable {
  /// None exist yet: an admin can add one.
  case noneExist
  /// None open to this account.
  case noneOpen

  public init(admin: Bool) { self = admin ? .noneExist : .noneOpen }
}

/// Featured slides, as the banner pages through them.
public enum HeroPaging {
  /// How many times over the banner's pages repeat, so it can keep going
  /// forward: after the last slide comes the first again, rather than a
  /// rewind through them all.
  public static let loops = 1000

  /// How long a slide stays before the banner moves on.
  public static let advance: Duration = .seconds(8)

  /// How many pages the banner has for `count` slides.
  public static func pages(_ count: Int) -> Int { count > 1 ? count * loops : count }

  /// The page it opens on: the middle of the repeats, so it can go either way.
  public static func initialPage(_ count: Int) -> Int { count > 1 ? count * (loops / 2) : 0 }

  /// The slide `page` shows.
  public static func slide(_ page: Int, count: Int) -> Int {
    guard count > 0 else { return 0 }
    return ((page % count) + count) % count
  }

  /// The page nearest `page` that shows slide `index`, for a dot's tap.
  public static func page(showing index: Int, from page: Int, count: Int) -> Int {
    page - slide(page, count: count) + index
  }
}

/// How tall Home's banner is in a window `height` tall. On a phone, short
/// enough that two rows of stills fit under it, and no shorter than 320, or
/// its title and buttons would reach the header; `topInset` is the status
/// bar's, which it reaches under, beyond the 24 Android's leaves it. Tablets
/// keep a tall banner, which on a phone turned on its side, wide but short,
/// leaves a little of the page showing under it.
public func heroHeight(window height: Double, wide: Bool, topInset: Double = 24) -> Double {
  if wide { return max(height * 0.68, min(460, height * 0.9)) }
  return min(max(height * 0.345, 320), 400) + max(topInset - 24, 0)
}

extension FeaturedTitle {
  /// The year, and a show's episode count when it has more than one.
  public func facts(episodes: (Int) -> String) -> [String] {
    [
      title.year.map { String($0) },
      title.isShow && count > 1 ? episodes(count) : nil,
    ].compactMap(\.self)
  }

  /// Whether the slide lists the title's genres. A phone's short banner has
  /// room for the genres or how far the person is, not both; where they are
  /// matters more.
  public func showsGenres(wide: Bool, resuming: Bool) -> Bool {
    !title.genres.isEmpty && (wide || !resuming)
  }

  /// The genres a slide lists, at most three.
  public var shownGenres: [String] { Array(title.genres.prefix(3)) }
}

/// Favorites as a page shows them: the titles and the episodes still marked,
/// so one taken off here or elsewhere goes at once, before the list is
/// fetched again.
@MainActor public enum FavoritesFilter {
  /// The titles, nil while they load or when they failed.
  public static func titles(_ load: Load<[TitleSummary]>, _ viewer: ViewerState) -> [TitleSummary]? {
    load.value?.filter(viewer.isFavorite)
  }

  /// The episodes, empty while they load or when they failed.
  public static func episodes(_ load: Load<[MediaItem]>, _ viewer: ViewerState) -> [MediaItem] {
    load.value?.filter(viewer.isFavorite) ?? []
  }
}
