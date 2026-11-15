import Foundation
import Testing

@testable import MatineeCore

@Suite @MainActor struct DownloadListTests {
  @Test func comingInOrderFinishedNewestFirstShowsTogether() throws {
    let movie = try offlineFixture("movie", added: 1)
    let e2 = try offlineFixture("e2", show: "bb", season: 1, episode: 2, added: 2)
    let e1 = try offlineFixture("e1", show: "bb", season: 1, episode: 1, added: 5)
    let special = try offlineFixture("sp", show: "bb", season: 0, episode: 1, added: 3)
    let loose = try offlineFixture("loose", show: "bb", added: 4)
    let s2 = try offlineFixture("s2", show: "bb", season: 2, episode: 1, added: 4)
    let later = try offlineFixture("later", added: 3)
    let second = try offlineFixture("second", added: 9, state: .paused)
    let first = try offlineFixture("first", added: 8, state: .running)
    let list = downloadList([movie, e2, e1, special, loose, s2, later, second, first])
    #expect(list.coming.map(\.id) == ["first", "second"])
    #expect(list.finished.map(\.id) == ["show-bb", "later", "movie"])
    guard case .show(let show) = list.finished.first else {
      Issue.record("The show leads")
      return
    }
    #expect(show.seasons.map(\.number) == [1, 2, 0, nil])
    #expect(show.seasons[0].entries.map { $0.id } == ["e1", "e2"])
    #expect(show.entries.count == 5)
    #expect(show.newestEntry?.id == "e1")
  }

  @Test func whatTheHeadingOffers() throws {
    var running = try offlineFixture("running", state: .running)
    var paused = try offlineFixture("paused", state: .paused)
    #expect(comingAction([running, paused]) == .pauseAll(["running"]))
    #expect(comingAction([paused]) == .resumeAll(["paused"]))
    // Waiting to try again after an error: that comes first.
    running.failure = .unreachable
    #expect(comingAction([running, paused]) == .retryAll(["running"]))
    // A refusal isn't tried again, by the row or the heading.
    paused.state = .failed
    paused.failure = .server("This file can't be encoded.")
    running.failure = nil
    #expect(paused.isRefused)
    #expect(paused.isBroken)
    #expect(comingAction([paused]) == .none)
    #expect(comingAction([paused, running]) == .pauseAll(["running"]))
    var forbidden = try offlineFixture("forbidden", state: .failed)
    forbidden.failure = .forbidden
    #expect(forbidden.isRefused)
    var gaveUp = try offlineFixture("gave-up", state: .failed)
    gaveUp.failure = .brokeOff
    #expect(!gaveUp.isRefused)
    #expect(comingAction([gaveUp, forbidden]) == .retryAll(["gave-up"]))
  }

  @Test func storageCountsOnlyTheServerInUse() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try DownloadStore(root: root)
    let mine = try offlineFixture("mine", server: "https://one/")
    let theirs = try offlineFixture("theirs", server: "https://two/")
    for (entry, size) in [(mine, 10_000), (theirs, 50_000)] {
      try FileManager.default.createDirectory(
        at: root.appending(path: entry.key), withIntermediateDirectories: true)
      try Data(repeating: 1, count: size).write(to: store.file(entry))
      try await store.put(entry)
    }
    store.server = "https://one/"
    let storage = await store.storage()
    // Allocated in whole blocks, so at least the file and well under the other server's.
    #expect(storage.used >= 10_000 && storage.used < 50_000)
    #expect((storage.free ?? 0) > 0)
  }
}
