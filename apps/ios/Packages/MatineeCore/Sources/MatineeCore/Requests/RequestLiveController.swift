import Foundation
import Observation

/// App-owned shared live overlay. updateVisible starts/replaces the stream;
/// hide cancels it. Every connection is a fresh requests.live snapshot.
@MainActor @Observable
public final class RequestLiveController {
  public let state = RequestAvailabilityState()
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var inputs: [CatalogInput] = []
  @ObservationIgnored private let stream: @Sendable ([CatalogInput]) async throws -> AsyncThrowingStream<[RequestsLiveEvent], any Error>
  @ObservationIgnored private let reload: @MainActor () async -> Void
  @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
  public init(
    retryDelay: Duration = .seconds(1),
    sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
    stream: @escaping @Sendable ([CatalogInput]) async throws -> AsyncThrowingStream<[RequestsLiveEvent], any Error>,
    reload: @escaping @MainActor () async -> Void = {}
  ) {
    self.sleep = { _ in try await sleep(retryDelay) }; self.stream = stream; self.reload = reload
  }
  public convenience init(api: ContractApi, reload: @escaping @MainActor () async -> Void = {}) {
    self.init(stream: { try await api.requests.live(titles: $0) }, reload: reload)
  }
  public func updateVisible(_ titles: [CatalogInput]) {
    var seen = Set<CatalogInput>()
    let titles = Array(titles.filter { seen.insert($0).inserted }.prefix(100))
    guard inputs != titles else { return }
    task?.cancel(); inputs = titles
    guard !titles.isEmpty else { task = nil; return }
    let state = state, stream = stream, reload = reload, sleep = sleep
    task = Task {
      while !Task.isCancelled {
        await state.follow(titles, stream: stream, changed: reload)
        guard !Task.isCancelled else { return }
        // Refresh non-streamed structures (gaps, My requests and the queue),
        // not just badges, after any closed connection before reopening it.
        await reload()
        do { try await sleep(.zero) } catch { return }
      }
    }
  }
  public func hide() { task?.cancel(); task = nil; inputs = [] }
  deinit { task?.cancel() }
}
