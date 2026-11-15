import Foundation
import Observation

/*
 * LibraryData.kt: what a library's page and a genre's or studio's page
 * load and filter by. The words for the sorts and kinds are the app's.
 */

/// How long typing has to pause before a library's search asks the server.
public let LIBRARY_SEARCH_DEBOUNCE: Duration = .milliseconds(250)

/// A library's orders, in the order the sort offers them.
public let LIBRARY_SORTS: [String] = [TitleSort.name, TitleSort.recent, TitleSort.year]

/// A genre's or a studio's page's choice of kind: a movie, a show, or nil for both.
public let BROWSE_KINDS: [String?] = [nil, TitleKind.movie, TitleKind.show]

/// The order a library page starts in: the route's, when it's one the server knows, else by name.
public func librarySort(_ route: String?) -> String {
  route.flatMap { LIBRARY_SORTS.contains($0) ? $0 : nil } ?? TitleSort.name
}

/// A library page's sort, genre, and search, kept while the page is on the
/// navigation stack. `settled` is `query` once typing pauses, trimmed; it's
/// what goes to the server.
@MainActor @Observable
public final class LibraryFilters {
  public var sort: String
  public var genre: String?
  public var query = "" {
    didSet { if query != oldValue { settle() } }
  }
  public private(set) var settled = ""

  @ObservationIgnored private let debounce: Duration
  @ObservationIgnored private var waiting: Task<Void, Never>?

  public init(sort: String? = nil, debounce: Duration = LIBRARY_SEARCH_DEBOUNCE) {
    self.sort = librarySort(sort)
    self.debounce = debounce
  }

  /// Clears the search at once, without waiting, as closing it does.
  public func clearQuery() {
    query = ""
    // The didSet's wait isn't needed: it's settled now.
    waiting?.cancel()
    settled = ""
  }

  /// The search as typed, at once, as the keyboard's Search key asks.
  public func settleNow() {
    waiting?.cancel()
    settled = query.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// What the server's list is for: another key is another list.
  public var key: String { "\(sort)\n\(genre ?? "")\n\(settled)" }

  private func settle() {
    waiting?.cancel()
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let debounce = debounce
    waiting = Task { [weak self] in
      try? await Task.sleep(for: debounce)
      guard !Task.isCancelled, let self else { return }
      if self.settled != text { self.settled = text }
    }
  }
}

/// Why a library page shows no titles.
public enum LibraryEmpty: Equatable, Sendable {
  /// Nothing matches the search, which it names.
  case noMatch(String)
  /// Nothing has the genre.
  case noFilterMatch
  /// The library has no titles.
  case none
}

/// Why a page with `filters` shows no titles: the search first, then the genre.
@MainActor public func libraryEmpty(_ filters: LibraryFilters) -> LibraryEmpty {
  if !filters.settled.isEmpty { return .noMatch(filters.settled) }
  if filters.genre != nil { return .noFilterMatch }
  return .none
}
