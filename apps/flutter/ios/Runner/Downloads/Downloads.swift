import Foundation
import OSLog

/// The downloads of this app, on a background URLSession that goes on with
/// the app suspended or closed, as Android's WorkManager jobs do: one
/// download's tasks at a time per part, and every step written down so a
/// relaunch picks up from there. It follows Android's rules: the picture
/// and subtitles beside the video, a device version's segments one after
/// another, waiting out a 503, starting over on a 404 or 409 at most twice,
/// a refusal for the account at once, and the rest tried again with backoff.
/// Main thread only; URLSession's callbacks come back to it.
final class Downloads {
  static let identifier = "io.github.zekurio.matinee.offline"
  private static let log = Logger(subsystem: "io.github.zekurio.matinee", category: "downloads")
  private static let maxAttempts = 8

  let store = DownloadStore()
  let credentials = DownloadCredentials()
  private let settings = UserDefaults(suiteName: "io.github.zekurio.matinee.downloads") ?? .standard
  private var session: URLSession!
  /// The device version's start and its release, which a background session can't send.
  private let requests = URLSession(configuration: .ephemeral)
  /// Copying a file the size of a film takes a while, so it isn't done on the main thread.
  private let disk = DispatchQueue(label: "io.github.zekurio.matinee.downloads.disk", qos: .utility)
  private var scheduling: Set<String> = []
  private var again: Set<String> = []
  private var wakeups: [String: Timer] = [:]
  /// Asked for once a launch: a picture that doesn't come is left out.
  private var imageAsked: Set<String> = []
  private var lastProgress: [String: TimeInterval] = [:]
  private var lastStorageCheck: [String: TimeInterval] = [:]
  private var backgroundCompletion: (() -> Void)?
  private var eventsFinished = false
  private var working = 0

  init() {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    // The network policy lives on each request, so the setting can change
    // without replacing the session and losing its tasks.
    configuration.allowsCellularAccess = true
    // Subtitles taken out of a large file can keep the server busy for minutes.
    configuration.timeoutIntervalForRequest = 300
    session = URLSession(configuration: configuration, delegate: SessionDelegate(self), delegateQueue: .main)
  }

  /// Fetch only over unmetered networks. On until Dart says otherwise.
  var unmeteredOnly: Bool {
    get { settings.object(forKey: "unmetered") as? Bool ?? true }
    set {
      guard newValue != unmeteredOnly else { return }
      settings.set(newValue, forKey: "unmetered")
      // Resume data keeps the old request's network policy, so the waiting
      // ones start again from their files with a byte range.
      for entry in store.all where entry.state == .queued || entry.state == .running {
        cancelTasks(entry.id, keepResumeData: false)
        try? FileManager.default.removeItem(at: resumeData(entry.id))
        store.update(entry.id) {
          $0.state = .queued
          $0.generation = UUID().uuidString
        }
        schedule(entry.id)
      }
    }
  }

  func enqueue(_ entry: OfflineEntry) {
    if store[entry.id] == nil { store.put(entry) }
    schedule(entry.id)
  }

  func pause(_ id: String) {
    store.update(id) {
      $0.state = .paused
      $0.generation = UUID().uuidString
    }
    wakeups.removeValue(forKey: id)?.invalidate()
    cancelTasks(id, keepResumeData: true)
  }

  func resume(_ id: String) {
    guard let entry = store.update(id, {
      guard $0.state != .done else { return }
      $0.state = .queued
      $0.errorKind = nil
      $0.error = nil
      $0.attempts = 0
      $0.retryAt = nil
      $0.generation = UUID().uuidString
    }), entry.state != .done else { return }
    cancelTasks(id, keepResumeData: true)
    schedule(id)
  }

  func remove(_ id: String) {
    let entry = store[id]
    wakeups.removeValue(forKey: id)?.invalidate()
    cancelTasks(id, keepResumeData: false)
    store.remove(id)
    if let entry, let serverId = entry.serverId { release(entry, serverId) }
  }

  func forgetServer(_ server: String) {
    for entry in store.all where entry.server == server { remove(entry.id) }
    credentials.forget(server)
  }

  func setCredentials(_ server: String, token: String?, userAgent: String) {
    credentials.set(server, token: token, userAgent: userAgent)
    // Its downloads waited for a sign-in.
    for entry in store.all where entry.server == server && entry.state == .queued { schedule(entry.id) }
  }

  /// Start again what was waiting or running; what's in flight stays.
  func restore() {
    for entry in store.all where entry.state == .queued || entry.state == .running { schedule(entry.id) }
  }

  func freeBytes() -> Int64 {
    (try? store.root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?
      .volumeAvailableCapacityForImportantUsage ?? 0
  }

  /// The system relaunched the app for the session's events; it's told
  /// they're handled once every answer is written down.
  func handleEvents(_ identifier: String, completion: @escaping () -> Void) -> Bool {
    guard identifier == Self.identifier else { return false }
    backgroundCompletion = completion
    completeEvents()
    return true
  }

  // MARK: Scheduling

  private func schedule(_ id: String) {
    guard scheduling.insert(id).inserted else {
      again.insert(id)
      return
    }
    session.getAllTasks { [weak self] tasks in
      DispatchQueue.main.async {
        guard let self else { return }
        self.run(id, tasks: tasks.filter { Transfer.of($0)?.id == id })
        self.scheduling.remove(id)
        if self.again.remove(id) != nil { self.schedule(id) }
        self.completeEvents()
      }
    }
  }

  private func run(_ id: String, tasks: [URLSessionTask]) {
    guard var entry = store[id], entry.state == .queued || entry.state == .running else { return }
    // The server it came from, with that server's sign-in, whichever is in use.
    guard let signIn = credentials.of(entry.server) else { return }
    var active: [Transfer] = []
    for task in tasks where task.state == .running || task.state == .suspended {
      guard let transfer = Transfer.of(task) else { continue }
      if transfer.generation == entry.generation {
        active.append(transfer)
      } else {
        task.cancel()
      }
    }
    if entry.videoDone {
      finish(id, waitingFor: active)
      return
    }
    // Low on storage: it waits, as Android's work does, and one running goes
    // back to waiting with what it has.
    if lowOnStorage() {
      if entry.state == .running { hold(id) }
      wake(id, at: Date().addingTimeInterval(60))
      return
    }
    let now = Date()
    if let retry = entry.retryAt, retry > now {
      wake(id, at: retry)
      // Tasks wait out the time themselves, the version's start can't.
      if entry.kind == .device && entry.serverId == nil { return }
    }
    entry =
      store.update(id) {
        $0.state = .running
        // Trying again: what broke off last time no longer stands, as on
        // Android. A failure on this try sets it again.
        if ($0.retryAt ?? .distantPast) <= now {
          $0.errorKind = nil
          $0.error = nil
        }
      } ?? entry
    let fetch = Fetch(entry: entry, signIn: signIn, earliest: entry.retryAt)
    if entry.image == nil, let address = entry.imageUrl, !active.contains(where: { $0.part == .image }),
      imageAsked.insert(id).inserted
    {
      start(fetch, .image, address)
    }
    for subtitle in entry.subtitles
    where !FileManager.default.fileExists(atPath: store.root.appendingPathComponent(subtitle.file).path)
      && !active.contains(where: { $0.part == .subtitle(subtitle.trackId) })
    {
      start(fetch, .subtitle(subtitle.trackId), subtitle.url)
    }
    if active.contains(where: \.part.isVideo) { return }
    switch entry.kind {
    case .original:
      let have = size(store.file(entry))
      start(fetch, .original, entry.streamUrl, from: have)
    case .device:
      guard let serverId = entry.serverId else { return startVersion(entry, signIn) }
      // The file holds the init segment and the segments before `segment`.
      // One shorter than that lost what was written down, and a segment after
      // the gap would spoil it, so the version starts over.
      let file = store.file(entry)
      if entry.bytes > 0 && size(file) < entry.bytes { return startOver(id) }
      if size(file) > entry.bytes, let handle = try? FileHandle(forWritingTo: file) {
        try? handle.truncate(atOffset: UInt64(entry.bytes))
        try? handle.close()
      }
      // The server deletes segments behind the one asked for, and a
      // background session doesn't keep its tasks in order, so one segment
      // is asked for at a time.
      if entry.bytes == 0 {
        start(fetch, .initSegment, route(entry.apiBase, "downloads", serverId, "init.mp4"))
      } else {
        start(fetch, .segment(entry.segment), route(entry.apiBase, "downloads", serverId, "\(entry.segment).m4s"))
      }
    }
  }

  private struct Fetch {
    let entry: OfflineEntry
    let signIn: DownloadCredentials.SignIn
    let earliest: Date?
  }

  private func start(_ fetch: Fetch, _ part: Transfer.Part, _ address: String, from offset: Int64 = 0) {
    guard let url = URL(string: address) else {
      if !part.isVideo { return }
      return failed(fetch.entry.id, .brokeOff, words: nil, terminal: false)
    }
    let transfer = Transfer(id: fetch.entry.id, generation: fetch.entry.generation, part: part, offset: offset)
    let task: URLSessionDownloadTask
    let saved = resumeData(fetch.entry.id)
    // Resume data holds the request it came from, whose range starts where
    // the file still ends, since nothing is written until a part is all here.
    if part == .original, let data = try? Data(contentsOf: saved) {
      task = session.downloadTask(withResumeData: data)
      try? FileManager.default.removeItem(at: saved)
    } else {
      task = session.downloadTask(with: request(url, fetch.entry, fetch.signIn, from: offset))
    }
    task.taskDescription = transfer.text
    if let earliest = fetch.earliest, earliest > Date() { task.earliestBeginDate = earliest }
    task.resume()
  }

  private func request(
    _ url: URL, _ entry: OfflineEntry, _ signIn: DownloadCredentials.SignIn, from offset: Int64 = 0
  ) -> URLRequest {
    var request = URLRequest(url: url)
    if !signIn.userAgent.isEmpty { request.setValue(signIn.userAgent, forHTTPHeaderField: "User-Agent") }
    if let token = signIn.token, DownloadCredentials.sameOrigin(url, entry.server) {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    if offset > 0 { request.setValue("bytes=\(offset)-", forHTTPHeaderField: "Range") }
    // Unmetered, as Android has it: no cellular, no hotspot, no Low Data Mode.
    request.allowsCellularAccess = !unmeteredOnly
    request.allowsExpensiveNetworkAccess = !unmeteredOnly
    request.allowsConstrainedNetworkAccess = !unmeteredOnly
    return request
  }

  /// `downloads.start`: the server's id for the version, and its estimate of the size.
  private func startVersion(_ entry: OfflineEntry, _ signIn: DownloadCredentials.SignIn) {
    guard let spec = entry.spec, let parsed = try? JSONSerialization.jsonObject(with: Data(spec.utf8)),
      let body = try? JSONSerialization.data(withJSONObject: ["spec": parsed]),
      let url = URL(string: route(entry.apiBase, "v1", "media", entry.id, "downloads"))
    else { return failed(entry.id, .brokeOff, words: nil, terminal: true) }
    var request = request(url, entry, signIn)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = body
    working += 1
    requests.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        defer {
          self.working -= 1
          self.completeEvents()
        }
        guard let current = self.store[entry.id], current.generation == entry.generation, current.state == .running
        else { return }
        if let error { return self.failed(entry.id, failure(error), words: nil, terminal: false) }
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else { return self.refused(entry.id, http.statusCode, data) }
        guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let serverId = json["id"] as? String
        else { return self.failed(entry.id, .brokeOff, words: nil, terminal: false) }
        let estimate = ((json["plan"] as? [String: Any])?["estimatedBytes"] as? NSNumber)?.int64Value
        try? FileManager.default.removeItem(at: self.store.file(current))
        self.store.update(entry.id) {
          $0.serverId = serverId
          $0.segment = 0
          $0.bytes = 0
          $0.totalBytes = estimate ?? $0.totalBytes
        }
        self.schedule(entry.id)
      }
    }.resume()
  }

  /// The server can let go of a version once its file is here, or gone.
  private func release(_ entry: OfflineEntry, _ serverId: String) {
    guard let signIn = credentials.of(entry.server),
      let url = URL(string: route(entry.apiBase, "v1", "downloads", serverId))
    else { return }
    var request = request(url, entry, signIn)
    request.httpMethod = "DELETE"
    // It cleans up after itself in time, so nothing waits on the answer.
    requests.dataTask(with: request).resume()
  }

  // MARK: Answers

  /// URLSession deletes the file once its callback returns, so the callback
  /// moves it here first, and this takes it from there.
  fileprivate func received(_ task: URLSessionDownloadTask, file: URL) {
    guard let transfer = Transfer.of(task), let response = task.response as? HTTPURLResponse,
      let entry = store[transfer.id], entry.generation == transfer.generation, entry.state == .running
    else { return discard(file) }
    let status = response.statusCode
    switch transfer.part {
    case .image:
      let name = "\(entry.id)/image.jpg"
      if (200..<300).contains(status), move(file, to: store.root.appendingPathComponent(name)) {
        store.update(entry.id) { $0.image = name }
      } else {
        discard(file)
      }
    case .subtitle(let trackId):
      guard let subtitle = entry.subtitles.first(where: { $0.trackId == trackId }) else { return discard(file) }
      // A track the server can't convert is left out rather than holding up the video.
      if !(200..<300).contains(status) || !move(file, to: store.root.appendingPathComponent(subtitle.file)) {
        discard(file)
        store.update(entry.id) { $0.subtitles.removeAll { $0.trackId == trackId } }
      }
      if entry.videoDone { schedule(entry.id) }
    case .original:
      if status == 416 && transfer.offset > 0 {
        discard(file)
        let bytes = size(store.file(entry))
        store.update(entry.id) {
          $0.bytes = bytes
          $0.totalBytes = bytes
        }
        return finished(entry)
      }
      guard status == 200 || status == 206 else {
        defer { discard(file) }
        return refused(entry.id, status, try? Data(contentsOf: file))
      }
      let total =
        response.value(forHTTPHeaderField: "Content-Range")?.split(separator: "/").last.flatMap { Int64($0) }
      let offset = status == 206 ? transfer.offset : 0
      write(file, into: store.file(entry), at: offset, for: entry) { [weak self] bytes in
        guard let self else { return }
        self.store.update(entry.id) {
          $0.bytes = bytes
          $0.totalBytes = total ?? bytes
        }
        if let total, bytes < total { return self.failed(entry.id, .brokeOff, words: nil, terminal: false) }
        self.finished(entry)
      }
    case .initSegment, .segment:
      versionAnswered(entry, transfer, response, file)
    }
  }

  private func versionAnswered(_ entry: OfflineEntry, _ transfer: Transfer, _ response: HTTPURLResponse, _ file: URL) {
    let status = response.statusCode
    switch status {
    case 200 where transfer.part == .initSegment && entry.bytes == 0,
      200 where transfer.part == .segment(entry.segment) && entry.bytes > 0:
      let first = transfer.part == .initSegment
      write(file, into: store.file(entry), at: first ? 0 : entry.bytes, for: entry) { [weak self] bytes in
        guard let self else { return }
        self.store.update(entry.id) {
          $0.bytes = bytes
          if !first { $0.segment += 1 }
        }
        if !first && response.value(forHTTPHeaderField: "X-Matinee-Last-Segment") == "1" {
          self.finished(entry)
        } else {
          self.schedule(entry.id)
        }
      }
      return
    case 200:
      // A part from before a break, already written down.
      schedule(entry.id)
    case 204 where transfer.part != .initSegment:
      finished(entry)
    case 503:
      // A version waiting its turn on the server, or a segment being made:
      // wait as it says, then ask again. That's no failure.
      let wait = min(60, max(1, Double(response.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 5))
      store.update(entry.id) { $0.retryAt = Date().addingTimeInterval(wait) }
      schedule(entry.id)
    case 404, 409:
      startOver(entry.id)
    default:
      refused(entry.id, status, try? Data(contentsOf: file))
    }
    discard(file)
  }

  fileprivate func completed(_ task: URLSessionTask, error: Error?) {
    guard let error, let transfer = Transfer.of(task), transfer.part.isVideo,
      (error as? URLError)?.code != .cancelled,
      let entry = store[transfer.id], entry.generation == transfer.generation, entry.state == .running
    else { return }
    if let data = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
      keepResumeData(data, entry.id)
    }
    failed(entry.id, failure(error), words: nil, terminal: false)
  }

  fileprivate func wrote(_ task: URLSessionDownloadTask, total: Int64, expected: Int64) {
    guard let transfer = Transfer.of(task), transfer.part == .original,
      store[transfer.id]?.generation == transfer.generation
    else { return }
    let now = ProcessInfo.processInfo.systemUptime
    guard now - (lastProgress[transfer.id] ?? 0) >= 1 else { return }
    lastProgress[transfer.id] = now
    store.show(transfer.id) {
      $0.bytes = transfer.offset + total
      if expected > 0 { $0.totalBytes = transfer.offset + expected }
    }
    // A look at the room left every few seconds at most, so a filling disk stops it.
    guard now - (lastStorageCheck[transfer.id] ?? 0) >= 5 else { return }
    lastStorageCheck[transfer.id] = now
    if lowOnStorage() {
      hold(transfer.id)
      wake(transfer.id, at: Date().addingTimeInterval(60))
    }
  }

  fileprivate func eventsDone() {
    restore()
    eventsFinished = true
    completeEvents()
  }

  // MARK: Outcomes

  /// The server said no: a refusal for the account stops at once, as does
  /// any other answer it gives the request itself; its own trouble is tried again.
  private func refused(_ id: String, _ status: Int, _ body: Data?) {
    let words = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      .flatMap { ($0["message"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .flatMap { $0.isEmpty ? nil : $0 }
    Self.log.warning("A download stopped: the server answered \(status, privacy: .public)")
    if status == 403 { return failed(id, .forbidden, words: nil, terminal: true) }
    failed(id, .server, words: words, terminal: (400..<500).contains(status))
  }

  private func failed(_ id: String, _ failure: OfflineEntry.Failure, words: String?, terminal: Bool) {
    guard let entry = store[id], entry.state == .running else { return }
    let stop = terminal || entry.attempts + 1 >= Self.maxAttempts
    Self.log.warning("A download stopped: \(failure.rawValue, privacy: .public), try \(entry.attempts + 1, privacy: .public)")
    store.update(id) {
      $0.state = stop ? .failed : .queued
      $0.errorKind = failure
      $0.error = failure == .server ? words : nil
      $0.attempts += 1
      $0.generation = UUID().uuidString
      $0.retryAt = stop ? nil : Date().addingTimeInterval(min(18000, 30 * pow(2, Double(entry.attempts))))
    }
    cancelTasks(id, keepResumeData: true)
    if !stop { schedule(id) }
  }

  /// The server wants the version started over: the file or its settings changed.
  private func startOver(_ id: String) {
    guard let entry = store[id] else { return }
    guard entry.restarts < 2 else { return failed(id, .brokeOff, words: nil, terminal: false) }
    try? FileManager.default.removeItem(at: store.file(entry))
    store.update(id) {
      $0.serverId = nil
      $0.segment = 0
      $0.bytes = 0
      $0.restarts += 1
      $0.generation = UUID().uuidString
    }
    cancelTasks(id, keepResumeData: false)
    schedule(id)
  }

  private func finished(_ entry: OfflineEntry) {
    store.update(entry.id) { $0.videoDone = true }
    schedule(entry.id)
  }

  /// Done once no subtitle is still coming, with only those that came.
  private func finish(_ id: String, waitingFor active: [Transfer]) {
    if active.contains(where: { if case .subtitle = $0.part { true } else { false } }) { return }
    guard let entry = store[id] else { return }
    try? FileManager.default.removeItem(at: resumeData(id))
    store.update(id) {
      $0.subtitles = $0.subtitles.filter {
        FileManager.default.fileExists(atPath: store.root.appendingPathComponent($0.file).path)
      }
      $0.state = .done
      $0.totalBytes = $0.bytes
      $0.serverId = nil
      $0.errorKind = nil
      $0.error = nil
      $0.retryAt = nil
    }
    if let serverId = entry.serverId { release(entry, serverId) }
  }

  /// Back to waiting with what it has, as WorkManager stops Android's
  /// worker when storage runs low.
  private func hold(_ id: String) {
    store.update(id) {
      guard $0.state == .running else { return }
      $0.state = .queued
      $0.generation = UUID().uuidString
    }
    cancelTasks(id, keepResumeData: true)
  }

  private func cancelTasks(_ id: String, keepResumeData: Bool) {
    session.getAllTasks { [weak self] tasks in
      for task in tasks where Transfer.of(task)?.id == id {
        if keepResumeData, Transfer.of(task)?.part == .original, let download = task as? URLSessionDownloadTask {
          download.cancel(byProducingResumeData: { data in
            guard let data else { return }
            DispatchQueue.main.async {
              guard let self, self.store[id] != nil else { return }
              self.keepResumeData(data, id)
            }
          })
        } else {
          task.cancel()
        }
      }
    }
  }

  /// Looks again later: nothing tells the app when room is made or a wait is over.
  private func wake(_ id: String, at date: Date) {
    wakeups.removeValue(forKey: id)?.invalidate()
    let timer = Timer(fire: date, interval: 0, repeats: false) { [weak self] _ in
      self?.wakeups[id] = nil
      self?.schedule(id)
    }
    RunLoop.main.add(timer, forMode: .common)
    wakeups[id] = timer
  }

  private func completeEvents() {
    guard eventsFinished, scheduling.isEmpty, working == 0, let completion = backgroundCompletion else { return }
    backgroundCompletion = nil
    eventsFinished = false
    completion()
  }

  // MARK: Files

  private func discard(_ file: URL) { try? FileManager.default.removeItem(at: file) }

  private func keepResumeData(_ data: Data, _ id: String) {
    try? FileManager.default.createDirectory(at: store.folder(id), withIntermediateDirectories: true)
    try? data.write(to: resumeData(id), options: .atomic)
  }

  private func resumeData(_ id: String) -> URL { store.folder(id).appendingPathComponent("resume.data") }

  private func size(_ url: URL) -> Int64 {
    ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.int64Value ?? 0
  }

  private func move(_ file: URL, to target: URL) -> Bool {
    let files = FileManager.default
    try? files.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? files.removeItem(at: target)
    return (try? files.moveItem(at: file, to: target)) != nil
  }

  /// Puts [file] into [target] from [offset] on, cutting off whatever is
  /// past it, on the disk before [done] hears the new length, so the
  /// length written down never runs ahead of the file.
  private func write(
    _ file: URL, into target: URL, at offset: Int64, for entry: OfflineEntry, done: @escaping (Int64) -> Void
  ) {
    working += 1
    disk.async { [weak self] in
      let result = Result { try append(file, into: target, at: offset) }
      DispatchQueue.main.async {
        guard let self else { return }
        defer {
          self.working -= 1
          self.completeEvents()
        }
        try? FileManager.default.removeItem(at: file)
        guard let current = self.store[entry.id], current.generation == entry.generation, current.state == .running
        else { return }
        switch result {
        case .success(let bytes): done(bytes)
        case .failure: self.failed(entry.id, .brokeOff, words: nil, terminal: false)
        }
      }
    }
  }

  private func lowOnStorage() -> Bool {
    guard
      let values = try? store.root.resourceValues(forKeys: [
        .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey,
      ]),
      let available = values.volumeAvailableCapacityForImportantUsage, let total = values.volumeTotalCapacity
    else { return false }
    // Android's low storage: at or under the lesser of 5% of the volume and 500 MiB.
    return available <= min(Int64(total) * 5 / 100, 500 * 1024 * 1024)
  }
}

private func append(_ file: URL, into target: URL, at offset: Int64) throws -> Int64 {
  let files = FileManager.default
  try files.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
  if offset == 0 {
    try? files.removeItem(at: target)
    try files.moveItem(at: file, to: target)
  } else {
    let out = try FileHandle(forWritingTo: target)
    defer { try? out.close() }
    try out.truncate(atOffset: UInt64(offset))
    try out.seekToEnd()
    let input = try FileHandle(forReadingFrom: file)
    defer { try? input.close() }
    while let data = try input.read(upToCount: 1 << 20), !data.isEmpty {
      try out.write(contentsOf: data)
    }
  }
  let handle = try FileHandle(forUpdating: target)
  defer { try? handle.close() }
  try handle.synchronize()
  return Int64(try handle.seekToEnd())
}

private func failure(_ error: Error) -> OfflineEntry.Failure {
  let unreachable: [URLError.Code] = [
    .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .timedOut, .notConnectedToInternet,
    .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
  ]
  if let error = error as? URLError, unreachable.contains(error.code) { return .unreachable }
  return .brokeOff
}

/// [base] and [segments] as one address, each segment escaped.
private func route(_ base: String, _ segments: String...) -> String {
  var allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  allowed.insert(charactersIn: "-._~")
  let trimmed = base.hasSuffix("/") ? String(base.reversed().drop { $0 == "/" }.reversed()) : base
  return trimmed + segments.map { "/" + ($0.addingPercentEncoding(withAllowedCharacters: allowed) ?? $0) }.joined()
}

/// What a task fetches, kept in its description so it's known again after a relaunch.
private struct Transfer: Codable {
  enum Part: Codable, Equatable {
    case image, original, initSegment
    case segment(Int)
    case subtitle(String)

    var isVideo: Bool {
      switch self {
      case .original, .initSegment, .segment: true
      case .image, .subtitle: false
      }
    }
  }

  var id: String
  var generation: String
  var part: Part
  /// Where an original's byte range started.
  var offset: Int64

  var text: String { String(decoding: (try? JSONEncoder().encode(self)) ?? Data(), as: UTF8.self) }

  static func of(_ task: URLSessionTask) -> Transfer? {
    task.taskDescription.flatMap { try? JSONDecoder().decode(Transfer.self, from: Data($0.utf8)) }
  }
}

/// URLSession's delegate, apart from [Downloads] so the session, which keeps
/// its delegate until it's invalidated, doesn't keep the downloads alive.
/// Its queue is the main queue.
private final class SessionDelegate: NSObject, URLSessionDownloadDelegate {
  private weak var downloads: Downloads?

  init(_ downloads: Downloads) {
    self.downloads = downloads
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    // The file goes when this returns, so it's moved somewhere of the app's own first.
    let kept = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    guard (try? FileManager.default.moveItem(at: location, to: kept)) != nil else { return }
    downloads?.received(downloadTask, file: kept)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    downloads?.completed(task, error: error)
  }

  func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
  ) {
    downloads?.wrote(downloadTask, total: totalBytesWritten, expected: totalBytesExpectedToWrite)
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    downloads?.eventsDone()
  }

  /// A redirect only within the server, so the token goes nowhere else.
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let from = task.originalRequest?.url, let to = request.url, from.scheme == to.scheme,
      from.host == to.host, from.port == to.port
    else { return completionHandler(nil) }
    completionHandler(request)
  }
}
