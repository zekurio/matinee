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
    try await store.put(entry)
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
    try await store.put(refused)
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
    try await store.put(refused)
    DownloadStub.handler = { _ in throw URLError(.networkConnectionLost) }
    await worker.schedule(refused.key)
    try await wait { store.all[refused.key]?.state == .queued }
    #expect(store.all[refused.key]?.attempts == 1)
    #expect(store.all[refused.key]?.retryAt != nil)
    DownloadStub.handler = { _ in (200, ["Content-Length": "2"], Data("ok".utf8)) }
    try await store.update(refused.key) { $0.retryAt = nil }
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
    try await store.put(entry)
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
  @Test func crashBetweenAppendAndIndexReplaysOneFragment() async throws {
    struct Crash: Error {}
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try DownloadStore(root: root)
    var entry = try offlineFixture("crash-window", state: .running)
    entry.kind = .device
    entry.bytes = 3
    entry.serverId = "v"
    let staged = root.appending(path: "\(entry.key)/segment-0")
    try await store.files.directory(staged.deletingLastPathComponent())
    try await store.files.write(Data("ini".utf8), to: store.file(entry))
    try await store.files.write(Data("end".utf8), to: staged)
    try await store.files.write(Data(), to: staged.appendingPathExtension("last"))
    try await store.put(entry)
    await store.files.setBeforeIndexHook { throw Crash() }
    await #expect(throws: Crash.self) {
      try await store.append(staged, entry: entry, offset: 3, segment: true, keepSource: true)
    }
    #expect(try Data(contentsOf: store.file(entry)) == Data("iniend".utf8))
    let loaded = try DownloadStore(root: root)
    #expect(loaded.all[entry.key]?.bytes == 3)
    #expect(loaded.all[entry.key]?.segment == 0)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    let worker = DownloadWorker(store: loaded, configuration: config, client: { _ in api })
    await worker.restore()
    try await wait { loaded.all[entry.key]?.state == .done }
    #expect(try Data(contentsOf: loaded.file(entry)) == Data("iniend".utf8))
    #expect(loaded.all[entry.key]?.segment == 1)
  }

  @Test func largeAppendDoesNotBlockMainActorAndDeleteWins() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try DownloadStore(root: root)
    let entry = try offlineFixture("large", state: .running)
    let source = root.appending(path: "\(entry.key)/piece")
    try await store.files.directory(source.deletingLastPathComponent())
    try await store.files.write(Data("ini".utf8), to: store.file(entry))
    // A larger-than-buffer source forces hundreds of bounded reads.
    try await store.files.write(Data(repeating: 7, count: 32 * 1024 * 1024), to: source)
    try await store.put(entry)
    let started = DispatchSemaphore(value: 0)
    let release = DispatchSemaphore(value: 0)
    await store.files.setAppendHook {
      #expect(!Thread.isMainThread)
      started.signal()
      release.wait()
    }
    let append = Task { try await store.append(source, entry: entry, offset: 3) }
    @Sendable func waitForStart() { started.wait() }
    await Task.detached { waitForStart() }.value
    MainActor.assertIsolated()
    // This executes while the file owner is blocked inside the append hook.
    var heartbeat = false
    await Task { @MainActor in heartbeat = true }.value
    #expect(heartbeat)
    let deletion = Task { try await store.remove(entry.key) }
    await Task.yield()
    release.signal()
    try await append.value
    try await deletion.value
    #expect(store.all[entry.key] == nil)
    #expect(!FileManager.default.fileExists(atPath: store.file(entry).path))
    await #expect(throws: CancellationError.self) {
      try await store.append(source, entry: entry, offset: 3)
    }
    #expect(!FileManager.default.fileExists(atPath: root.appending(path: entry.key).path))
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
    try await store.put(entry)
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
    try await store.put(entry)
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
  @Test func tryingAgainClearsWhatBrokeOff() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    let release = DispatchSemaphore(value: 0)
    defer {
      release.signal()
      try? FileManager.default.removeItem(at: root)
      DownloadStub.handler = nil
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DownloadStub.self]
    let api = MatineeApi(base: URL(string: "https://one/")!, configuration: config)
    let store = try DownloadStore(root: root)
    var entry = try offlineFixture("again", state: .queued)
    entry.failure = .brokeOff
    entry.attempts = 1
    try FileManager.default.createDirectory(
      at: root.appending(path: entry.key), withIntermediateDirectories: true)
    try await store.put(entry)
    DownloadStub.handler = { _ in
      release.wait()
      return (200, ["Content-Length": "2"], Data("ok".utf8))
    }
    let worker = DownloadWorker(store: store, configuration: config, client: { _ in api })
    // Still waiting for its time to try again, it says why.
    try await store.update(entry.key) { $0.retryAt = Date().addingTimeInterval(60) }
    await worker.schedule(entry.key)
    #expect(store.all[entry.key]?.failure == .brokeOff)
    try await store.update(entry.key) { $0.retryAt = nil }
    await worker.schedule(entry.key)
    #expect(store.all[entry.key]?.state == .running)
    #expect(store.all[entry.key]?.failure == nil)
    #expect(store.all[entry.key]?.isBroken == false)
    release.signal()
    try await wait { store.all[entry.key]?.state == .done }
  }
}
