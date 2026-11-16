import Foundation
import Testing
@testable import MatineeCore

/// The server's side of the queue's actions, one host per test: what each
/// call sent, and the answer `respond` gives it.
private final class QueueActionsProtocol: URLProtocol, @unchecked Sendable {
  struct Call: Sendable, Equatable {
    let method: String
    let path: String
    let query: String?
    let body: [String: String]
  }
  private static let lock = NSLock()
  nonisolated(unsafe) private static var calls: [String: [Call]] = [:]
  nonisolated(unsafe) private static var responders: [String: @Sendable (Call) -> (Int, Data)] = [:]

  static func api(_ respond: @escaping @Sendable (Call) -> (Int, Data) = { _ in (200, Data("null".utf8)) }) -> (ContractApi, String) {
    let host = UUID().uuidString.lowercased()
    lock.withLock { responders[host] = respond }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [QueueActionsProtocol.self]
    return (ContractApi(base: URL(string: "http://\(host).test")!, configuration: configuration), host)
  }
  static func calls(_ host: String) -> [Call] { lock.withLock { calls[host + ".test"] ?? [] } }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let url = request.url!
    let data = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
    let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    // Every value as text, arrays joined, so a call compares as a whole.
    let body = object.mapValues { value -> String in
      if let list = value as? [Any] { return list.map { "\($0)" }.joined(separator: ",") }
      if value is NSNull { return "null" }
      return "\(value)"
    }
    let call = Call(method: request.httpMethod ?? "GET", path: url.path, query: url.query, body: body)
    let host = url.host!
    let respond = Self.lock.withLock {
      Self.calls[host, default: []].append(call)
      return Self.responders[String(host.dropLast(".test".count))]
    }
    let (status, answer) = respond?(call) ?? (404, Data())
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: answer)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
  private static func read(_ stream: InputStream) -> Data {
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      data.append(buffer, count: count)
    }
    return data
  }
}

private actor Sent {
  var values: [[String]] = []
  func take(_ ids: [String]) { values.append(ids) }
}

private func queueItem(_ id: String, status: String = RequestStatus.asked) -> AdminRequestItem {
  let value = RequestViewParityTests().value("asked", nil, id: id)
  let title = CatalogTitleSummary(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: id), name: "Film \(id)", year: nil, poster: nil, availability: value)
  return AdminRequestItem(id: id, title: title, library: .init(id: "films", name: "Films"), scope: nil, createdAt: "2026-01-01", arrivedAt: nil, availability: value, season: nil, status: status, fulfilmentState: nil, error: nil, reason: nil, note: nil, declinedAt: nil, connection: nil, followers: [], destinationDescription: "Films", destinations: [], remoteUrl: nil, diagnostics: [])
}

private func queueOf(waiting: [AdminRequestItem], done: [AdminRequestItem] = [], next: String? = nil) throws -> RequestQueue {
  let counts = try JSONDecoder().decode(RequestQueue.Counts.self, from: Data(#"{"waiting":\#(waiting.count),"needsAttention":0,"onTheWay":0,"done":\#(done.count)}"#.utf8))
  return RequestQueue(waiting: waiting, needsAttention: [], onTheWay: [], done: done, counts: counts, nextCursor: next)
}

@MainActor struct RequestQueueActionsTests {
  @Test func eachAnswerCallsItsProcedure() async throws {
    let (api, host) = QueueActionsProtocol.api()
    let actions = RequestActions(api: api)
    try await actions.answer(id: "r1", .add)
    try await actions.answer(id: "r2", .decline(reason: "notForServer", note: "No"))
    try await actions.answer(id: "r3", .giveUp(note: nil))
    try await actions.answer(id: "r4", .giveUp(note: "Gone"))
    try await actions.answer(id: "r5", .allowAgain)
    try await actions.answer(id: "r6", .addAfterAll)
    try await actions.addAll(ids: ["a", "b"])
    try await actions.retry(id: "r7")
    let calls = QueueActionsProtocol.calls(host)
    typealias Call = QueueActionsProtocol.Call
    #expect(calls == [
      Call(method: "POST", path: "/api/v1/admin/requests/approve", query: nil, body: ["id": "r1"]),
      Call(method: "POST", path: "/api/v1/admin/requests/decline", query: nil, body: ["id": "r2", "reason": "notForServer", "note": "No"]),
      Call(method: "POST", path: "/api/v1/admin/requests/give-up", query: nil, body: ["id": "r3", "note": "null"]),
      Call(method: "POST", path: "/api/v1/admin/requests/give-up", query: nil, body: ["id": "r4", "note": "Gone"]),
      Call(method: "POST", path: "/api/v1/admin/requests/allow-again", query: nil, body: ["id": "r5"]),
      Call(method: "POST", path: "/api/v1/admin/requests/add-after-all", query: nil, body: ["id": "r6"]),
      Call(method: "POST", path: "/api/v1/admin/requests/approve-all", query: nil, body: ["ids": "a,b"]),
      Call(method: "POST", path: "/api/v1/admin/requests/retry", query: nil, body: ["id": "r7"]),
    ])
  }

  @Test func retryPassesTheServersRefusalOn() async {
    let (api, _) = QueueActionsProtocol.api { _ in (409, Data(#"{"message":"Nothing to retry"}"#.utf8)) }
    do {
      try await RequestActions(api: api).retry(id: "r")
      Issue.record("Expected the server's refusal")
    } catch {
      #expect(Failure(error) == .server("Nothing to retry"))
    }
  }

  @Test func everyAnswerGoesBehindTheSameUndo() async throws {
    let (api, host) = QueueActionsProtocol.api()
    let clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let queue = RequestAdminQueue(sleep: { try await clock.sleep($0) })
    let actions = RequestActions(api: api)
    // Undone while it waits: nothing reaches the server.
    queue.answer(id: "undone", answer: .giveUp(note: nil), actions: actions)
    _ = await waits.next()
    queue.undo(id: "undone")
    await clock.advance()
    #expect(queue.held.isEmpty)
    for (id, answer) in [("g", RequestAdminAnswer.giveUp(note: "x")), ("a", .allowAgain), ("f", .addAfterAll)] {
      var changed = false
      queue.answer(id: id, answer: answer, actions: actions) { changed = true }
      _ = await waits.next()
      #expect(queue.held.contains(id) && queue.undoable.contains(id))
      await clock.advance()
      _ = await waits.next()
      // Sent, and still out of the list for the stream's second.
      #expect(changed && queue.held.contains(id) && !queue.undoable.contains(id))
      await clock.advance()
      #expect(await queue.settled(id: id) == nil)
      #expect(!queue.held.contains(id))
    }
    #expect(QueueActionsProtocol.calls(host).map(\.path) == [
      "/api/v1/admin/requests/give-up", "/api/v1/admin/requests/allow-again", "/api/v1/admin/requests/add-after-all",
    ])
  }

  @Test func aFailedAnswerComesBackAfterItsSecond() async {
    let (api, _) = QueueActionsProtocol.api { _ in (400, Data(#"{"message":"Already declined"}"#.utf8)) }
    let clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let queue = RequestAdminQueue(sleep: { try await clock.sleep($0) })
    var changed = false
    queue.answer(id: "r", answer: .allowAgain, actions: RequestActions(api: api)) { changed = true }
    _ = await waits.next()
    await clock.advance()
    _ = await waits.next()
    #expect(queue.held == ["r"] && !changed)
    await clock.advance()
    #expect(await queue.settled(id: "r") == .server("Already declined"))
    #expect(queue.held.isEmpty)
    #expect(await queue.settled(id: "r") == nil)
  }

  @Test func addAllHoldsEveryRowForOneUndo() async throws {
    let clock = RequestTestClock(), sent = Sent()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let queue = RequestAdminQueue(sleep: { try await clock.sleep($0) })
    queue.queue = try queueOf(waiting: [queueItem("a"), queueItem("b"), queueItem("c")])
    #expect(queue.addsAll?.map(\.id) == ["a", "b", "c"])
    // One already answered on its own stays out of Add all.
    queue.answer(id: "c", answer: .add, perform: { _, _ in })
    _ = await waits.next()
    let first = queue.answerAll(ids: ["a", "b", "c"], perform: { @Sendable in await sent.take($0) })
    let undone = try #require(first)
    _ = await waits.next()
    #expect(queue.held == ["a", "b", "c"] && queue.waiting.isEmpty && queue.addsAll == nil)
    queue.undo(id: undone)
    #expect(queue.held == ["c"])
    let none = queue.answerAll(ids: ["c"], perform: { @Sendable in await sent.take($0) })
    #expect(none == nil)
    let held = queue.answerAll(ids: ["a", "b"], perform: { @Sendable in await sent.take($0) })
    let key = try #require(held)
    _ = await waits.next()
    #expect(await sent.values.isEmpty)
    // Undo's time passes for both holds.
    await clock.advance()
    _ = await waits.next(); _ = await waits.next()
    #expect(await sent.values == [["a", "b"]])
    #expect(queue.held == ["a", "b", "c"] && queue.undoable.isEmpty)
    queue.undo(id: key)
    #expect(queue.held == ["a", "b", "c"])
    await clock.advance()
    #expect(await queue.settled(id: key) == nil)
    await queue.settled(id: "c")
    #expect(queue.held.isEmpty)
  }

  @Test func addAllFailureBringsTheRowsBackAtOnce() async throws {
    let (api, host) = QueueActionsProtocol.api { _ in (400, Data(#"{"message":"Too many"}"#.utf8)) }
    let clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    let queue = RequestAdminQueue(sleep: { try await clock.sleep($0) })
    var changed = false
    let started = queue.answerAll(ids: ["a", "b"], actions: RequestActions(api: api)) { changed = true }
    let key = try #require(started)
    _ = await waits.next()
    await clock.advance()
    // No second wait: the task ends as the call fails.
    #expect(await queue.settled(id: key) == .server("Too many"))
    #expect(queue.held.isEmpty && !changed)
    #expect(QueueActionsProtocol.calls(host).map(\.body) == [["ids": "a,b"]])
  }

  @Test func eachListOffersAndroidsActions() throws {
    let waiting = queueItem("w"), declined = queueItem("d", status: RequestStatus.declined)
    let arrived = queueItem("h", status: RequestStatus.approved)
    #expect(requestQueueActions(waiting, in: .waiting) == [.add, .decline])
    #expect(requestQueueActions(waiting, in: .needsAttention) == [.retry, .giveUp])
    #expect(requestQueueActions(waiting, in: .onTheWay) == [.giveUp])
    #expect(requestQueueActions(declined, in: .done) == [.addAfterAll, .allowAgain])
    #expect(requestQueueActions(arrived, in: .done).isEmpty)
    #expect(RequestQueueList.allCases.map(requestQueueRowAction) == [.add, .retry, nil, nil])
    let queue = RequestAdminQueue()
    queue.queue = try queueOf(waiting: [waiting])
    #expect(queue.addsAll == nil)
    queue.answer(id: "d", answer: .allowAgain, perform: { _, _ in })
    #expect(queue.unheld([declined, arrived]).map(\.id) == ["h"])
  }

  @Test func donePagesFollowTheServersCursor() async throws {
    let first = try queueOf(waiting: [], done: [queueItem("d1", status: RequestStatus.declined), queueItem("d2")], next: "c2")
    let second = try queueOf(waiting: [], done: [queueItem("d2"), queueItem("d3")])
    let firstData = try JSONEncoder().encode(first), secondData = try JSONEncoder().encode(second)
    let (api, host) = QueueActionsProtocol.api { call in
      (200, call.query?.contains("cursor=c2") == true ? secondData : firstData)
    }
    let data = RequestData(api: api), cursors = RequestCursors()
    let pages = RequestPages<AdminRequestItem> { $0.id }
    pages.configure(key: "done") { page in try await data.doneBatch(page: page, cursors: cursors) }
    await pages.settled()
    #expect(pages.items.map(\.id) == ["d1", "d2"] && pages.nextPage == 2)
    pages.more()
    await pages.settled()
    #expect(pages.items.map(\.id) == ["d1", "d2", "d3"] && pages.nextPage == nil)
    #expect(QueueActionsProtocol.calls(host).map(\.query) == ["limit=20", "cursor=c2&limit=20"])
    pages.remove { $0.id == "d1" }
    #expect(pages.items.map(\.id) == ["d2", "d3"])
  }
}
