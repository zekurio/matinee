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

  @Test func eachStateSaysWhereItStands() throws {
    var entry = try offlineFixture("a", state: .done)
    entry.bytes = 500
    #expect(downloadStatus(entry, wifiOnly: true) == .size(500))
    #expect(rowAction(entry) == .none)
    entry.state = .running
    entry.totalBytes = 2000
    #expect(downloadStatus(entry, wifiOnly: true) == .progress(500, of: 2000))
    #expect(rowAction(entry) == .pause)
    entry.totalBytes = nil
    #expect(downloadStatus(entry, wifiOnly: true) == .size(500))
    entry.state = .queued
    #expect(downloadStatus(entry, wifiOnly: true) == .waiting(wifi: true))
    #expect(downloadStatus(entry, wifiOnly: false) == .waiting(wifi: false))
    #expect(rowAction(entry) == .pause)
    entry.failure = .unreachable
    #expect(downloadStatus(entry, wifiOnly: true) == .broken(.unreachable))
    #expect(rowAction(entry) == .retry)
    entry.state = .running
    #expect(downloadStatus(entry, wifiOnly: true) == .broken(.unreachable))
    entry.state = .paused
    entry.failure = nil
    #expect(downloadStatus(entry, wifiOnly: true) == .paused)
    #expect(rowAction(entry) == .resume)
    entry.state = .failed
    entry.failure = .brokeOff
    #expect(downloadStatus(entry, wifiOnly: true) == .stopped(.brokeOff))
    #expect(rowAction(entry) == .retry)
    entry.failure = .forbidden
    #expect(rowAction(entry) == .remove)
    // An entry from before the worker kept its reason, with the server's words only.
    entry.failure = nil
    entry.error = "Gone"
    #expect(downloadStatus(entry, wifiOnly: true) == .stopped(.server("Gone")))
  }

  @Test func aShowsMenuPausesWhatMovesAndResumesWhatStopped() throws {
    let running = try offlineFixture("running", state: .running)
    let queued = try offlineFixture("queued", state: .queued)
    let paused = try offlineFixture("paused", state: .paused)
    var gaveUp = try offlineFixture("gave-up", state: .failed)
    gaveUp.failure = .unreachable
    var refused = try offlineFixture("refused", state: .failed)
    refused.failure = .server("No")
    let done = try offlineFixture("done")
    let commands = ShowCommands([running, queued, paused, gaveUp, refused, done])
    #expect(commands.pause == ["running", "queued"])
    #expect(commands.resume == ["paused", "gave-up"])
  }

  @Test func theTabSaysDownloadsAreOffOnlyWhenTheServerSaidSo() {
    #expect(downloadsNotice(count: 0, offline: false, mayDownload: true) == .empty)
    #expect(downloadsNotice(count: 0, offline: false, mayDownload: nil) == .empty)
    #expect(downloadsNotice(count: 0, offline: false, mayDownload: false) == .off)
    #expect(downloadsNotice(count: 3, offline: false, mayDownload: false) == .off)
    #expect(downloadsNotice(count: 0, offline: true, mayDownload: false) == .empty)
    #expect(downloadsNotice(count: 3, offline: true, mayDownload: false) == .none)
    #expect(downloadsNotice(count: 3, offline: false, mayDownload: true) == .none)
  }

  @Test func theSavedPictureIsTheStillOrBackdropElseAFrame() throws {
    let paths = Paths(URL(string: "https://one/")!)
    var item = try offlineFixture("a").item
    #expect(downloadImageURL(item, paths: paths) == "https://one/api/media/a/thumbnail?size=small")
    item.title?.images.backdrop = Artwork(id: "back", placeholder: nil)
    #expect(downloadImageURL(item, paths: paths) == "https://one/api/artwork/back?size=small")
    item.episode = EpisodeInfo(name: nil, overview: nil, airDate: nil, runtimeMinutes: nil, still: Artwork(id: "still", placeholder: nil))
    #expect(downloadImageURL(item, paths: paths) == "https://one/api/artwork/still?size=small")
  }

  @Test(.enabled(if: ClientCapabilities.downloads)) func storageCountsOnlyTheServerInUse() async throws {
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
