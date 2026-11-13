import Foundation
import Observation

/*
 * Grid.kt's `TitlePages`: a list of titles the server hands out a page at a
 * time, for a library's page and a genre's or studio's, loading more as the
 * grid scrolls toward its end.
 */

/// How many titles a page of a grid asks the server for, as Android's.
public let TITLE_PAGE = 60

/// The most a list of titles gives in one answer (the contract's `limit` cap).
let TITLE_PAGE_MAX = 200

/// A list of titles the server hands out a page at a time. Give it its
/// fetch with `configure`; a new `key` (another sort, genre, or search)
/// starts the list again from the top.
@MainActor @Observable
public final class TitlePages {
  public private(set) var items: [TitleSummary] = []
  /// How many titles the list has in all; nil until the first page came.
  public private(set) var total: Int?
  /// Why the newest page didn't come; nil while one is out or after one came.
  public private(set) var error: Failure?
  /// A page is out.
  public private(set) var loading = false
  /// A refresh of what's loaded is out, as pull to refresh waits for.
  public private(set) var refreshing = false

  public let pageSize: Int
  @ObservationIgnored public private(set) var key: String?
  @ObservationIgnored private var fetch: (@Sendable (_ offset: Int, _ limit: Int) async throws -> TitleList)?
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var generation = 0

  public init(pageSize: Int = TITLE_PAGE) {
    self.pageSize = max(1, min(pageSize, TITLE_PAGE_MAX))
  }

  /// Every title is loaded.
  public var done: Bool { total.map { items.count >= $0 } ?? false }

  /// Nothing showed yet, and the first page is on its way.
  public var firstLoading: Bool { items.isEmpty && total == nil && error == nil }

  /// The list for `key`, fetched with `fetch`. The same key keeps what
  /// loaded and only swaps the fetch, as a view hands it in again; another
  /// starts again from the first page.
  public func configure(
    key: String, fetch: @escaping @Sendable (_ offset: Int, _ limit: Int) async throws -> TitleList
  ) {
    self.fetch = fetch
    if key == self.key { return }
    self.key = key
    restart()
  }

  /// The next page, unless one is out or every title is there.
  public func more() {
    guard let fetch, !loading, !done else { return }
    loading = true
    error = nil
    let mine = generation
    let offset = items.count
    let limit = pageSize
    task = Task { [weak self] in
      do {
        let page = try await fetch(offset, limit)
        guard let self, mine == self.generation else { return }
        self.items.append(contentsOf: page.items.filter { new in !self.items.contains { $0.id == new.id } })
        self.total = page.total
        self.loading = false
      } catch {
        guard let self, mine == self.generation else { return }
        let failure = Failure(error)
        self.loading = false
        if failure != .cancelled { self.error = failure }
      }
    }
  }

  /// Everything again from the first page, as when the order changes.
  public func restart() {
    task?.cancel()
    generation += 1
    loading = false
    refreshing = false
    items = []
    total = nil
    error = nil
    more()
  }

  /// What's loaded, fetched again in place, so the grid keeps its place:
  /// for marks that changed elsewhere and for pull to refresh. A failure
  /// leaves what showed.
  public func refresh() async {
    guard let fetch, !refreshing else { return }
    if items.isEmpty {
      restart()
      await task?.value
      return
    }
    task?.cancel()
    generation += 1
    let mine = generation
    loading = false
    refreshing = true
    let wanted = max(items.count, pageSize)
    let work = Task { () -> TitleList? in
      var fresh: [TitleSummary] = []
      var total = 0
      while fresh.count < wanted {
        guard let page = try? await fetch(fresh.count, min(wanted - fresh.count, TITLE_PAGE_MAX)) else { return nil }
        fresh.append(contentsOf: page.items)
        total = page.total
        if page.items.isEmpty || fresh.count >= total { break }
      }
      return TitleList(items: fresh, total: total)
    }
    let answer = await work.value
    guard mine == generation else { return }
    refreshing = false
    if let answer {
      var seen = Set<String>()
      items = answer.items.filter { seen.insert($0.id).inserted }
      total = answer.total
      error = nil
    }
  }
}

/// Whether a scroll view's end is close enough to ask for the next page:
/// within one and a half screens of it, about Android's twelve titles
/// ahead on a phone.
public func scrolledNearEnd(offset: Double, visible: Double, content: Double) -> Bool {
  offset + visible >= content - visible * 1.5
}
