import Foundation
import Testing
@testable import MatineeCore

actor RequestTestClock {
  let sleeping = AsyncStream<Void>.makeStream()
  private var waiters: [AsyncStream<Void>.Continuation] = []
  func sleep(_ duration: Duration) async throws {
    let gate = AsyncStream<Void>.makeStream()
    waiters.append(gate.continuation)
    sleeping.continuation.yield(())
    for await _ in gate.stream { break }
    try Task.checkCancellation()
  }
  func advance() {
    let ready = waiters; waiters = []
    for waiter in ready { waiter.finish() }
  }
}
private actor RequestConnections {
  var count = 0
  func connect() -> AsyncThrowingStream<[RequestsLiveEvent], any Error> {
    count += 1
    return AsyncThrowingStream { $0.yield([]); $0.finish() }
  }
}
@MainActor struct RequestLiveTests {
  @Test func reconnectsUntilHiddenAndReloadsStructures() async throws {
    let connections = RequestConnections(), clock = RequestTestClock()
    var sleeps = clock.sleeping.stream.makeAsyncIterator()
    var reloads = 0
    let live = RequestLiveController(sleep: { try await clock.sleep($0) }, stream: { _ in await connections.connect() }, reload: { reloads += 1 })
    live.updateVisible([CatalogInput(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: "1"), libraryId: nil)])
    _ = await sleeps.next()
    #expect(await connections.count == 1)
    await clock.advance()
    _ = await sleeps.next()
    live.hide()
    #expect(await connections.count == 2 && reloads == 4)
    await clock.advance()
  }
}
