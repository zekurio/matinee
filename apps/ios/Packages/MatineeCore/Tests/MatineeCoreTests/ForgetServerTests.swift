import Foundation
import Testing

@testable import MatineeCore

/// A server for removing a server: what each host was asked, and how it
/// answers: `ok`, `down` (it can't be reached), or `hangs` (it never answers).
private final class ForgetProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var calls: [String: [String]] = [:]
  static func calls(_ host: String) -> [String] { lock.withLock { calls[host] ?? [] } }

  static func api(_ mode: String) -> (MatineeApi, String) {
    let host = "\(mode)-\(UUID().uuidString.lowercased())"
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ForgetProtocol.self]
    return (MatineeApi(base: URL(string: "http://\(host)/")!, configuration: configuration), host)
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let url = request.url!, host = url.host!
    Self.lock.withLock { Self.calls[host, default: []].append("\(request.httpMethod ?? "GET") \(url.path)") }
    if host.hasPrefix("hangs") { return }
    if host.hasPrefix("down") {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
      return
    }
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data("null".utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@Suite @MainActor struct ForgetServerTests {
  private let gone = "https://gone/", kept = "https://kept/"

  /// A downloads folder with two of `gone`'s downloads, one with a version
  /// the server was making, one of `kept`'s with its own, and what waits to
  /// reach each.
  private func setUp(_ root: URL) async throws -> Downloads {
    let downloads = try Downloads(root: root, configuration: .ephemeral, client: { _ in nil })
    var making = try offlineFixture("making", state: .running, server: gone)
    making.kind = .device
    making.serverId = "version-1"
    let done = try offlineFixture("done", server: gone)
    var other = try offlineFixture("other", state: .running, server: kept)
    other.kind = .device
    other.serverId = "version-2"
    for entry in [making, done, other] {
      try FileManager.default.createDirectory(at: root.appending(path: entry.key), withIntermediateDirectories: true)
      try Data("video".utf8).write(to: downloads.store.file(entry))
      try await downloads.store.put(entry)
    }
    for server in [gone, kept] {
      let pending = try downloads.pendingFor(server)
      try pending.put("done", .init(positionSeconds: 30, durationSeconds: 100))
      try pending.putPlay(.init(sessionId: "s", itemId: "done", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:30:00Z", playedSeconds: 1800, positionSeconds: 30))
    }
    return downloads
  }

  private func expectGoneCleared(_ downloads: Downloads, root: URL) throws {
    #expect(downloads.store.all.values.map(\.server) == [kept])
    #expect(try PendingProgress(root: root, server: gone).report("done") == nil)
    #expect(try PendingProgress(root: root, server: kept).report("done") != nil)
    #expect(FileManager.default.fileExists(atPath: downloads.store.file(downloads.store.all.values.first!).path))
  }

  @Test(.enabled(if: ClientCapabilities.downloads)) func sendsWhatWaitedThenDropsTheServersCopies() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try await setUp(root)
    let (api, host) = ForgetProtocol.api("ok")
    try await downloads.forgetServer(gone, api: api)
    // Plays, then positions, then the version this device's download was making; nothing of the other server's.
    #expect(ForgetProtocol.calls(host) == [
      "POST /api/v1/playback/offline", "POST /api/v1/media/done/progress", "DELETE /api/v1/downloads/version-1",
    ])
    try expectGoneCleared(downloads, root: root)
  }

  @Test(.enabled(if: ClientCapabilities.downloads)) func anUnreachableServerStillLosesWhatsOnTheDevice() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try await setUp(root)
    let (api, host) = ForgetProtocol.api("down")
    try await downloads.forgetServer(gone, api: api)
    // The flush gives up at its first failure; the copy is still asked after.
    #expect(ForgetProtocol.calls(host) == ["POST /api/v1/playback/offline", "DELETE /api/v1/downloads/version-1"])
    try expectGoneCleared(downloads, root: root)
  }

  @Test(.enabled(if: ClientCapabilities.downloads)) func aServerThatNeverAnswersIsLeftAfterItsTime() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try await setUp(root)
    let clock = RequestTestClock()
    var waits = clock.sleeping.stream.makeAsyncIterator()
    downloads.sleep = { try await clock.sleep($0) }
    let (api, host) = ForgetProtocol.api("hangs")
    let removal = Task { try await downloads.forgetServer(gone, api: api) }
    _ = await waits.next()
    // Its eight seconds pass while the server sits on the first request.
    await clock.advance()
    try await removal.value
    #expect(ForgetProtocol.calls(host).first == "POST /api/v1/playback/offline")
    try expectGoneCleared(downloads, root: root)
  }

  @Test(.enabled(if: ClientCapabilities.downloads)) func signedOutThereNothingIsSent() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try await setUp(root)
    try await downloads.forgetServer(gone, api: nil)
    try expectGoneCleared(downloads, root: root)
  }
}
