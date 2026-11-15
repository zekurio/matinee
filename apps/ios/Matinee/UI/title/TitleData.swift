import MatineeCore
import SwiftUI

/*
 * TitleData.kt's half that needs the app's words: the facts lines and what
 * a file holds. What the pages decide, like what Play starts in a season,
 * is MatineeCore's (Title/TitleData.swift), where it's tested.
 */

/// A title's facts: its year, then its episode count or runtime, then a show's status.
func titleFacts(_ title: Title) -> [String] {
  [
    formatYear(title.year),
    title.isShow ? Str.mediaEpisodeCount(title.itemCount) : formatRuntime(title.runtimeMinutes),
    title.isShow ? title.status : nil,
  ].compactMap(\.self)
}

/// An episode's facts: its air date, then its runtime. With `left`, the
/// time left in it instead while it's in progress; an episode's page leaves
/// that out, since its Resume button says it.
func episodeFacts(_ item: MediaItem, watched: Bool, left: Bool = false) -> [String] {
  let resuming = left && isResumable(item) && !watched
  return [formatDay(item.episode?.airDate), resuming ? timeLeft(item) : formatRuntime(runtimeMinutes(item))]
    .compactMap(\.self)
}

/// What a file holds, a line each: the picture, the audio, the subtitles.
struct FileInfo: Equatable {
  var video: String?
  var audio: String?
  var subtitles: String?
}

/// The tracks a file holds, as the server lists them for the player.
struct FileTracks: Sendable {
  var audio: [String?]
  var subtitles: [String?]

  static func load(_ api: MatineeApi, _ itemId: String) async throws -> FileTracks {
    async let audio = api.media.audio(id: itemId)
    async let subtitles = api.media.subtitles(id: itemId)
    let tracks = try await audio
    return FileTracks(
      audio: tracks.filter(\.primary).map(\.language) + tracks.filter { !$0.primary }.map(\.language),
      subtitles: try await subtitles.tracks.map(\.language))
  }
}

/// What `item` holds: the picture, the audio's languages with the main
/// track's layout, and the subtitles' languages. The languages come from the
/// server's track lists, `tracks`, which include subtitle files beside the
/// video; until they load, or if they fail, from what the probe found in the
/// file. Nil without a probe, or when it says nothing.
func fileInfo(_ item: MediaItem, tracks: FileTracks?) -> FileInfo? {
  guard let probe = item.probe else { return nil }
  let probeAudio = probe.audio.filter(\.default) + probe.audio.filter { !$0.default }
  let audio = tracks?.audio ?? probeAudio.map(\.language)
  let subtitles = tracks?.subtitles ?? probe.subtitles.map(\.language)
  let main = probe.audio.first(where: \.default) ?? probe.audio.first
  // Each language once; a file whose tracks don't say gets their count instead.
  let audioLine = [
    languageList(audio) ?? (audio.isEmpty ? nil : Str.mediaAudioTracks(audio.count)), main?.layout,
  ].compactMap(\.self).joined(separator: " · ")
  let subtitleLine = languageList(subtitles) ?? (subtitles.isEmpty ? nil : Str.mediaSubtitles(subtitles.count))
  let info = FileInfo(video: videoSummary(item), audio: audioLine.isEmpty ? nil : audioLine, subtitles: subtitleLine)
  return info.video == nil && info.audio == nil && info.subtitles == nil ? nil : info
}

/// A season's files, or with `season` nil, the files without a season number.
func seasonItems(_ api: MatineeApi, _ titleId: String, _ season: Int?) async throws -> [MediaItem] {
  guard let season else { return try await api.looseItems(titleId) }
  return try await api.titleItems(titleId, season: season)
}

#if DEBUG
  /// What a provider would have said about a title, for the dev server,
  /// which has none: `-title.fixture YES` fills in what's missing, so the
  /// pages' overview, credits, genres, rating, and trailer can be looked at.
  /// Debug builds only.
  enum TitleFixture {
    static var on: Bool { UserDefaults.standard.bool(forKey: "title.fixture") }

    static func dress(_ title: Title) -> Title {
      guard on else { return title }
      var title = title
      title.overview =
        title.overview
        ?? "A test pattern stands in for the film: a timecode, a tone, and the file's name. "
        + "It plays, seeks, and resumes like the real thing, and says so in more words than fit "
        + "in three lines, so the overview's More has something to open."
      title.tagline = title.tagline ?? "Every frame accounted for."
      if title.genres.isEmpty { title.genres = ["Science Fiction", "Action", "Drama"] }
      if title.studios.isEmpty { title.studios = ["Matinee Pictures", "Test Card Films"] }
      title.rating = title.rating ?? 7.8
      title.contentRating = title.contentRating ?? "PG-13"
      title.originalName = title.originalName ?? "\(title.name) (Original)"
      title.runtimeMinutes = title.runtimeMinutes ?? (title.isShow ? nil : 136)
      if title.isShow { title.status = title.status ?? "Ended" }
      if title.credits.isEmpty {
        title.credits = [
          Credit(kind: title.isShow ? CreditKind.creator : CreditKind.director, name: "Ada Lovelace", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.writer, name: "Grace Hopper", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.writer, name: "Alan Turing", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.writer, name: "Ada Lovelace", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Keanu Reeves", role: "Neo", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Carrie-Anne Moss", role: "Trinity", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Laurence Fishburne", role: "Morpheus", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Hugo Weaving", role: "Agent Smith", photo: nil, tmdbId: nil),
        ]
      }
      if title.trailers.isEmpty {
        title.trailers = [
          Trailer(url: "https://www.youtube.com/watch?v=vKQi3bBA1y8", name: "Trailer", language: "en"),
          Trailer(url: "https://www.youtube.com/watch?v=vKQi3bBA1y8", name: "Trailer", language: "de"),
        ]
      }
      title.seasons = title.seasons.map { season in
        var season = season
        season.overview = season.overview ?? "The season's overview, from the fixture."
        return season
      }
      if let next = title.next { title.next = dress(next) }
      return title
    }

    static func dress(_ item: MediaItem) -> MediaItem {
      guard on, item.title?.kind == TitleKind.show else { return item }
      var item = item
      let episode = item.episode
      item.episode = EpisodeInfo(
        name: episode?.name, overview: episode?.overview ?? "What happens in this episode, from the fixture.",
        airDate: episode?.airDate ?? "2008-01-20", runtimeMinutes: episode?.runtimeMinutes, still: episode?.still)
      return item
    }
  }
#endif

/// The title as the page shows it: as the server sent it, and in debug
/// builds with the fixture's words where it sent none.
func shown(_ title: Title) -> Title {
  #if DEBUG
    TitleFixture.dress(title)
  #else
    title
  #endif
}

func shown(_ item: MediaItem) -> MediaItem {
  #if DEBUG
    TitleFixture.dress(item)
  #else
    item
  #endif
}
