import Foundation
import Testing

@testable import MatineeCore

private final class DownloadStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Int, [String: String], Data))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let result: (Int, [String: String], Data)
      if request.httpMethod == "DELETE" {
        result = (200, [:], Data())
      } else if request.url?.lastPathComponent == "thumbnail" {
        result = (404, [:], Data())
      } else if let handler = Self.handler {
        result = try handler(request)
      } else {
        throw URLError(.cancelled)
      }
      let (status, headers, data) = result
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!,
        cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}
@Suite(.serialized) @MainActor struct DownloadWorkerTests {
  private func wait(_ condition: () -> Bool) async throws {
    for _ in 0..<200 {
      if condition() { return }
      try await Task.sleep(for: .milliseconds(20))
    }
    Issue.record("Download did not reach expected state")
  }
  @Test func rangeAndRefusalAndRetry() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer {
      try? FileManager.default.removeItem(at: root)
      DownloadStub.handler = nil
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    let store = try DownloadStore(root: root)
    var entry = try offlineFixture("range", state: .queued)
    entry.bytes = 3
    entry.totalBytes = 6
    try FileManager.default.createDirectory(
      at: root.appending(path: entry.key), withIntermediateDirectories: true)
    try Data("abc".utf8).write(to: store.file(entry))
    try store.put(entry)
    DownloadStub.handler = { request in
      #expect(request.value(forHTTPHeaderField: "Range") == "bytes=3-")
      return (206, ["Content-Range": "bytes 3-5/6", "Content-Length": "3"], Data("def".utf8))
    }
    let worker = DownloadWorker(store: store, configuration: config, client: { _ in api })
    await worker.schedule(entry.key)
    try await wait { store.all[entry.key]?.state == .done }
    #expect(try Data(contentsOf: store.file(entry)) == Data("abcdef".utf8))
    var refused = try offlineFixture("refused", state: .queued)
    try FileManager.default.createDirectory(
      at: root.appending(path: refused.key), withIntermediateDirectories: true)
    try store.put(refused)
    DownloadStub.handler = { _ in
      (403, [:], Data(#"{"message":"Downloads are off for this account."}"#.utf8))
    }
    await worker.schedule(refused.key)
    try await wait { store.all[refused.key]?.state == .failed }
    #expect(store.all[refused.key]?.attempts == 1)
    #expect(store.all[refused.key]?.failure == .forbidden)
    #expect(store.all[refused.key]?.error == "Downloads are off for this account.")
    refused = try offlineFixture("retry", state: .queued)
    try FileManager.default.createDirectory(
      at: root.appending(path: refused.key), withIntermediateDirectories: true)
    try store.put(refused)
    DownloadStub.handler = { _ in throw URLError(.networkConnectionLost) }
    await worker.schedule(refused.key)
    try await wait { store.all[refused.key]?.state == .queued }
    #expect(store.all[refused.key]?.attempts == 1)
    #expect(store.all[refused.key]?.retryAt != nil)
    DownloadStub.handler = { _ in (200, ["Content-Length": "2"], Data("ok".utf8)) }
    try store.update(refused.key) { $0.retryAt = nil }
    await worker.schedule(refused.key)
    try await wait { store.all[refused.key]?.state == .done }
  }
  @Test func drainsStagedSegmentsAfterRelaunch() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer {
      try? FileManager.default.removeItem(at: root)
      DownloadStub.handler = nil
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    let store = try DownloadStore(root: root)
    var entry = try offlineFixture("crash", state: .running)
    entry.kind = .device
    entry.serverId = "v"
    entry.bytes = 3
    try FileManager.default.createDirectory(
      at: root.appending(path: entry.key), withIntermediateDirectories: true)
    try Data("init-uncommitted-tail".utf8).write(to: store.file(entry))
    try Data("end".utf8).write(to: root.appending(path: "\(entry.key)/segment-0"))
    try Data().write(to: root.appending(path: "\(entry.key)/segment-0.last"))
    try store.put(entry)
    let loaded = try DownloadStore(root: root)
    DownloadStub.handler = { request in
      #expect(request.httpMethod == "DELETE")
      return (200, [:], Data())
    }
    let worker = DownloadWorker(store: loaded, configuration: config, client: { _ in api })
    await worker.restore()
    try await wait { loaded.all[entry.key]?.state == .done }
    #expect(try Data(contentsOf: loaded.file(entry)) == Data("iniend".utf8))
  }
  @Test func wifiPolicyHoldsQueuedWork() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer {
      try? FileManager.default.removeItem(at: root)
      DownloadStub.handler = nil
    }
    let store = try DownloadStore(root: root)
    let entry = try offlineFixture("wifi", state: .queued)
    try FileManager.default.createDirectory(
      at: root.appending(path: entry.key), withIntermediateDirectories: true)
    try store.put(entry)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    var wifi = false
    DownloadStub.handler = { request in
      #expect(!request.allowsCellularAccess)
      #expect(!request.allowsExpensiveNetworkAccess)
      return (200, [:], Data("ok".utf8))
    }
    let worker = DownloadWorker(
      store: store, configuration: config, networkAllowed: { only in !only || wifi },
      client: { _ in api })
    await worker.schedule(entry.key)
    #expect(store.all[entry.key]?.state == .queued)
    wifi = true
    await worker.schedule(entry.key)
    try await wait { store.all[entry.key]?.state == .done }
  }
  @Test func missingSegmentAndProgressRouting() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer {
      try? FileManager.default.removeItem(at: root)
      DownloadStub.handler = nil
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    let store = try DownloadStore(root: root)
    var entry = try offlineFixture("segments", state: .queued)
    entry.kind = .device
    entry.serverId = "version"
    entry.segment = 2
    entry.bytes = 3
    try FileManager.default.createDirectory(
      at: root.appending(path: entry.key), withIntermediateDirectories: true)
    try Data("ini".utf8).write(to: store.file(entry))
    try store.put(entry)
    DownloadStub.handler = { request in
      #expect(request.url?.host == "one")
      if request.httpMethod == "DELETE" { return (200, [:], Data()) }
      let name = request.url!.lastPathComponent
      #expect(!["init.mp4", "0.m4s", "1.m4s"].contains(name))
      return name == "2.m4s"
        ? (200, ["X-Matinee-Last-Segment": "1"], Data("end".utf8)) : (204, [:], Data())
    }
    let worker = DownloadWorker(store: store, configuration: config, client: { _ in api })
    await worker.schedule(entry.key)
    try await wait { store.all[entry.key]?.state == .done }
    #expect(try Data(contentsOf: store.file(entry)) == Data("iniend".utf8))
    let pending = try PendingProgress(root: root, server: "https://one/")
    try pending.put("item", .init(positionSeconds: 14, durationSeconds: 100))
    try await pending.flush(client: { _ in nil })
    #expect(pending.report("item") != nil)
    DownloadStub.handler = { request in
      #expect(request.url?.host == "one")
      #expect(request.httpMethod == "POST")
      return (200, [:], Data())
    }
    try await pending.flush(client: { server in
      #expect(server == "https://one/")
      return api
    })
    #expect(pending.report("item") == nil)
  }
}
