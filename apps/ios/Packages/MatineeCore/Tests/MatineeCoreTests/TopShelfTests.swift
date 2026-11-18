import Foundation
import Testing
@testable import MatineeCore

struct TopShelfTests {
  private func item(_ id: String) -> MediaItem {
    MediaItem(id: id, libraryId: "library", fileTitle: id,
      label: ItemLabel(show: "movie", showName: id, year: nil, showKey: id, title: nil,
        untitled: false, episodeNumber: nil, code: nil, shortCode: nil, group: "", groupLabel: []),
      title: nil, seasonNumber: nil, episodeNumber: nil, episode: nil, relativePath: id,
      container: "mkv", mimeType: "video/x-matroska", sizeBytes: 1, modifiedAt: "2024-05-01",
      durationSeconds: 6000, probe: nil, progress: nil, favorite: false)
  }
  @Test func preservesServerRowsAndOrder() {
    let snapshot = topShelfSnapshot(continuing: [item("b"), item("a")], next: [item("c")],
      server: "https://server", user: "user", continuingTitle: "Continue", nextTitle: "Next", label: { $0.fileTitle })
    #expect(snapshot.sections.map(\.title) == ["Continue", "Next"])
    #expect(snapshot.sections.flatMap(\.entries).map(\.id) == ["b", "a", "c"])
    #expect(snapshot.sections[0].entries[0].progress == 0)
    #expect(snapshot.sections[0].entries[0].artworkId == nil)
  }
  @Test func artworkPrefersBackdropToPoster() {
    var media = item("a")
    media.title = TitleSummary(id: "t", libraryId: "library", kind: TitleKind.movie, name: "Movie", year: nil,
      overview: nil, images: Images(poster: Artwork(id: "poster", placeholder: nil),
        backdrop: Artwork(id: "backdrop", placeholder: nil), logo: nil), genres: [], rating: nil,
      contentRating: nil, runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false)
    func entry(_ value: MediaItem) -> TopShelfSnapshot.Entry {
      topShelfSnapshot(continuing: [value], next: [], server: "s", user: "u",
        continuingTitle: "Continue", nextTitle: "Next", label: { $0.fileTitle }).sections[0].entries[0]
    }
    #expect(entry(media).artworkId == "backdrop")
    #expect(!entry(media).poster)
    media.title?.images.backdrop = nil
    #expect(entry(media).artworkId == "poster")
    #expect(entry(media).poster)
  }

  @Test func limitsAndEmptyRows() {
    let snapshot = topShelfSnapshot(continuing: (0..<25).map { item(String($0)) }, next: [],
      server: "https://server", user: "user", continuingTitle: "Continue", nextTitle: "Next", label: { $0.fileTitle })
    #expect(snapshot.sections.count == 1)
    #expect(snapshot.sections[0].entries.count == 12)
  }
  @Test func clampsProgressWithoutDecidingEligibility() {
    var media = item("a")
    media.progress = WatchState(positionSeconds: 9000, completed: true, updatedAt: "2024-05-01")
    let snapshot = topShelfSnapshot(continuing: [media], next: [], server: "s", user: "u",
      continuingTitle: "Continue", nextTitle: "Next", label: { $0.fileTitle })
    #expect(snapshot.sections[0].entries.count == 1)
    #expect(snapshot.sections[0].entries[0].progress == 1)
  }

  @Test func linksAreScopedAndEscaped() {
    let link = TopShelfLink(server: "https://server/path?a=1&b=2", user: "u &?", item: "a/b?", play: true)
    #expect(TopShelfLink(url: link.url) == link)
    #expect(TopShelfLink(url: URL(string: "matinee://top-shelf?item=x")!) == nil)
    #expect(TopShelfLink(url: URL(string: "https://top-shelf")!) == nil)
  }
  @Test func storeRoundTripVersionCleanupAndClear() throws {
    let container = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: container) }
    let store = TopShelfStore(container: container)
    #expect(store.read() == nil)
    var snapshot = topShelfSnapshot(continuing: [item("a")], next: [], server: "s", user: "u",
      continuingTitle: "Continue", nextTitle: "Next", label: { $0.fileTitle })
    snapshot.sections[0].entries[0].image = "a.jpg"
    try store.write(snapshot, images: ["a.jpg": Data([1, 2]), "obsolete.jpg": Data([3])])
    #expect(store.read() == snapshot)
    #expect(try Data(contentsOf: store.imageURL("a.jpg")!) == Data([1, 2]))
    #expect(!FileManager.default.fileExists(atPath: store.imageURL("obsolete.jpg")!.path))
    #expect(store.imageURL("../secret") == nil)
    snapshot.version = 2
    try store.write(snapshot, images: [:])
    #expect(store.read() == nil)
    store.clear()
    #expect(!FileManager.default.fileExists(atPath: store.directory.path))
  }
}
