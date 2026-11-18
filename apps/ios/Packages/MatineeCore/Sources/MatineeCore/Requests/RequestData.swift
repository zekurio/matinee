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
  /// Each of `seasons` of `ref` with the season's live state, where the
  /// stream has said one, as Android's `RequestsHub.seasons`.
  public func seasons(_ ref: CatalogRef, _ seasons: [CatalogSeason]) -> [CatalogSeason] {
    let live = titles[ref]?.seasons ?? []
    guard !live.isEmpty else { return seasons }
    return seasons.map { season in
      var result = season
      if let current = live.first(where: { $0.number == season.number }) { result.availability = current }
      return result
    }
  }
  /// The live state of season `number` of `ref`, or `fallback`.
  public func season(_ ref: CatalogRef, _ number: Int, fallback: SeasonAvailability) -> SeasonAvailability {
    titles[ref]?.seasons.first { $0.number == number } ?? fallback
  }
  /// What the server answered an ask with, shown everywhere at once, ahead
  /// of the stream; the seasons the stream said stay until it says more.
  public func apply(_ ref: CatalogRef, availability: Availability, season: SeasonAvailability? = nil) {
    var seasons = titles[ref]?.seasons ?? []
    if let season {
      seasons.removeAll { $0.number == season.number }
      seasons.append(season)
    }
    titles[ref] = RequestsLiveEvent(ref: ref, availability: availability, seasons: seasons)
  }
  public func follow(
    _ inputs: [CatalogInput],
    stream: @Sendable ([CatalogInput]) async throws -> AsyncThrowingStream<[RequestsLiveEvent], any Error>,
    changed: @MainActor () async -> Void = {}
  ) async {
    var seen = Set<CatalogInput>()
    let refs = Array(inputs.filter { seen.insert($0).inserted }.prefix(100))
    guard !refs.isEmpty else { return }
    do {
      for try await events in try await stream(refs) {
        try Task.checkCancellation()
        for event in events { titles[event.ref] = event }
        failure = nil
        await changed()
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
  /// A Discover row's cards: the first page of its browse, or what came from its seed.
  public func row(_ rail: DiscoverRail) async throws -> DiscoverRow {
    try await api.discover.row(id: rail.id, seed: rail.seed)
  }
  public func browse(_ input: CatalogBrowseInput) async throws -> CatalogBrowsePage {
    try await api.discover.browse(catalogBrowseInput: input)
  }
  public func search(_ query: String, kind: String? = nil, page: Int = 1) async throws -> CatalogPage {
    try await api.catalog.search(query: query, kind: kind, page: page)
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
  /// Undo is available only for the first ask, never an expansion of scope.
  public func cancel(id: String) async throws {
    try await api.requests.cancel(requestId: RequestId(id: id))
  }
  public func add(id: String, libraryId: String? = nil) async throws {
    try await api.admin.requests.approve(id: id, libraryId: libraryId)
  }
  public func decline(id: String, reason: String, note: String? = nil) async throws {
    try await api.admin.requests.decline(id: id, reason: reason, note: note)
  }
  /// Add all: the waiting requests in `ids`, the ones on screen, in one call.
  public func addAll(ids: [String]) async throws {
    try await api.admin.requests.approveAll(ids: ids)
  }
  /// Give up on an accepted request; the server declines it with "Can't find a copy".
  public func giveUp(id: String, note: String? = nil) async throws {
    try await api.admin.requests.giveUp(id: id, note: note)
  }
  public func allowAgain(id: String) async throws {
    try await api.admin.requests.allowAgain(requestId: RequestId(id: id))
  }
  public func addAfterAll(id: String) async throws {
    try await api.admin.requests.addAfterAll(requestId: RequestId(id: id))
  }
  /// Sends a request that needs attention again. Nothing holds it: no Undo, as Android's.
  public func retry(id: String) async throws {
    try await api.admin.requests.retry(requestId: RequestId(id: id))
  }
  /// Sends one answer from the queue or a title's page.
  public func answer(id: String, _ answer: RequestAdminAnswer) async throws {
    switch answer {
    case .add: try await add(id: id)
    case .decline(let reason, let note): try await decline(id: id, reason: reason, note: note)
    case .giveUp(let note): try await giveUp(id: id, note: note)
    case .allowAgain: try await allowAgain(id: id)
    case .addAfterAll: try await addAfterAll(id: id)
    }
  }
}
