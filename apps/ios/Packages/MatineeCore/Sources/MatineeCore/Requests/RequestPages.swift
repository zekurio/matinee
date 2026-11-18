import Foundation
import Observation

public struct RequestPageBatch<Item: Sendable>: Sendable {
  public let items: [Item]
  public let nextPage: Int?
  public let stale: Bool
  public let voteFloor: Int?
  public let detail: String?
  public init(items: [Item], nextPage: Int?, stale: Bool, voteFloor: Int? = nil, detail: String? = nil) {
    self.items = items; self.nextPage = nextPage; self.stale = stale
    self.voteFloor = voteFloor; self.detail = detail
  }
}
/// Browse.kt and Discover.kt: first occurrence wins when pages overlap.
/// Change the key when query, kind, filters or sort change. Failed pages
/// retain their cursor and can be retried explicitly with more().
@MainActor @Observable
public final class RequestPages<Item: Sendable> {
  public private(set) var items: [Item] = []
  public private(set) var nextPage: Int? = 1
  public private(set) var loading = false
  public private(set) var failure: Failure?
  public private(set) var stale = false
  public private(set) var voteFloor: Int?
  public private(set) var detail: String?
  @ObservationIgnored private var key: String?
  @ObservationIgnored private var fetch: (@Sendable (Int) async throws -> RequestPageBatch<Item>)?
  @ObservationIgnored private let identity: @Sendable (Item) -> String
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  public init(identity: @escaping @Sendable (Item) -> String) { self.identity = identity }
  public func configure(key: String, fetch: @escaping @Sendable (Int) async throws -> RequestPageBatch<Item>) {
    self.fetch = fetch
    guard self.key != key else { return }
    self.key = key
    reset()
  }
  public func reset() {
    task?.cancel(); generation += 1
    items = []; nextPage = 1; loading = false; failure = nil; stale = false
    voteFloor = nil; detail = nil
    more()
  }
  public func more() {
    guard !loading, let page = nextPage, let fetch else { return }
    loading = true
    let mine = generation
    task = Task { [weak self] in
      do {
        let batch = try await fetch(page)
        guard let self, self.generation == mine, !Task.isCancelled else { return }
        var seen = Set(self.items.map(self.identity))
        self.items += batch.items.filter { seen.insert(self.identity($0)).inserted }
        self.nextPage = batch.nextPage
        self.stale = self.stale || batch.stale
        self.voteFloor = batch.voteFloor; self.detail = batch.detail
        self.failure = nil; self.loading = false
      } catch {
        guard let self, self.generation == mine else { return }
        if Failure(error) != .cancelled { self.failure = Failure(error) }
        self.loading = false
      }
    }
  }
  public func settled() async { await task?.value }
  /// Drops the items `leaves` picks, as an answered request leaves Done
  /// without the whole list being read again.
  public func remove(where leaves: (Item) -> Bool) { items.removeAll(where: leaves) }
}
extension RequestData {
  public func browseBatch(_ input: CatalogBrowseInput, page: Int) async throws -> RequestPageBatch<CatalogBrowseTitle> {
    var input = input; input.page = page
    let result = try await browse(input)
    return .init(items: result.items, nextPage: result.nextPage, stale: result.stale, voteFloor: result.voteFloor, detail: result.detail)
  }
  public func searchBatch(_ query: String, kind: String? = nil, page: Int) async throws -> RequestPageBatch<CatalogTitleSummary> {
    let result = try await search(query, kind: kind, page: page)
    return .init(items: requestAskable(result.items), nextPage: result.nextPage, stale: result.stale)
  }
}
