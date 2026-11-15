import Foundation
import Observation

/// RequestsHub.kt: one overlay shared by all visible catalog cards. The app
/// owns the task running follow and cancels it when the references change.
@MainActor @Observable
public final class RequestAvailabilityState {
  public private(set) var titles: [CatalogRef: RequestsLiveEvent] = [:]
  public private(set) var failure: Failure?
  public init() {}
  public func availability(_ ref: CatalogRef, fallback: Availability) -> Availability {
    titles[ref]?.availability ?? fallback
  }
  public func follow(
    _ inputs: [CatalogInput],
    stream: @Sendable ([CatalogInput]) async throws -> AsyncThrowingStream<[RequestsLiveEvent], any Error>
  ) async {
    var seen = Set<CatalogInput>()
    let refs = Array(inputs.filter { seen.insert($0).inserted }.prefix(100))
    guard !refs.isEmpty else { return }
    do {
      for try await events in try await stream(refs) {
        try Task.checkCancellation()
        for event in events { titles[event.ref] = event }
        failure = nil
      }
    } catch {
      if Failure(error) != .cancelled { failure = Failure(error) }
    }
  }
}

/// Composable fetches for CatalogScreen, Discover, Browse, Asked and ShowGaps.
/// Configure a Loader with one of these; pass the visible refs to
/// RequestAvailabilityState.follow while the page is visible.
public struct RequestData: Sendable {
  public let api: ContractApi
  public init(api: ContractApi) { self.api = api }
  public func title(_ input: CatalogInput) async throws -> CatalogTitleDetail {
    try await api.catalog.details(catalogInput: input)
  }
  public func discover() async throws -> DiscoverRails { try await api.discover.rails() }
  public func rail(_ rail: DiscoverRail, page: Int = 1) async throws -> CatalogPage {
    try await api.discover.page(rail: rail, page: page)
  }
  public func browseOptions(kind: String) async throws -> CatalogBrowseOptions {
    try await api.discover.browseOptions(kind: kind)
  }
  public func browse(_ input: CatalogBrowseInput) async throws -> CatalogBrowsePage {
    try await api.discover.browse(catalogBrowseInput: input)
  }
  public func search(_ query: String, kind: String? = nil, page: Int = 1) async throws -> CatalogPage {
    try await api.catalog.search(query: query, kind: kind, page: page)
  }
  public func gaps(titleId: String) async throws -> CatalogMissingSeasonsOutput {
    try await api.catalog.missingSeasons(titleId: titleId)
  }
  public func mine(cursor: String? = nil, filter: String? = nil) async throws -> RequestPage {
    try await api.requests.mine(cursor: cursor, limit: 40, filter: filter)
  }
  public func queue(cursor: String? = nil) async throws -> RequestQueue {
    try await api.admin.requests.queue(cursor: cursor, limit: 40)
  }
  public func related(_ input: CatalogInput) async throws -> RelatedRails {
    try await api.catalog.related(catalogInput: input)
  }
  public func relatedTitles(_ input: CatalogInput, rail: String) async throws -> RelatedPage {
    try await api.catalog.relatedTitles(ref: input.ref, rail: rail, libraryId: input.libraryId)
  }
}

/// Ask.kt and RequestsHub.kt. Permission and quota remain server decisions.
/// The caller presents requestBlocked before opening the chooser; errors
/// thrown by mutations must be shown using the shared Failure model.
public struct RequestActions: Sendable {
  public let api: ContractApi
  public init(api: ContractApi) { self.api = api }
  public func ask(_ input: CatalogInput, scope: ShowScope? = nil) async throws -> RequestItem {
    try await api.requests.ask(ref: input.ref, libraryId: input.libraryId, scope: scope)
  }
  public func more(id: String, scope: ShowScope) async throws -> RequestItem {
    try await api.requests.addSeasons(id: id, scope: scope)
  }
  /// Undo is available only for the first ask, never an expansion of scope.
  public func cancel(id: String) async throws {
    try await api.requests.cancel(requestId: RequestId(id: id))
  }
  public func follow(id: String) async throws {
    try await api.requests.follow(requestId: RequestId(id: id))
  }
  public func unfollow(id: String) async throws {
    try await api.requests.unfollow(requestId: RequestId(id: id))
  }
  public func add(id: String, libraryId: String? = nil) async throws {
    try await api.admin.requests.approve(id: id, libraryId: libraryId)
  }
  public func decline(id: String, reason: String, note: String? = nil) async throws {
    try await api.admin.requests.decline(id: id, reason: reason, note: note)
  }
}
