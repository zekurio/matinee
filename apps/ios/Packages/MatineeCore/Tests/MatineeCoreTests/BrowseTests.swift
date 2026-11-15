import Foundation
import Testing

@testable import MatineeCore

private func title(_ id: String, library: String = "movies") -> TitleSummary {
  TitleSummary(
    id: id, libraryId: library, kind: TitleKind.movie, name: id, year: nil, overview: nil,
    images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil, runtimeMinutes: nil,
    originalLanguage: nil, favorite: false, watched: false)
}

private func results(titles: [TitleSummary] = [], genres: [Facet] = []) -> SearchResults {
  SearchResults(users: [], titles: titles, people: [], genres: genres, studios: [])
}

/// LibraryData.kt, SearchData.kt, and Grid.kt's paging; Android has no test for them.
@MainActor
struct BrowseTests {
  /// A server of `count` titles that records what it was asked.
  final class Server: @unchecked Sendable {
    let count: Int
    var asked: [(offset: Int, limit: Int)] = []
    var failing = false
    init(_ count: Int) { self.count = count }

    func page(_ offset: Int, _ limit: Int) throws -> TitleList {
      asked.append((offset, limit))
      if failing { throw URLError(.cannotConnectToHost) }
      let ids = (offset..<min(offset + limit, count)).map { title("t\($0)") }
      return TitleList(items: ids, total: count)
    }
  }

  func waitFor(_ condition: () -> Bool) async {
    for _ in 0..<200 where !condition() { try? await Task.sleep(for: .milliseconds(5)) }
  }

  // MARK: Paging

  @Test func pagesLoadInTurnUntilTheTotal() async {
    let server = Server(5)
    let pages = TitlePages(pageSize: 2)
    pages.configure(key: "a") { offset, limit in try server.page(offset, limit) }
    await waitFor { !pages.loading }
    #expect(pages.items.map(\.id) == ["t0", "t1"])
    #expect(pages.total == 5)
    #expect(!pages.done)
    pages.more()
    // One page at a time: a second call while one is out does nothing.
    pages.more()
    await waitFor { !pages.loading }
    pages.more()
    await waitFor { !pages.loading }
    #expect(pages.items.count == 5)
    #expect(pages.done)
    pages.more()
    #expect(!pages.loading)
    #expect(server.asked.map(\.offset) == [0, 2, 4])
  }

  @Test func anotherKeyStartsAgainAndTheSameKeepsWhatLoaded() async {
    let server = Server(3)
    let pages = TitlePages(pageSize: 2)
    pages.configure(key: "a") { offset, limit in try server.page(offset, limit) }
    await waitFor { !pages.loading }
    pages.configure(key: "a") { offset, limit in try server.page(offset, limit) }
    #expect(pages.items.count == 2)
    pages.configure(key: "b") { offset, limit in try server.page(offset, limit) }
    #expect(pages.items.isEmpty)
    #expect(pages.firstLoading)
    await waitFor { !pages.loading }
    #expect(server.asked.map(\.offset) == [0, 0])
  }

  @Test func aFailedPageSaysWhyAndCanBeAskedAgain() async {
    let server = Server(3)
    server.failing = true
    let pages = TitlePages(pageSize: 2)
    pages.configure(key: "a") { offset, limit in try server.page(offset, limit) }
    await waitFor { !pages.loading }
    #expect(pages.error == .unreachable)
    #expect(!pages.firstLoading)
    server.failing = false
    pages.more()
    #expect(pages.error == nil)
    await waitFor { !pages.loading }
    #expect(pages.items.count == 2)
  }

  @Test func aRefreshFetchesWhatsLoadedInPlace() async {
    let server = Server(5)
    let pages = TitlePages(pageSize: 2)
    pages.configure(key: "a") { offset, limit in try server.page(offset, limit) }
    await waitFor { !pages.loading }
    pages.more()
    await waitFor { !pages.loading }
    server.asked = []
    await pages.refresh()
    #expect(pages.items.count == 4)
    #expect(server.asked.first?.offset == 0)
    #expect(server.asked.first?.limit == 4)
    // A refresh that fails keeps what showed.
    server.failing = true
    await pages.refresh()
    #expect(pages.items.count == 4)
  }

  @Test func theEndIsNearWithinAScreenAndAHalf() {
    #expect(!scrolledNearEnd(offset: 0, visible: 800, content: 4000))
    #expect(scrolledNearEnd(offset: 2000, visible: 800, content: 4000))
    // A list shorter than the screen is at its end.
    #expect(scrolledNearEnd(offset: 0, visible: 800, content: 300))
  }

  // MARK: Filters

  @Test func theSortComesFromTheRouteWhenTheServerKnowsIt() {
    #expect(librarySort(nil) == TitleSort.name)
    #expect(librarySort("year") == TitleSort.year)
    #expect(librarySort("rating") == TitleSort.name)
    #expect(LIBRARY_SORTS == ["name", "recent", "year"])
  }

  @Test func theSearchSettlesOnceTypingPauses() async {
    let filters = LibraryFilters(debounce: .milliseconds(40))
    filters.query = "m"
    filters.query = "ma "
    #expect(filters.settled == "")
    await waitFor { filters.settled == "ma" }
    #expect(filters.settled == "ma")
    filters.query = ""
    await waitFor { filters.settled.isEmpty }
    #expect(filters.settled.isEmpty)
  }

  @Test func clearingTheSearchSettlesAtOnce() {
    let filters = LibraryFilters()
    filters.query = "dune"
    filters.settleNow()
    #expect(filters.settled == "dune")
    filters.clearQuery()
    #expect(filters.query.isEmpty)
    #expect(filters.settled.isEmpty)
  }

  @Test func theEmptyPageSaysWhy() {
    let filters = LibraryFilters()
    #expect(libraryEmpty(filters) == .none)
    filters.genre = "Drama"
    #expect(libraryEmpty(filters) == .noFilterMatch)
    filters.query = "x"
    filters.settleNow()
    #expect(libraryEmpty(filters) == .noMatch("x"))
  }

  // MARK: Search

  final class Searches: @unchecked Sendable {
    var asked: [String] = []
    var cancelled: [String] = []
    var failing = false
    let wait: Duration
    init(wait: Duration = .zero) { self.wait = wait }

    func search(_ text: String) async throws -> SearchResults {
      asked.append(text)
      if wait > .zero {
        do { try await Task.sleep(for: wait) } catch {
          cancelled.append(text)
          throw error
        }
      }
      if failing { throw URLError(.cannotConnectToHost) }
      return results(titles: [title(text)])
    }
  }

  @Test func searchWaitsForAPauseInTyping() async {
    let server = Searches()
    let state = SearchState(debounce: .milliseconds(40))
    for text in ["m", "ma", "mat"] {
      state.update(text) { try await server.search($0) }
    }
    await state.settled()
    #expect(server.asked == ["mat"])
    #expect(state.results?.titles.first?.id == "mat")
    #expect(!state.searching)
  }

  @Test func aNewQueryCancelsTheSearchStillOut() async {
    let server = Searches(wait: .milliseconds(200))
    let state = SearchState(debounce: .zero)
    state.update("dune", now: true) { try await server.search($0) }
    await waitFor { state.searching }
    state.update("matrix", now: true) { try await server.search($0) }
    await waitFor { !server.cancelled.isEmpty }
    #expect(server.cancelled == ["dune"])
    await state.settled()
    #expect(state.results?.titles.first?.id == "matrix")
    #expect(!state.failed)
  }

  @Test func anEmptyQueryClearsAndTheSameTextIsNotAskedAgain() async {
    let server = Searches()
    let state = SearchState(debounce: .zero)
    state.update("dune", now: true) { try await server.search($0) }
    await state.settled()
    state.update(" dune ") { try await server.search($0) }
    await state.settled()
    #expect(server.asked == ["dune"])
    state.update("  ") { try await server.search($0) }
    #expect(state.results == nil)
  }

  @Test func aFailedSearchSaysSoAndTheNextTries() async {
    let server = Searches()
    server.failing = true
    let state = SearchState(debounce: .zero)
    state.update("dune", now: true) { try await server.search($0) }
    await state.settled()
    #expect(state.failed)
    server.failing = false
    state.update("dune", now: true) { try await server.search($0) }
    await state.settled()
    #expect(!state.failed)
    #expect(state.results != nil)
  }

  @Test func titlesGroupByLibraryInTheServersOrder() {
    let found = results(titles: [
      title("a", library: "shows"), title("b", library: "movies"), title("c", library: "shows"),
    ])
    let groups = found.titlesByLibrary()
    #expect(groups.map(\.libraryId) == ["shows", "movies"])
    #expect(groups[0].titles.map(\.id) == ["a", "c"])
    #expect(!found.isEmpty)
    #expect(results().isEmpty)
    #expect(!results(genres: [Facet(name: "Drama", titleCount: 2)]).isEmpty)
  }
}
