import Foundation
import Testing

@testable import MatineeCore

func offlineFixture(
  _ id: String, show: String? = nil, season: Int? = nil, episode: Int? = nil, added: Double = 0,
  state: DownloadState = .done, server: String = "https://one/"
) throws -> OfflineItem {
  let json = """
    {"id":"\(id)","libraryId":"l","fileTitle":"\(id)","relativePath":"\(id).mkv","container":"mkv",
    "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2026-01-01T00:00:00Z","durationSeconds":1000,"favorite":false,
    "title":{"id":"\(show ?? "movie-" + id)","libraryId":"l","kind":"\(show == nil ? "movie" : "show")","name":"\(id)","year":2020,"images":{},"genres":[],"favorite":false,"watched":false},
    "seasonNumber":\(season.map(String.init) ?? "null"),"episodeNumber":\(episode.map(String.init) ?? "null"),
    "label":{"show":"\(id)","showName":"\(id)","showKey":"k","untitled":false,"group":"g","groupLabel":[]}}
    """
  let item = try JSONDecoder().decode(MediaItem.self, from: Data(json.utf8))
  var entry = OfflineItem(item: item, kind: .original, file: "", server: server)
  entry.file = "\(entry.key)/video.mkv"
  entry.state = state
  entry.addedAt = added
  return entry
}
@Suite @MainActor struct OfflineTests {
  @Test func homeRows() throws {
    let a = try offlineFixture("a", added: 1)
    let b = try offlineFixture("b", added: 2)
    let c = try offlineFixture("c", added: 3)
    let rows = offlineHomeRows(
      [a, b, c], place: { Place($0.id == "c" ? 990 : 100, 1000) }, watched: { $0.id == "c" })
    #expect(rows.resume.map(\.id) == ["b", "a"])
    let served = offlineHomeRows(
      [a, b, c], place: { $0.id == "c" ? Place(10, 100) : nil }, watched: { _ in false },
      served: .init(resume: ["missing", "a", "b"]))
    #expect(served.resume.map(\.id) == ["a", "b", "c"])
    #expect(
      offlineHomeRows(
        [a], place: { _ in Place(99, 100) }, watched: { _ in true }, served: .init(resume: ["a"])
      ).resume.isEmpty)
  }
  @Test func nextUpAndOrdering() throws {
    let e1 = try offlineFixture("e1", show: "s", season: 1, episode: 1)
    let e2 = try offlineFixture("e2", show: "s", season: 1, episode: 2)
    let e3 = try offlineFixture("e3", show: "s", season: 2, episode: 1)
    let special = try offlineFixture("special", show: "s", season: 0, episode: 1)
    let loose = try offlineFixture("loose", show: "s")
    let rows = offlineHomeRows(
      [loose, special, e3, e2, e1], place: { _ in nil }, watched: { $0.id == "e1" })
    #expect(rows.nextUp.map(\.id) == ["e2"])
    #expect(rows.shows[0].episodes.map(\.id) == ["e1", "e2", "e3", "special", "loose"])
    #expect(offlineHomeRows([e1], place: { _ in nil }, watched: { _ in false }).nextUp.isEmpty)
    let started = offlineHomeRows(
      [e1, e2, e3], place: { $0.id == "e2" ? Place(50, 1000) : nil }, watched: { $0.id == "e1" },
      served: .init(nextUp: ["e2"]))
    #expect(started.resume.map(\.id) == ["e2"])
    #expect(started.nextUp.map(\.id) == ["e3"])
    let picked = offlineHomeRows(
      [e1, e2, e3], place: { _ in nil }, watched: { $0.id == "e1" }, served: .init(nextUp: ["e3"]))
    #expect(picked.nextUp.map(\.id) == ["e3"])
    let movie = try offlineFixture("movie", added: 5)
    let coming = try offlineFixture("coming", state: .running)
    let separated = offlineHomeRows(
      [e1, movie, coming], place: { _ in nil }, watched: { _ in false })
    #expect(separated.movies.map(\.id) == ["movie"])
    #expect(separated.shows.count == 1)
  }
  @Test(.enabled(if: ClientCapabilities.downloads)) func persistenceAndServers() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try DownloadStore(root: root)
    let a = try offlineFixture("same")
    let b = try offlineFixture("same", server: "https://two/")
    for entry in [a, b] {
      try FileManager.default.createDirectory(
        at: root.appending(path: entry.key), withIntermediateDirectories: true)
      try Data("video".utf8).write(to: store.file(entry))
      try await store.put(entry)
    }
    let loaded = try DownloadStore(root: root)
    loaded.server = a.server
    #expect(loaded.all.count == 2)
    #expect(loaded.items.count == 1)
    #expect(loaded.done("same")?.key == a.key)
    let downloads = try Downloads(root: root, configuration: .ephemeral, client: { _ in nil })
    try await downloads.forgetServer(a.server)
    #expect(downloads.store.all.count == 1)
    #expect(!FileManager.default.fileExists(atPath: store.file(a).path))
    #expect(FileManager.default.fileExists(atPath: store.file(b).path))
    let p = try PendingProgress(root: root, server: b.server)
    try p.put("same", .init(positionSeconds: 33, durationSeconds: 100))
    #expect(try PendingProgress(root: root, server: b.server).report("same")?.positionSeconds == 33)
    #expect(try PendingProgress(root: root, server: a.server).report("same") == nil)
  }
  @Test func failures() {
    for code in [
      URLError.cannotConnectToHost, .cannotFindHost, .timedOut, .secureConnectionFailed,
      .notConnectedToInternet,
    ] {
      #expect(downloadFailure(URLError(code)) == .unreachable)
    }
    #expect(downloadFailure(URLError(.networkConnectionLost)) == .brokeOff)
    #expect(
      downloadFailure(
        ApiException(status: 422, code: "encode_failed", message: "This file can't be encoded."))
        == .server("This file can't be encoded."))
    #expect(
      downloadFailure(ApiException(status: 403, code: nil, message: "The server answered 403."))
        == .forbidden)
  }
}
