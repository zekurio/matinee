import Foundation
import Observation

/// ShowGaps.kt. The page owns the load task, so disappearing cancels retry.
/// A failed provider match tries three more times at 5, 10 and 15 seconds.
@MainActor @Observable public final class RequestShowGaps {
  public private(set) var data: CatalogMissingSeasonsOutput?
  public private(set) var failure: Failure?
  public private(set) var loading = false
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
  public init(sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) { self.sleep = sleep }
  public func load(
    fetch: @Sendable () async throws -> CatalogMissingSeasonsOutput,
    recovered: @MainActor () async -> Void = {}
  ) async {
    generation += 1
    let mine = generation
    loading = true
    defer { if generation == mine { loading = false } }
    for attempt in 0...3 {
      do {
        let value = try await fetch()
        try Task.checkCancellation()
        guard generation == mine else { return }
        data = value; failure = nil
        if attempt > 0 { await recovered() }
        return
      } catch {
        guard generation == mine, Failure(error) != .cancelled else { return }
        failure = Failure(error)
        guard attempt < 3 else { return }
        do { try await sleep(.seconds(5 * (attempt + 1))) } catch { return }
        guard generation == mine else { return }
      }
    }
  }
  public func missing(using state: RequestAvailabilityState) -> [CatalogSeason] {
    requestSeasonsInOrder(overlay(data?.seasons ?? [], using: state))
  }
  public func partial(using state: RequestAvailabilityState) -> [CatalogSeason] {
    overlay(data?.partialSeasons ?? [], using: state)
  }
  public func first(using state: RequestAvailabilityState) -> Bool {
    (missing(using: state) + partial(using: state)).allSatisfy { $0.availability.requestId == nil }
  }
  public var followed: [CatalogInput] { data.map { [CatalogInput(ref: $0.ref, libraryId: nil)] } ?? [] }
  private func overlay(_ seasons: [CatalogSeason], using state: RequestAvailabilityState) -> [CatalogSeason] {
    guard let ref = data?.ref else { return seasons }
    let live = state.titles[ref]?.seasons ?? []
    return seasons.map { season in
      var result = season
      if let current = live.first(where: { $0.number == season.number }) { result.availability = current }
      return result
    }
  }
}
extension RequestData {
  /// BrowseScreen.kt PersonScreen: server catalog credits, no local inference.
  /// Follow visible credit refs through RequestLiveController while shown.
  public func personCredits(name: String, tmdbId: String? = nil) async throws -> [PersonCatalogCredit] {
    try await api.people.get(name: name, tmdbId: tmdbId).catalog
  }
}
