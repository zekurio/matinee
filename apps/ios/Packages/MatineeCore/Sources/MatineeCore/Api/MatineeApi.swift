import Foundation

public typealias MatineeApi = ContractApi
extension ContractApi {
  public init(
    base: URL, configuration: URLSessionConfiguration = .default,
    tokenProvider: @escaping @Sendable () async -> String? = { nil }
  ) {
    self.init(
      transport: ApiTransport(
        base: base, configuration: configuration, tokenProvider: tokenProvider))
  }
  public var base: URL { transport.base }
  public var paths: Paths { Paths(base) }
  public func titleItems(_ id: String, season: Int? = nil) async throws -> [MediaItem] {
    try await titles.items(id: id, season: season.map { .value($0) } ?? .omitted)
  }
  public func looseItems(_ id: String) async throws -> [MediaItem] {
    try await titles.items(id: id, season: .null)
  }
  public func trickplayUntilSettled(_ id: String) -> AsyncThrowingStream<TrickplayStatus, any Error>
  {
    AsyncThrowingStream { continuation in
      let task = Task {
        do {
          while !Task.isCancelled {
            var pending = false
            for try await status in try await media.trickplay(id: id) {
              continuation.yield(status)
              if case .pending = status {
                pending = true
              } else {
                continuation.finish()
                return
              }
            }
            if !pending { break }
          }
          continuation.finish()
        } catch { continuation.finish(throwing: error) }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
