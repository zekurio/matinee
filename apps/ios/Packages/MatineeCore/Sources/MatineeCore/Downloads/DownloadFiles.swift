import Foundation

/// Serial disk ownership. Methods never suspend while touching files or committing
/// the index, so deletion cannot interleave with an append.
actor DownloadFiles {
  let root: URL
  private var entries: [String: OfflineItem]
  private var revision = 0
  var appendHook: (@Sendable () throws -> Void)?
  private var beforeIndexHook: (@Sendable () throws -> Void)?
  init(root: URL, entries: [String: OfflineItem]) {
    self.root = root
    self.entries = entries
  }
  struct Snapshot: Sendable {
    let revision: Int
    let entries: [String: OfflineItem]
  }
  func change(_ key: String, _ change: @Sendable (inout OfflineItem) -> Void) throws -> Snapshot {
    var next = entries
    if var entry = next[key] {
      change(&entry)
      next[key] = entry
    }
    return try save(next)
  }
  func put(_ entry: OfflineItem) throws -> Snapshot {
    var next = entries
    next[entry.key] = entry
    return try save(next)
  }
  func remove(_ key: String) throws -> Snapshot {
    try delete(root.appending(path: key))
    var next = entries
    next[key] = nil
    return try save(next)
  }
  private func save(_ next: [String: OfflineItem]) throws -> Snapshot {
    try JSONEncoder().encode(Array(next.values)).write(
      to: root.appending(path: "index.json"), options: .atomic)
    entries = next
    revision += 1
    return Snapshot(revision: revision, entries: entries)
  }
  nonisolated static func keepTemporary(_ location: URL) throws -> URL {
    // URLSession removes this URL as soon as its synchronous delegate returns.
    // Adopt it on that background delegate queue before crossing to the actor.
    // The private UUID URL is not visible to other file operations yet.
    let kept = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.moveItem(at: location, to: kept)
    return kept
  }
  func storageUsed() -> Int64 {
    guard
      let files = FileManager.default.enumerator(
        at: root, includingPropertiesForKeys: [.fileSizeKey])
    else { return 0 }
    return files.compactMap { $0 as? URL }.reduce(0) { $0 + size($1) }
  }
  /// The space the folders of `keys` take on disk, as the file system
  /// allocates it, so it reads as `du` and the system's storage settings do.
  func storageUsed(keys: [String]) -> Int64 {
    let wanted: Set<URLResourceKey> = [.totalFileAllocatedSizeKey, .fileSizeKey, .isRegularFileKey]
    var total: Int64 = 0
    for key in keys {
      guard
        let files = FileManager.default.enumerator(
          at: root.appending(path: key), includingPropertiesForKeys: Array(wanted))
      else { continue }
      for case let url as URL in files {
        guard let values = try? url.resourceValues(forKeys: wanted), values.isRegularFile == true else {
          continue
        }
        total += Int64(values.totalFileAllocatedSize ?? values.fileSize ?? 0)
      }
    }
    return total
  }
  func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }
  func size(_ url: URL) -> Int64 {
    Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
  }
  func read(_ url: URL) throws -> Data { try Data(contentsOf: url) }
  func write(_ data: Data, to url: URL) throws { try data.write(to: url, options: .atomic) }
  func delete(_ url: URL) throws {
    if exists(url) { try FileManager.default.removeItem(at: url) }
  }
  func directory(_ url: URL) throws {
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
  }
  func contents(_ url: URL) throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
  }
  private func check(_ entry: OfflineItem) throws {
    guard entries[entry.key]?.generation == entry.generation,
      entries[entry.key]?.state == .running
    else { throw CancellationError() }
  }
  func move(_ source: URL, to target: URL, entry: OfflineItem) throws {
    try check(entry)
    try directory(target.deletingLastPathComponent())
    try delete(target)
    try FileManager.default.moveItem(at: source, to: target)
  }
  func truncate(_ target: URL, bytes: Int64, entry: OfflineItem) throws {
    try check(entry)
    guard exists(target) else { return }
    let handle = try FileHandle(forWritingTo: target)
    defer { try? handle.close() }
    try handle.truncate(atOffset: UInt64(entries[entry.key]?.bytes ?? bytes))
  }
  func append(
    _ source: URL, to target: URL, offset: Int64, entry: OfflineItem, keepSource: Bool = false
  ) throws -> Int64 {
    try check(entry)
    try appendHook?()
    // A staged fragment must survive until the index commits. On a crash we
    // truncate to the saved cursor and replay that fragment, without duplication.
    if offset == 0 && !keepSource {
      try delete(target)
      do {
        try FileManager.default.moveItem(at: source, to: target)
        let handle = try FileHandle(forWritingTo: target)
        defer { try? handle.close() }
        try handle.synchronize()
        return size(target)
      } catch { if !exists(source) { throw error } }
    }
    if !exists(target) { try Data().write(to: target) }
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
    // File bytes are flushed first; only then may the caller save the cursor.
    try out.synchronize()
    return count
  }
  func commitAppend(
    _ source: URL, entry: OfflineItem, offset: Int64, segment: Bool, keepSource: Bool
  ) throws -> Snapshot {
    if entry.kind == .device,
      let current = entries[entry.key],
      current.bytes != entry.bytes || current.segment != entry.segment
    {
      return Snapshot(revision: revision, entries: entries)
    }
    let bytes = try append(
      source, to: root.appending(path: entry.file), offset: offset, entry: entry,
      keepSource: keepSource)
    try beforeIndexHook?()
    return try change(entry.key) {
      $0.bytes = bytes
      if segment { $0.segment += 1 }
      if entry.kind == .original { $0.totalBytes = bytes }
    }
  }
  func setBeforeIndexHook(_ hook: (@Sendable () throws -> Void)?) { beforeIndexHook = hook }
  func setAppendHook(_ hook: (@Sendable () throws -> Void)?) { appendHook = hook }
}
