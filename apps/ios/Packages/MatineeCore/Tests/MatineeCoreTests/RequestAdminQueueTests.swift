import Foundation
import Testing
@testable import MatineeCore
private actor AdminAnswers {
  var values: [RequestAdminAnswer] = []
  func take(_ answer: RequestAdminAnswer) { values.append(answer) }
}
@MainActor struct RequestAdminQueueTests {
  @Test func undoSendsNothingAndExpirySendsExactlyOnce() async {
    let clock = RequestTestClock(), answers = AdminAnswers()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let queue = RequestAdminQueue(sleep: { try await clock.sleep($0) })
    queue.answer(id: "undo", answer: .add, perform: { _, answer in await answers.take(answer) })
    _ = await waits.next()
    queue.undo(id: "undo")
    await clock.advance()
    #expect(queue.held.isEmpty)
    queue.answer(id: "add", answer: .add, perform: { _, answer in await answers.take(answer) })
    queue.answer(id: "add", answer: .add, perform: { _, answer in await answers.take(answer) })
    _ = await waits.next()
    #expect(await answers.values.isEmpty)
    await clock.advance()
    _ = await waits.next()
    #expect(await answers.values == [.add])
    #expect(queue.held == ["add"] && queue.undoable.isEmpty)
    queue.undo(id: "add")
    await clock.advance(); await queue.settled(id: "add")
    #expect(queue.held.isEmpty)
    let decline = RequestAdminAnswer.decline(reason: "notForServer", note: "No")
    queue.answer(id: "decline", answer: decline, perform: { _, answer in await answers.take(answer) })
    _ = await waits.next(); await clock.advance()
    _ = await waits.next(); await clock.advance()
    await queue.settled(id: "decline")
    #expect(await answers.values == [.add, decline])
  }
  @Test func waitingLookupRequiresAdminAskedAndMatchingId() throws {
    let value = RequestViewParityTests().value("asked", nil, id: "r")
    let title = CatalogTitleSummary(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: "1"), name: "Film", year: nil, poster: nil, availability: value)
    let item = AdminRequestItem(id: "r", title: title, library: .init(id: "films", name: "Films"), scope: nil, createdAt: "2026-01-01", arrivedAt: nil, availability: value, season: nil, status: "waiting", fulfilmentState: nil, error: nil, reason: nil, note: nil, declinedAt: nil, connection: nil, followers: [], destinationDescription: "Films", destinations: [], remoteUrl: nil, diagnostics: [])
    let queue = RequestAdminQueue()
    let counts = try JSONDecoder().decode(RequestQueue.Counts.self, from: Data(#"{"waiting":1,"needsAttention":0,"onTheWay":0,"done":0}"#.utf8))
    queue.queue = RequestQueue(waiting: [item], needsAttention: [], onTheWay: [], done: [], counts: counts, nextCursor: nil)
    #expect(queue.waitingRequest(value, isAdmin: true)?.id == "r")
    #expect(queue.waitingRequest(value, isAdmin: false) == nil)
    var other = value; other.state = "coming"
    #expect(queue.waitingRequest(other, isAdmin: true) == nil)
    other = value; other.requestId = "other"
    #expect(queue.waitingRequest(other, isAdmin: true) == nil)
  }
}
