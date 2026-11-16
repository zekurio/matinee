import Foundation

/*
 * HomeSections.kt's logic, and the few rules HomeScreen.kt and
 * FavoritesData.kt lay their pages out by: what a rail shows for its load,
 * which rows Home lists, when Home is one error, and what an account without
 * a library is told.
 * The featured carousel's rules are in HomeCarousel.swift beside it.
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

/// One of Home's rows between the featured titles and the libraries' shelves.
public enum HomeRow: Hashable, Sendable, Identifiable {
  case continueWatching
  case nextUp
  /// A recommendation row, with its titles still to show.
  case recommended(HomeRecommendationRail, [RecommendedTitle])
  /// "My requests": what's on its way, and what came or was answered lately.
  case asked

  public var id: String {
    switch self {
    case .continueWatching: "continue"
    case .nextUp: "nextUp"
    case .recommended(let rail, _): "recommended-\(rail.key)"
    case .asked: "asked"
    }
  }
}

/// Home's rows between the featured titles and the shelves, in order: those
/// with something to show. A row with nothing (loading, failed, empty, a
/// recommendation row whose every title is `hidden`, no requests) is left
/// out of the list rather than drawn empty, which would still take the
/// list's gap on both sides, a double gap between the rows around it. As
/// HomeScreen.kt, Recommendations.kt, and Asked.kt leave them out.
public func homeRows<Episode, Ask>(
  resume: Load<[Episode]>, nextUp: Load<[Episode]>, recommendations: HomeRecommendations?,
  hiding hidden: Set<String>, asked: [Ask]
) -> [HomeRow] {
  var rows: [HomeRow] = []
  if case .shown = railState(resume) { rows.append(.continueWatching) }
  if case .shown = railState(nextUp) { rows.append(.nextUp) }
  for rail in recommendations?.rails ?? [] {
    let shown = rail.visible(hiding: hidden)
    if !shown.isEmpty { rows.append(.recommended(rail, shown)) }
  }
  if !asked.isEmpty { rows.append(.asked) }
  return rows
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
