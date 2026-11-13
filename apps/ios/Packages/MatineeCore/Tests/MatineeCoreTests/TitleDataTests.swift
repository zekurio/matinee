import Foundation
import Testing

@testable import MatineeCore

struct TitleDataTests {
  private func item(_ id: String, position: Double? = nil, completed: Bool = false) -> MediaItem {
    var item = Answers.item(id)
    if let position {
      item.progress = WatchState(positionSeconds: position, completed: completed, updatedAt: "2024-01-01T00:00:00Z")
    }
    return item
  }

  private func title(kind: String = TitleKind.show, seasons: Int = 2, next: MediaItem? = nil) -> Title {
    Title(
      id: "t", libraryId: "l", kind: kind, name: "Show", year: nil, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil,
      contentRating: nil, originalLanguage: nil, favorite: false, watched: false,
      originalName: nil, tagline: nil, releaseDate: nil, status: nil, runtimeMinutes: nil,
      path: "Show", provider: nil, providerId: nil, externalIds: [:], refreshedAt: nil,
      studios: [], credits: [], trailers: [], itemCount: 3,
      seasons: (0..<seasons).map {
        Season(number: $0 + 1, name: "S", overview: nil, poster: nil, itemCount: 3, watchedCount: 0)
      }, next: next)
  }

  @Test func playStartsTheEpisodeInProgressThenTheFirstUnwatched() {
    let watched: Set<String> = ["a"]
    let isWatched = { (item: MediaItem) in watched.contains(item.id) }
    let list = [item("a", position: 10, completed: true), item("b"), item("c", position: 30)]
    #expect(seasonNext(list, isWatched: isWatched)?.id == "c")
    #expect(seasonNext(Array(list.prefix(2)), isWatched: isWatched)?.id == "b")
    #expect(seasonNext([list[0]], isWatched: isWatched)?.id == "a")
    #expect(seasonNext(nil, isWatched: isWatched) == nil)
  }

  @Test func aSeasonIsWatchedWhenEveryEpisodeIs() {
    let list = [item("a"), item("b")]
    #expect(seasonWatched(list) { _ in true })
    #expect(!seasonWatched(list) { $0.id == "a" })
    #expect(!seasonWatched([]) { _ in true })
    #expect(!seasonWatched(nil) { _ in true })
  }

  @Test func nextUpLeadsOnlyAShowOfSeveralSeasons() {
    #expect(showsNextUp(title(next: item("a"))))
    #expect(showsNextUp(title(next: item("a", position: 30))))
    #expect(!showsNextUp(title(next: item("a", position: 30, completed: true))))
    #expect(!showsNextUp(title(seasons: 1, next: item("a"))))
    #expect(!showsNextUp(title(kind: TitleKind.movie, next: item("a"))))
    #expect(!showsNextUp(title(next: nil)))
  }

  @Test func creditsAreNamedOnceInOrder() {
    let credits = [
      Credit(kind: CreditKind.director, name: "B", role: nil, photo: nil),
      Credit(kind: CreditKind.actor, name: "A", role: "Neo", photo: nil),
      Credit(kind: CreditKind.director, name: "A", role: nil, photo: nil),
      Credit(kind: CreditKind.director, name: "B", role: nil, photo: nil),
    ]
    #expect(creditNames(credits, CreditKind.director) == ["B", "A"])
    #expect(creditNames(credits, CreditKind.writer).isEmpty)
  }

  @Test func theTrailerInTheInterfacesLanguageComesFirst() {
    let trailers = [
      Trailer(url: "https://youtu.be/en", name: nil, language: "en"),
      Trailer(url: "https://youtu.be/de", name: nil, language: "de-DE"),
      Trailer(url: "https://youtu.be/none", name: nil, language: nil),
    ]
    #expect(preferredTrailer(trailers, language: "de")?.url == "https://youtu.be/de")
    #expect(preferredTrailer(trailers, language: "en-GB")?.url == "https://youtu.be/en")
    #expect(preferredTrailer(trailers, language: "fr")?.url == "https://youtu.be/en")
    #expect(preferredTrailer([], language: "en") == nil)
  }

  @Test func theSheetOffersThisDeviceThenEachSizeThenTheOriginal() {
    let presets = [DownloadVideoPreset(height: 1080, bitrate: 6_000_000), DownloadVideoPreset(height: 720, bitrate: 2_500_000)]
    #expect(downloadChoices(presets) == [.device(nil), .device(presets[0]), .device(presets[1]), .original])
    #expect(startingChoice(DEFAULT_ORIGINAL, presets: presets) == .original)
    #expect(startingChoice(DEFAULT_DEVICE, presets: presets) == .device(nil))
    #expect(startingChoice("720", presets: presets) == .device(presets[1]))
    #expect(startingChoice("2160", presets: presets) == .device(nil))
  }

  @Test func bitRatesInMegabits() {
    #expect(mbps(6_000_000, locale: Locale(identifier: "en_US")) == "6")
    #expect(mbps(2_500_000, locale: Locale(identifier: "en_US")) == "2.5")
    #expect(mbps(2_500_000, locale: Locale(identifier: "de_DE")) == "2,5")
  }

  @Test func aSeasonQueuesWhatTheServerAnsweredReadyFor() throws {
    let ready = try JSONDecoder().decode(DownloadResolution.self, from: Data(Self.ready.utf8))
    let refused = DownloadResolution.unavailable(.init(id: "b", message: "No"))
    let (queued, failed) = readyDownloads([item("a"), item("b"), item("c")], [ready, refused])
    #expect(queued.map(\.0.id) == ["a"])
    #expect(failed == 2)
    #expect(mergedPresets([ready, refused]) == [DownloadVideoPreset(height: 1080, bitrate: 6_000_000), DownloadVideoPreset(height: 720, bitrate: 2_500_000)])
    #expect(mergedCodecs([ready, refused]) == ["h264", "hevc"])
  }

  static let ready = """
    {"status":"ready","id":"a","originalPlays":true,
     "choices":{"keepsVideo":true,"presets":[{"height":720,"bitrate":2500000},{"height":1080,"bitrate":6000000}],
       "codecs":["h264","hevc"],"hdrCodecs":[],"audio":[],"subtitles":[],"burnIn":[]},
     "spec":{"container":"mp4","video":{"mode":"copy"},"audio":[{"index":1,"mode":"copy"}],"subtitles":[],"burnIn":null},
     "plan":{"container":"mp4","durationSeconds":60,"estimatedBytes":1000,"segmentSeconds":6,
       "video":{"mode":"copy","codec":"h264","width":640,"height":360,"bitrate":425903,"hdr":null,"toneMapped":false,"hardware":false},
       "audio":[],"subtitles":[],"burnIn":null}}
    """
}
