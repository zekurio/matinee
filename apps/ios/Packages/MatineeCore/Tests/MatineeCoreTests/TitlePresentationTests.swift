import Foundation
import Testing

@testable import MatineeCore

/// TitlePresentation.swift and FileInfo.swift: what the title, season, and
/// episode pages decide from the server's answers.
struct TitlePresentationTests {
  /// A file as the server sends one, with a probe of `audio` streams
  /// (language, default, layout) and `subtitles` languages.
  private func item(
    _ id: String = "item-1", duration: Double = 1320, airDate: String? = nil, folders: [String?] = ["Film (1999)"],
    audio: [(String?, Bool, String?)]? = nil, subtitles: [String?] = [], video: Bool = true
  ) -> MediaItem {
    var item = Answers.item(id, duration: duration)
    if let airDate {
      item.episode = EpisodeInfo(name: nil, overview: nil, airDate: airDate, runtimeMinutes: nil, still: nil)
    }
    item.label.groupLabel = folders.map { ItemLabelFolder(name: $0, seasonNumber: $0 == nil ? 1 : nil) }
    if let audio {
      let streams = audio.enumerated().map { index, stream in
        """
        {"index":\(index + 1),"codec":"aac","default":\(stream.1),"format":"AAC",
         "language":\(stream.0.map { "\"\($0)\"" } ?? "null"),"layout":\(stream.2.map { "\"\($0)\"" } ?? "null")}
        """
      }
      let subs = subtitles.enumerated().map { index, language in
        """
        {"index":\(index + 10),"codec":"subrip","kind":"text","default":false,"forced":false,"hearingImpaired":false,
         "language":\(language.map { "\"\($0)\"" } ?? "null")}
        """
      }
      let picture =
        video
        ? """
        {"index":0,"codec":"hevc","width":1920,"height":1080,"interlaced":false,"hdr10Plus":false,
         "masteringDisplay":false,"format":"HEVC","resolution":"1080p","dynamicRange":"HDR10"}
        """ : "null"
      let json = """
        {"format":{"name":"matroska","startSeconds":0},"video":\(picture),
         "audio":[\(streams.joined(separator: ","))],"subtitles":[\(subs.joined(separator: ","))]}
        """
      item.probe = try! JSONDecoder().decode(DisplayMediaProbe.self, from: Data(json.utf8))
    }
    return item
  }

  private func title(
    kind: String = TitleKind.movie, runtime: Int? = nil, itemCount: Int = 1, seasons: [Int?] = [],
    specials: Season? = nil, next: MediaItem? = nil
  ) -> Title {
    Title(
      id: "t", libraryId: "l", kind: kind, name: "Film", year: 1999, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil,
      contentRating: nil, runtimeMinutes: runtime, originalLanguage: nil, favorite: false, watched: false,
      originalName: nil, tagline: nil, releaseDate: nil, status: nil,
      path: "Film (1999)", provider: nil, providerId: nil, externalIds: [:], refreshedAt: nil,
      studios: [], credits: [], trailers: [], itemCount: itemCount,
      seasons: seasons.map { season($0) }, specials: specials, next: next)
  }

  private func season(_ number: Int?, count: Int = 3, watched: Int = 0) -> Season {
    Season(
      number: number, name: "S", overview: nil, poster: nil, itemCount: count, watchedCount: watched, favorite: false)
  }

  private func watching(_ item: MediaItem, at position: Double, completed: Bool = false) -> MediaItem {
    var item = item
    item.progress = WatchState(positionSeconds: position, completed: completed, updatedAt: "2024-01-01T00:00:00Z")
    return item
  }

  // MARK: File info

  @Test func fileInfoReadsTheProbeUntilTheServersListsLoad() throws {
    let file = item(audio: [("deu", false, "Stereo"), ("eng", true, "5.1")], subtitles: ["eng", nil])
    let parts = try #require(fileInfoParts(file, tracks: nil))
    #expect(parts.video == "1080p · HEVC · HDR10")
    // The default track first, and its layout.
    #expect(parts.audioLanguages == ["eng", "deu"])
    #expect(parts.layout == "5.1")
    #expect(parts.subtitleLanguages == ["eng", nil])
  }

  @Test func fileInfoPrefersTheServersTrackLists() throws {
    let file = item(audio: [("eng", true, "5.1")], subtitles: ["eng"])
    // A subtitle file beside the video, which the probe never saw.
    let tracks = FileTracks(audio: ["eng"], subtitles: ["eng", "fra"])
    let parts = try #require(fileInfoParts(file, tracks: tracks))
    #expect(parts.subtitleLanguages == ["eng", "fra"])
    // The layout is the probe's, as the server worded it.
    #expect(parts.layout == "5.1")
  }

  @Test func fileTracksPutTheMainAudioFirst() {
    let tracks = FileTracks(
      audio: [Answers.ac3, Answers.aac].map { var track = $0; track.primary = $0.language == "de"; return track },
      subtitles: [Answers.vtt, Answers.pgsBeside])
    #expect(tracks.audio == ["de", "en"])
    #expect(tracks.subtitles == ["en", "de"])
  }

  @Test func fileInfoIsNothingWithoutAProbeOrWithAnEmptyOne() {
    #expect(fileInfoParts(item(), tracks: nil) == nil)
    #expect(fileInfoParts(item(audio: [], video: false), tracks: nil) == nil)
    #expect(fileInfoParts(item(audio: [], video: false), tracks: FileTracks(audio: [], subtitles: ["en"])) != nil)
  }

  // MARK: The heading

  @Test func aMoviesRuntimeFallsBackToItsFile() {
    #expect(titleRuntime(title(runtime: 136)) == 136)
    #expect(titleRuntime(title(runtime: nil, next: item(duration: 1320))) == 22)
    #expect(titleRuntime(title(runtime: 0, next: nil)) == nil)
    #expect(titleRuntime(title(kind: TitleKind.show, runtime: 45, next: item())) == nil)
  }

  @Test func aShowCountsItsSeasonsOnlyWhenItHasSeveral() {
    #expect(showSize(title(kind: TitleKind.show, itemCount: 6, seasons: [1, 2])) == .seasons(2))
    // Specials and the files without a season don't make it several.
    #expect(showSize(title(kind: TitleKind.show, itemCount: 6, seasons: [0, 1, nil])) == .episodes(6))
    #expect(showSize(title(itemCount: 2)) == nil)
  }

  @Test func onlyAMoviesFileGivesTheHeadingBadges() {
    let file = item(audio: [("eng", true, "5.1")])
    #expect(titleFlags(title(next: file)) == ["1080p", "HDR10", "5.1"])
    #expect(titleFlags(title(kind: TitleKind.show, next: file)).isEmpty)
    #expect(titleFlags(title(next: nil)).isEmpty)
  }

  @Test func aSeasonsYearIsItsFirstEpisodes() {
    #expect(seasonYear([item(airDate: "2008-01-20"), item(airDate: "2009-03-08")]) == 2008)
    #expect(seasonYear([item()]) == nil)
    #expect(seasonYear(nil) == nil)
  }

  @Test func aSeasonSaysHowMuchIsWatched() {
    #expect(seasonProgress(season(1, count: 3, watched: 0)) == .none)
    #expect(seasonProgress(season(1, count: 3, watched: 2)) == .some(2))
    #expect(seasonProgress(season(1, count: 3, watched: 3)) == .all)
  }

  // MARK: Play and the rows

  @Test func aSeasonPlaysTheShowsNextFileWhenItsInTheSeason() {
    let a = item("a"), b = item("b"), c = watching(item("c"), at: 30)
    let show = title(kind: TitleKind.show, seasons: [1], next: b)
    #expect(seasonPlay(show, [a, b, c]) { _ in false }?.id == "b")
    // Not in this season: the season's own, the one in progress first.
    #expect(seasonPlay(title(kind: TitleKind.show, next: item("z")), [a, b, c]) { _ in false }?.id == "c")
    // Marked watched here since the server answered: on to the next.
    #expect(seasonPlay(show, [a, b]) { $0.id == "b" }?.id == "a")
    #expect(seasonPlay(show, nil) { _ in false } == nil)
  }

  @Test func theRestOfASeasonStartsOnTheEpisodeBefore() {
    let list = ["a", "b", "c", "d"].map { item($0) }
    #expect(moreFromSeasonStart(list, current: "c") == 1)
    #expect(moreFromSeasonStart(list, current: "a") == 0)
    #expect(moreFromSeasonStart(list, current: "x") == 0)
    #expect(episodeRailStart(list, next: list[2]) == 2)
  }

  @Test func aTVsRestOfASeasonStartsOnTheEpisodeAfter() {
    let list = ["a", "b", "c", "d"].map { item($0) }
    #expect(episodeAfter(list, current: "b")?.id == "c")
    // The last has none after it: the one before.
    #expect(episodeAfter(list, current: "d")?.id == "c")
    #expect(episodeAfter(list, current: "x") == nil)
    #expect(episodeAfter([item("a")], current: "a") == nil)
  }

  @Test func aMovieListsItsFilesWhenItHasSeveral() {
    #expect(showsFiles(title(itemCount: 2)))
    #expect(!showsFiles(title(itemCount: 1)))
    #expect(!showsFiles(title(kind: TitleKind.show, itemCount: 6)))
  }

  @Test func aFileIsToldApartByTheServersFolders() {
    #expect(fileFolders(item(folders: ["The Matrix (1999)", "Extras"])) == "The Matrix (1999) / Extras")
    // A season folder is the app's to word.
    #expect(fileFolders(item(folders: ["Show (2008)", nil])) == "Show (2008)")
    #expect(fileFolders(item(folders: [])) == nil)
  }

  // MARK: Specials

  @Test func hiddenSpecialsAreTheOnesLeftOutOfTheSeasons() {
    let specials = season(0)
    let hidden = title(kind: TitleKind.show, seasons: [1, 2], specials: specials)
    #expect(isHiddenSpecials(hidden, specials))
    #expect(titleSeason(hidden, number: 0) == specials)
    #expect(!isHiddenSpecials(hidden, season(1)))
    let shown = title(kind: TitleKind.show, seasons: [0, 1, 2])
    #expect(!isHiddenSpecials(shown, season(0)))
  }

  @MainActor @Test func showingSpecialsSavesTheAccountsPreference() async throws {
    var saved: User?
    try await setShowSpecials(PreferencesStub.api(), true) { saved = $0 }
    #expect(saved?.library.showSpecials == true)
    #expect(PreferencesStub.lastBody?.contains("\"showSpecials\":true") == true)
    await #expect(throws: (any Error).self) {
      try await setShowSpecials(PreferencesStub.api(host: "denied"), false) { saved = $0 }
    }
    #expect(saved?.library.showSpecials == true)
  }

  // MARK: Related

  @Test func relatedRowsNeedTheTitleMatched() {
    var matched = title()
    matched.provider = "tmdb"
    matched.providerId = "603"
    #expect(titleCatalogRef(matched) == CatalogRef(kind: TitleKind.movie, provider: "tmdb", providerId: "603"))
    #expect(titleCatalogRef(title()) == nil)
    matched.providerId = ""
    #expect(titleCatalogRef(matched) == nil)
  }

  @Test func onlyAFilmSeriesNamesItsRow() {
    #expect(relatedRailName(RelatedRail(id: RelatedRailId.collection, name: "The Matrix Collection")) == "The Matrix Collection")
    #expect(relatedRailName(RelatedRail(id: RelatedRailId.moreLikeThis, name: "Ignored")) == nil)
    #expect(relatedRailName(RelatedRail(id: RelatedRailId.collection, name: nil)) == nil)
  }

  @Test func aRelatedTitleHereIsTheLibrarysCard() throws {
    let library = title().summary
    func related(_ state: String, libraryTitleId: String?, title: TitleSummary?) throws -> RelatedTitle {
      let json = """
        {"ref":{"kind":"movie","provider":"tmdb","providerId":"604"},"name":"Film","year":2003,"poster":null,
         "availability":{"state":"\(state)","stillLooking":false,"askedBySelf":false,"following":false,
           "others":{"count":0,"names":[]},"libraryTitleId":\(libraryTitleId.map { "\"\($0)\"" } ?? "null")},
         "title":null}
        """
      var item = try JSONDecoder().decode(RelatedTitle.self, from: Data(json.utf8))
      item.title = title
      return item
    }
    #expect(try relatedLibraryTitle(related("here", libraryTitleId: "t", title: library)) == library)
    #expect(try relatedLibraryTitle(related("here", libraryTitleId: nil, title: library)) == library)
    #expect(try relatedLibraryTitle(related("here", libraryTitleId: "other", title: library)) == nil)
    #expect(try relatedLibraryTitle(related("none", libraryTitleId: nil, title: library)) == nil)
    #expect(try relatedLibraryTitle(related("here", libraryTitleId: "t", title: nil)) == nil)
  }
}

/// The account's library preferences endpoint: 200 with the account for
/// any host but `denied`.
private final class PreferencesStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var lastBody: String?

  static func api(host: String = "allowed") -> MatineeApi {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PreferencesStub.self]
    return MatineeApi(transport: ApiTransport(base: URL(string: "https://\(host)")!, configuration: configuration))
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let ok =
      request.url?.host != "denied" && request.url?.path == "/api/v1/account/library" && request.httpMethod == "PATCH"
    if let stream = request.httpBodyStream {
      stream.open()
      var data = Data()
      var buffer = [UInt8](repeating: 0, count: 1024)
      while stream.hasBytesAvailable {
        let read = stream.read(&buffer, maxLength: buffer.count)
        if read <= 0 { break }
        data.append(buffer, count: read)
      }
      stream.close()
      Self.lastBody = String(decoding: data, as: UTF8.self)
    } else if let body = request.httpBody {
      Self.lastBody = String(decoding: body, as: UTF8.self)
    }
    let user = """
      {"id":"u","username":"viewer","displayName":null,"role":"user","avatarId":null,"avatarSource":"none",
       "playback":null,"library":{"showSpecials":true},"sharing":{"favorites":false,"stats":false}}
      """
    let status = ok ? 200 : 403
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data((ok ? user : "{\"message\":\"Denied\"}").utf8))
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}
}
