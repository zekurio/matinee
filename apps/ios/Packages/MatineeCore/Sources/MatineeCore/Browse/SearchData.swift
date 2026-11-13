import Foundation
import Observation

/*
 * SearchData.kt: how search asks the server. The search page hands each
 * change of its field to `SearchState.update`, which waits for typing to
 * pause and cancels the search still out for the text before.
 */

/// How many of each kind of result a search asks for, as Android's.
public let SEARCH_LIMIT = 40

/// How long typing has to pause before a search goes out.
public let SEARCH_DEBOUNCE: Duration = .milliseconds(250)

/// What the newest search answered, and whether one is out or failed. The
/// page keeps it while it's on the navigation stack, so coming back from a
/// title finds the results there.
@MainActor @Observable
public final class SearchState {
  /// The newest answer; nil before one, and while the field is empty.
  public private(set) var results: SearchResults?
  /// A search is out: past the pause, waiting for the server.
  public private(set) var searching = false
  /// The newest search didn't go through.
  public private(set) var failed = false

  /// The text `results` answer.
  @ObservationIgnored public private(set) var resultsFor: String?
  @ObservationIgnored private let debounce: Duration
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var generation = 0

  public init(debounce: Duration = SEARCH_DEBOUNCE) {
    self.debounce = debounce
  }

  /// Searches for `query` once typing pauses, or at once with `now`, as the
  /// keyboard's Search key asks. The search out for the text before is
  /// cancelled. An empty query clears the results; results already there
  /// for the same text stay.
  public func update(
    _ query: String, now: Bool = false, search: @escaping @Sendable (String) async throws -> SearchResults
  ) {
    task?.cancel()
    generation += 1
    let mine = generation
    searching = false
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty {
      results = nil
      resultsFor = nil
      failed = false
      return
    }
    if resultsFor == text, results != nil, !failed { return }
    let debounce = now ? nil : debounce
    task = Task { [weak self] in
      if let debounce {
        try? await Task.sleep(for: debounce)
        if Task.isCancelled { return }
      }
      guard let self, mine == self.generation else { return }
      self.searching = true
      self.failed = false
      do {
        let found = try await search(text)
        guard mine == self.generation else { return }
        self.results = found
        self.resultsFor = text
      } catch {
        guard mine == self.generation else { return }
        if Failure(error) != .cancelled { self.failed = true }
      }
      self.searching = false
    }
  }

  /// Waits for the search that's out, for tests.
  func settled() async { await task?.value }
}

extension SearchResults {
  /// Nothing at all matched.
  public var isEmpty: Bool {
    titles.isEmpty && people.isEmpty && genres.isEmpty && studios.isEmpty && users.isEmpty
  }

  /// The titles by library, the libraries in the order their first title
  /// ranked, and each library's titles in the order the server ranked them.
  public func titlesByLibrary() -> [(libraryId: String, titles: [TitleSummary])] {
    var order: [String] = []
    var groups: [String: [TitleSummary]] = [:]
    for title in titles {
      if groups[title.libraryId] == nil { order.append(title.libraryId) }
      groups[title.libraryId, default: []].append(title)
    }
    return order.map { ($0, groups[$0] ?? []) }
  }
}
