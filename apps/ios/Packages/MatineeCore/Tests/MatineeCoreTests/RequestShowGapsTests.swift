import Foundation
import Testing
@testable import MatineeCore
private actor GapsServer {
  var attempts = 0
  let failCount: Int
  init(failCount: Int) { self.failCount = failCount }
  func fetch() throws -> CatalogMissingSeasonsOutput {
    attempts += 1
    if attempts <= failCount { throw URLError(.cannotConnectToHost) }
    return CatalogMissingSeasonsOutput(ref: CatalogRef(kind: "show", provider: "tmdb", providerId: "1"), stale: false, seasons: [], partialSeasons: [], defaultScope: .init(seasons: [], future: true), destinations: [])
  }
}
@MainActor struct RequestShowGapsTests {
  @Test func recoversAfterProviderMatchAndRefreshesTitle() async {
    let server = GapsServer(failCount: 2), clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    var recovered = 0
    let gaps = RequestShowGaps(sleep: { try await clock.sleep($0) })
    let task = Task { await gaps.load(fetch: { try await server.fetch() }, recovered: { recovered += 1 }) }
    _ = await waits.next(); await clock.advance()
    _ = await waits.next(); await clock.advance()
    await task.value
    #expect(await server.attempts == 3)
    #expect(recovered == 1 && gaps.data != nil && gaps.failure == nil && !gaps.loading)
    #expect(gaps.followed.count == 1)
  }
  @Test func givesUpAfterThreeRetries() async {
    let server = GapsServer(failCount: 10), clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let gaps = RequestShowGaps(sleep: { try await clock.sleep($0) })
    let task = Task { await gaps.load(fetch: { try await server.fetch() }) }
    for _ in 0..<3 { _ = await waits.next(); await clock.advance() }
    await task.value
    #expect(await server.attempts == 4)
    #expect(gaps.data == nil && gaps.failure != nil && !gaps.loading)
  }
}
