import Foundation

public enum DownloadFailure: Codable, Sendable, Hashable {
  case server(String)
  case unreachable, brokeOff, forbidden
}
public func downloadFailure(_ error: any Error) -> DownloadFailure {
  if let api = error as? ApiException {
    return api.status == 403 ? .forbidden : .server(api.message)
  }
  if let url = error as? URLError,
    [
      .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .timedOut, .notConnectedToInternet,
      .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
    ].contains(url.code)
  {
    return .unreachable
  }
  return .brokeOff
}

private struct Transfer: Codable, Sendable {
  var key: String
  var generation: String
  // -3 image, -2 original, -1 init, nonnegative segment; subtitle uses its index.
  var part: Int
  var subtitle: Bool = false
  var offset: Int64 = 0
  var description: String { String(data: try! JSONEncoder().encode(self), encoding: .utf8)! }
  init(_ entry: OfflineItem, part: Int, subtitle: Bool = false, offset: Int64 = 0) {
    key = entry.key
    generation = entry.generation
    self.part = part
    self.subtitle = subtitle
    self.offset = offset
  }
  static func read(_ task: URLSessionTask) -> Transfer? {
    task.taskDescription.flatMap { try? JSONDecoder().decode(Self.self, from: Data($0.utf8)) }
  }
}

@MainActor public final class DownloadWorker: NSObject, URLSessionDownloadDelegate {
  public static let identifier = "io.github.zekurio.matinee.downloads"
  private let store: DownloadStore
  private let client: @MainActor (String) -> MatineeApi?
  private var session: URLSession!
  private var scheduling: Set<String> = []
  var progressInterval: TimeInterval = 1
  private var lastProgress: [String: Date] = [:]
  private var isBackground = false
  private var wakeups: [String: Task<Void, Never>] = [:]
  private var backgroundCompletion: (@MainActor () -> Void)?
  private var finishedEvents = false
  private var processing = 0
  private func completeBackgroundEvents() {
    guard finishedEvents, processing == 0, scheduling.isEmpty, let completion = backgroundCompletion
    else { return }
    backgroundCompletion = nil
    finishedEvents = false
    completion()
  }
  private let networkAllowed: @MainActor (Bool) -> Bool
  public var unmeteredOnly: Bool {
    didSet {
      guard oldValue != unmeteredOnly else { return }
      Task {
        for entry in store.all.values where entry.state == .running || entry.state == .queued {
          try? await pause(entry.key)
          // Resume data contains the old request's network policy. A Range
          // request is safer when the person changes the allowed network.
          try? FileManager.default.removeItem(
            at: store.root.appending(path: "\(entry.key)/resume.data"))
          try? store.update(entry.key) { $0.state = .queued }
          await schedule(entry.key)
        }
      }
    }
  }
  public init(
    store: DownloadStore, configuration: URLSessionConfiguration? = nil, unmeteredOnly: Bool = true,
    networkAllowed: @escaping @MainActor (Bool) -> Bool = { _ in true },
    client: @escaping @MainActor (String) -> MatineeApi?
  ) {
    self.store = store
    self.client = client
    self.unmeteredOnly = unmeteredOnly
    self.networkAllowed = networkAllowed
    super.init()
    let config =
      configuration ?? URLSessionConfiguration.background(withIdentifier: Self.identifier)
    isBackground = config.identifier != nil
    config.httpShouldSetCookies = false
    config.httpCookieStorage = nil
    // The policy lives on each request so Settings can change it without
    // replacing the background session or losing its existing tasks.
    config.allowsCellularAccess = true
    config.allowsExpensiveNetworkAccess = true
    config.timeoutIntervalForRequest = 300
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }
  /// Call during app launch as well as from the UIApplicationDelegate hook,
  /// retaining Downloads for the app's lifetime so the session can reattach.
  public func handleEventsForBackgroundURLSession(
    identifier: String, completionHandler: @escaping @MainActor () -> Void
  ) -> Bool {
    guard identifier == Self.identifier else { return false }
    backgroundCompletion = completionHandler
    completeBackgroundEvents()
    return true
  }
  public func restore() async {
    for entry in store.all.values where entry.state == .queued || entry.state == .running {
      await schedule(entry.key)
    }
  }
  private func tasks(_ key: String) async -> [URLSessionTask] {
    await session.allTasks.filter {
      Transfer.read($0)?.key == key && $0.state != .completed && $0.state != .canceling
    }
  }
  private func enqueue(
    _ entry: OfflineItem, part: Int, url: String, subtitle: Bool = false, offset: Int64 = 0
  ) async throws {
    guard let api = client(entry.server), let url = URL(string: url) else {
      throw URLError(.userAuthenticationRequired)
    }
    var request = try await api.transport.mediaRequest(url: url)
    request.allowsCellularAccess = !unmeteredOnly
    request.allowsExpensiveNetworkAccess = !unmeteredOnly
    if offset > 0 { request.setValue("bytes=\(offset)-", forHTTPHeaderField: "Range") }
    guard let current = store.all[entry.key], current.generation == entry.generation,
      current.state == .running
    else { return }
    let resume = store.root.appending(path: "\(entry.key)/resume.data")
    let task: URLSessionDownloadTask
    if part == -2, let data = try? Data(contentsOf: resume) {
      task = session.downloadTask(withResumeData: data)
      try? FileManager.default.removeItem(at: resume)
    } else {
      task = session.downloadTask(with: request)
    }
    task.taskDescription =
      Transfer(entry, part: part, subtitle: subtitle, offset: offset).description
    if isBackground { task.earliestBeginDate = entry.retryAt }
    task.resume()
  }
  public func schedule(_ key: String) async {
    guard scheduling.insert(key).inserted else { return }
    defer {
      scheduling.remove(key)
      completeBackgroundEvents()
    }
    guard var entry = store.all[key], [.queued, .running].contains(entry.state),
      networkAllowed(unmeteredOnly)
    else { return }
    if entry.videoComplete {
      await finish(key)
      return
    }
    if let retry = entry.retryAt, retry > Date(), !isBackground {
      wakeups[key]?.cancel()
      wakeups[key] = Task { [weak self] in
        try? await Task.sleep(for: .seconds(retry.timeIntervalSinceNow))
        if !Task.isCancelled { await self?.schedule(key) }
      }
      return
    }
    do {
      try store.update(key) { $0.state = .running }
      entry = store.all[key]!
      guard let api = client(entry.server) else { throw URLError(.userAuthenticationRequired) }
      let active = await tasks(key)
      guard let latest = store.all[key], latest.generation == entry.generation,
        latest.state == .running
      else { return }
      entry = latest
      if entry.kind == .device, entry.bytes > 0 {
        // An append is committed by the atomic index write. Discard an
        // uncommitted tail after a crash, then drain already staged fragments.
        if FileManager.default.fileExists(atPath: store.file(entry).path) {
          let handle = try FileHandle(forWritingTo: store.file(entry))
          try handle.truncate(atOffset: UInt64(entry.bytes))
          try handle.close()
        }
        if try await drain(key) { return }
        entry = store.all[key]!
      }
      if entry.image == nil, !active.contains(where: { Transfer.read($0)?.part == -3 }) {
        try await enqueue(entry, part: -3, url: api.paths.thumbnail(entry.id))
      }
      // The server deletes segments behind the index requested. Background
      // URLSession does not promise task order, even with one connection, so
      // prequeuing several indices can delete a fragment before its task reads
      // it. Unlike a normal HLS server this API needs a single outstanding
      // segment task. Each completion wakes us to queue the next; if deferred,
      // the server stops its encoder and resumes from our cursor later.
      // Batching safely requires a server API that retains unacknowledged parts.
      if entry.kind == .device, entry.serverId == nil {
        guard let spec = entry.spec else { throw URLError(.cannotParseResponse) }
        let version = try await api.downloads.start(id: entry.id, spec: spec)
        guard store.all[key]?.generation == entry.generation, store.all[key]?.state == .running
        else { return }
        try store.update(key) {
          $0.serverId = version.id
          $0.totalBytes = version.plan.estimatedBytes
        }
        entry = store.all[key]!
      }
      for (index, sub) in entry.subtitles.enumerated()
      where !FileManager.default.fileExists(atPath: store.root.appending(path: sub.file).path) {
        if !active.contains(where: {
          let t = Transfer.read($0)
          return t?.subtitle == true && t?.part == index
        }) {
          try await enqueue(
            entry, part: index, url: api.paths.subtitle(entry.id, trackId: sub.track.id),
            subtitle: true)
        }
      }
      if entry.kind == .original {
        if !active.contains(where: { Transfer.read($0)?.part == -2 }) {
          let size = (try? store.file(entry).resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
          try await enqueue(entry, part: -2, url: api.paths.stream(entry.id), offset: Int64(size))
        }
      } else if let id = entry.serverId {
        if entry.bytes == 0 {
          if !active.contains(where: { Transfer.read($0)?.part == -1 }) {
            try await enqueue(entry, part: -1, url: api.paths.downloadInit(id))
          }
        } else {
          for segment in entry.segment..<(entry.segment + 1) {
            let path = store.root.appending(path: "\(key)/segment-\(segment)")
            if !FileManager.default.fileExists(atPath: path.path),
              !active.contains(where: {
                Transfer.read($0)?.part == segment && Transfer.read($0)?.subtitle == false
              })
            {
              try await enqueue(
                entry, part: segment, url: api.paths.downloadSegment(id, segment: segment))
            }
          }
        }
      }
    } catch {
      await failed(key, error: error)
      Task { await self.schedule(key) }
    }
  }
  public func pause(_ key: String) async throws {
    try store.update(key) {
      $0.state = .paused
      $0.generation = UUID().uuidString
    }
    wakeups[key]?.cancel()
    for task in await tasks(key) {
      if let download = task as? URLSessionDownloadTask, Transfer.read(task)?.part == -2 {
        let data = await download.cancelByProducingResumeData()
        if let data, store.all[key] != nil {
          try data.write(to: store.root.appending(path: "\(key)/resume.data"), options: .atomic)
        }
      } else {
        task.cancel()
      }
    }
  }
  public func remove(_ key: String) async throws {
    let entry = store.all[key]
    try await pause(key)
    try store.remove(key)
    if let entry, let id = entry.serverId, let api = client(entry.server) {
      Task { try? await api.downloads.remove(downloadId: id) }
    }
  }
  private func failed(_ key: String, error: any Error) async {
    guard let entry = store.all[key], entry.state == .running else { return }
    let failure = downloadFailure(error)
    // A server refusal is terminal. Android retries non-403 API errors, but
    // that would repeatedly retry an explicit refusal; iOS keeps its message.
    let terminal: Bool
    switch failure {
    case .forbidden: terminal = true
    case .server:
      let status = (error as? ApiException)?.status ?? 400
      terminal = (400..<500).contains(status) || entry.attempts >= 8
    default: terminal = entry.attempts >= 8
    }
    do {
      try store.update(key) {
        $0.failure = failure
        $0.error = (error as? ApiException)?.message
        $0.state = terminal ? .failed : .queued
        $0.attempts += 1
        $0.generation = UUID().uuidString
        $0.retryAt =
          terminal
          ? nil : Date().addingTimeInterval(min(18000, 30 * pow(2, Double(entry.attempts))))
      }
      for task in await tasks(key) { task.cancel() }
      if !terminal { await schedule(key) }
    } catch { AppLog.downloads.error("Could not persist download failure") }
  }
  nonisolated public func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    // URLSession deletes its temporary file when this callback returns.
    let kept = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    do {
      try FileManager.default.moveItem(at: location, to: kept)
      let transfer = Transfer.read(downloadTask)
      let response = downloadTask.response as? HTTPURLResponse
      Task { @MainActor in
        defer { try? FileManager.default.removeItem(at: kept) }
        guard let transfer, let response else { return }
        await self.received(transfer, response: response, file: kept)
      }
    } catch {
      Task { @MainActor in
        if let t = Transfer.read(downloadTask), self.store.all[t.key]?.generation == t.generation {
          await self.failed(t.key, error: error)
        }
      }
    }
  }
  nonisolated public func urlSession(
    _ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?
  ) {
    guard let error, (error as? URLError)?.code != .cancelled, let transfer = Transfer.read(task),
      transfer.part != -3
    else { return }
    Task { @MainActor in
      guard self.store.all[transfer.key]?.generation == transfer.generation else { return }
      if let data = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
        try? data.write(
          to: self.store.root.appending(path: "\(transfer.key)/resume.data"), options: .atomic)
      }
      await self.failed(transfer.key, error: error)
    }
  }
  nonisolated public func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
  ) {
    guard let t = Transfer.read(downloadTask), t.part == -2 else { return }
    Task { @MainActor in
      guard self.store.all[t.key]?.generation == t.generation else { return }
      let now = Date()
      guard now.timeIntervalSince(self.lastProgress[t.key] ?? .distantPast) >= self.progressInterval
      else { return }
      self.lastProgress[t.key] = now
      try? self.store.update(t.key) {
        $0.bytes = t.offset + totalBytesWritten
        if totalBytesExpectedToWrite > 0 { $0.totalBytes = t.offset + totalBytesExpectedToWrite }
      }
    }
  }
  nonisolated public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    Task { @MainActor in
      await self.restore()
      self.finishedEvents = true
      self.completeBackgroundEvents()
    }
  }
  nonisolated public func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest
  ) async -> URLRequest? {
    guard let from = task.originalRequest?.url, let to = request.url,
      from.scheme == to.scheme, from.host == to.host, from.port == to.port
    else { return nil }
    return request
  }
  private func append(_ source: URL, to target: URL, offset: Int64) throws -> Int64 {
    if !FileManager.default.fileExists(atPath: target.path) { try Data().write(to: target) }
    let out = try FileHandle(forWritingTo: target)
    defer { try? out.close() }
    try out.truncate(atOffset: UInt64(offset))
    try out.seekToEnd()
    let input = try FileHandle(forReadingFrom: source)
    defer { try? input.close() }
    var count = offset
    while let data = try input.read(upToCount: 65536), !data.isEmpty {
      try out.write(contentsOf: data)
      count += Int64(data.count)
    }
    try out.synchronize()
    return count
  }
  private func received(_ t: Transfer, response: HTTPURLResponse, file: URL) async {
    processing += 1
    defer {
      processing -= 1
      completeBackgroundEvents()
    }
    guard let entry = store.all[t.key], entry.generation == t.generation, entry.state == .running
    else { return }
    do {
      let status = response.statusCode
      if t.part == -3 {
        if (200..<300).contains(status) {
          let target = store.root.appending(path: "\(t.key)/image.jpg")
          try? FileManager.default.removeItem(at: target)
          try FileManager.default.moveItem(at: file, to: target)
          try store.update(t.key) { $0.image = "\(t.key)/image.jpg" }
        }
        return
      }
      if t.subtitle {
        if (200..<300).contains(status), entry.subtitles.indices.contains(t.part) {
          let target = store.root.appending(path: entry.subtitles[t.part].file)
          try FileManager.default.createDirectory(
            at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
          try FileManager.default.moveItem(at: file, to: target)
        }
        return
      }
      if entry.kind == .device, [404, 409].contains(status), entry.restarts < 2 {
        try await pause(t.key)
        try? FileManager.default.removeItem(at: store.file(entry))
        for url in try FileManager.default.contentsOfDirectory(
          at: store.root.appending(path: t.key), includingPropertiesForKeys: nil)
        where url.lastPathComponent.hasPrefix("segment-") {
          try FileManager.default.removeItem(at: url)
        }
        try store.update(t.key) {
          $0.state = .queued
          $0.serverId = nil
          $0.segment = 0
          $0.bytes = 0
          $0.restarts += 1
        }
        await schedule(t.key)
        return
      }
      if status == 503, entry.kind == .device {
        let delay = min(
          60, max(1, Double(response.value(forHTTPHeaderField: "Retry-After") ?? "5") ?? 5))
        try store.update(t.key) { $0.retryAt = Date().addingTimeInterval(delay) }
        await schedule(t.key)
        return
      }
      guard (200..<300).contains(status) || (status == 416 && t.offset > 0) else {
        let body = try? JSONDecoder().decode(ApiErrorBody.self, from: Data(contentsOf: file))
        throw ApiException(
          status: status, code: body?.code,
          message: body?.message ?? "The server answered \(status).")
      }
      if t.part >= 0 && t.part < entry.segment { return }
      if t.part == -1 && entry.bytes > 0 { return }
      if t.part == -2 {
        let bytes =
          status == 416
          ? t.offset : try append(file, to: store.file(entry), offset: status == 206 ? t.offset : 0)
        try store.update(t.key) {
          $0.bytes = bytes
          $0.totalBytes = bytes
        }
        await finish(t.key)
        return
      }
      if t.part == -1 {
        let bytes = try append(file, to: store.file(entry), offset: 0)
        try store.update(t.key) { $0.bytes = bytes }
      } else {
        let staged = store.root.appending(path: "\(t.key)/segment-\(t.part)")
        try? FileManager.default.removeItem(at: staged)
        try FileManager.default.moveItem(at: file, to: staged)
        if status == 204 || response.value(forHTTPHeaderField: "X-Matinee-Last-Segment") == "1" {
          try Data().write(to: staged.appendingPathExtension("last"))
        }
        if try await drain(t.key) { return }
      }
      // A completed task may still be in allTasks until the delegate returns.
      await schedule(t.key)
    } catch { await failed(t.key, error: error) }
  }
  private func drain(_ key: String) async throws -> Bool {
    guard var entry = store.all[key] else { return false }
    while true {
      let next = store.root.appending(path: "\(key)/segment-\(entry.segment)")
      guard FileManager.default.fileExists(atPath: next.path) else { return false }
      let last = next.appendingPathExtension("last")
      let isLast = FileManager.default.fileExists(atPath: last.path)
      let bytes = try append(next, to: store.file(entry), offset: entry.bytes)
      try store.update(key) {
        $0.bytes = bytes
        $0.segment += 1
      }
      try FileManager.default.removeItem(at: next)
      entry = store.all[key]!
      if isLast {
        try FileManager.default.removeItem(at: last)
        await finish(key)
        return true
      }
    }
  }
  private func finish(_ key: String) async {
    guard let before = store.all[key], [.queued, .running].contains(before.state) else { return }
    try? store.update(key) { $0.videoComplete = true }
    // Subtitle tasks are allowed to finish before the entry is made playable.
    for task in await tasks(key) where Transfer.read(task)?.subtitle == false { task.cancel() }
    guard let entry = store.all[key], entry.generation == before.generation,
      [.queued, .running].contains(entry.state)
    else { return }
    if (await tasks(key)).contains(where: { Transfer.read($0)?.subtitle == true }) {
      wakeups[key] = Task {
        try? await Task.sleep(for: .seconds(1))
        await self.finish(key)
      }
      return
    }
    do {
      for file in try FileManager.default.contentsOfDirectory(
        at: store.root.appending(path: key), includingPropertiesForKeys: nil)
      where file.lastPathComponent.hasPrefix("segment-") || file.lastPathComponent == "resume.data"
      {
        try FileManager.default.removeItem(at: file)
      }
      try store.update(key) {
        $0.subtitles = $0.subtitles.filter {
          FileManager.default.fileExists(atPath: store.root.appending(path: $0.file).path)
        }
        $0.state = .done
        $0.totalBytes = $0.bytes
        $0.serverId = nil
        $0.error = nil
        $0.failure = nil
      }
      if let id = entry.serverId, let api = client(entry.server) {
        Task { try? await api.downloads.remove(downloadId: id) }
      }
    } catch { await failed(key, error: error) }
  }
}
