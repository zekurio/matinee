import Foundation
import Testing
@testable import MatineeCore

private actor RequestConnections {
  var count = 0
  func connect() -> AsyncThrowingStream<[RequestsLiveEvent], any Error> {
    count += 1
    return AsyncThrowingStream { $0.yield([]); $0.finish() }
  }
}
@MainActor struct RequestLiveTests {
  @Test func reconnectsUntilHiddenAndReloadsStructures() async throws {
    let connections = RequestConnections()
    var reloads = 0
    let live = RequestLiveController(retryDelay: .milliseconds(2), stream: { _ in await connections.connect() }, reload: { reloads += 1 })
    live.updateVisible([CatalogInput(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: "1"), libraryId: nil)])
    for _ in 0..<100 {
      if await connections.count >= 2 { break }
      try await Task.sleep(for: .milliseconds(2))
    }
    live.hide()
    let count = await connections.count
    #expect(count >= 2 && reloads >= 2)
    try await Task.sleep(for: .milliseconds(20))
    #expect(await connections.count == count)
  }
}
