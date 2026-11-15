import Foundation
import Testing

@testable import MatineeCore

@Suite @MainActor struct OfflinePlaybackTests {
  @Test func serverBoundPlaybackAndQueuedReports() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try Downloads(root: root, configuration: .ephemeral, client: { _ in nil })
    let a = try offlineFixture("same")
    let b = try offlineFixture("same", server: "https://two/")
    for entry in [a, b] {
      try FileManager.default.createDirectory(
        at: root.appending(path: entry.key), withIntermediateDirectories: true)
      try Data("video".utf8).write(to: downloads.store.file(entry))
      try await downloads.store.put(entry)
    }
    let adapter = ServerPlayerDownloads(downloads: downloads, server: a.server)
    downloads.store.server = b.server
    let pending = try downloads.pendingFor(a.server)
    try pending.put(a.id, .init(positionSeconds: 42, durationSeconds: 1000))
    let local = try await adapter.playback(itemId: a.id)
    #expect(local.file == downloads.store.file(a))
    #expect(local.at == 42)
    await adapter.queueReport(
      itemId: a.id, report: .init(positionSeconds: 55, durationSeconds: 1000),
      play: .init(
        sessionId: "sitting", itemId: a.id, startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:00:13Z", playedSeconds: 13, positionSeconds: 55,
        durationSeconds: 1000))
    #expect(pending.report(a.id)?.positionSeconds == 55)
    #expect(try downloads.pendingFor(b.server).report(b.id) == nil)
    let files = try FileManager.default.contentsOfDirectory(
      at: root, includingPropertiesForKeys: nil)
    let saved = try #require(files.first { $0.lastPathComponent.hasPrefix("pending-") })
    let json = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: saved))
    let encoded = String(decoding: try JSONEncoder().encode(json), as: UTF8.self)
    #expect(encoded.contains("sitting"))
    #expect(encoded.contains("playedSeconds"))
    try FileManager.default.removeItem(at: local.file)
    await #expect(throws: NoDownload.self) { try await adapter.playback(itemId: a.id) }
  }

  @Test func nextDownloadedEpisode() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let downloads = try Downloads(root: root, configuration: .ephemeral, client: { _ in nil })
    let first = try offlineFixture("first", show: "show", season: 1, episode: 1)
    let next = try offlineFixture("next", show: "show", season: 1, episode: 3)
    let later = try offlineFixture("later", show: "show", season: 2, episode: 1)
    for entry in [first, later, next] {
      try FileManager.default.createDirectory(
        at: root.appending(path: entry.key), withIntermediateDirectories: true)
      try Data().write(to: downloads.store.file(entry))
      try await downloads.store.put(entry)
    }
    let adapter = ServerPlayerDownloads(downloads: downloads, server: first.server)
    #expect(await adapter.next(after: first.item)?.id == next.id)
    #expect(await adapter.next(after: next.item)?.id == later.id)
    #expect(await adapter.next(after: later.item) == nil)
  }
}
