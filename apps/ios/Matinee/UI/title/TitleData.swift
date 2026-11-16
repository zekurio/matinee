import Foundation
import MatineeCore

/*
 * TitleData.kt's half that needs the app's words: the facts lines, what a
 * file holds, a download's state, and a missing season's. What the pages
 * decide, like what Play starts in a season or which files a movie lists,
 * is MatineeCore's (Title/), where it's tested.
 */

/// A title's facts: its year, then a movie's runtime or a show's seasons or
/// episodes, then a show's status, as the web's title header.
func titleFacts(_ title: Title) -> [String] {
  let size: String? =
    switch showSize(title) {
    case .seasons(let count): Str.requestsSeasonCount(count)
    case .episodes(let count): Str.mediaEpisodeCount(count)
    case nil: nil
    }
  return [formatYear(title.year), formatRuntime(titleRuntime(title)), size, title.isShow ? title.status : nil]
    .compactMap(\.self)
}

/// A season's facts: the year it started, its episodes, and how many are watched.
func seasonFacts(_ season: Season, items: [MediaItem]?) -> [String] {
  let watched: String? =
    switch seasonProgress(season) {
    case .none: nil
    case .some(let count): Str.titleSeasonWatchedCount(count)
    case .all: Str.mediaWatched
    }
  return [formatYear(seasonYear(items)), Str.mediaEpisodeCount(season.itemCount), watched].compactMap(\.self)
}

/// An episode's facts: its air date, then its runtime, or the time left in
/// it while it's in progress and not marked watched.
func episodeFacts(_ item: MediaItem, watched: Bool) -> [String] {
  let resuming = isResumable(item) && !watched
  return [formatDay(item.episode?.airDate), resuming ? timeLeft(item) : formatRuntime(runtimeMinutes(item))]
    .compactMap(\.self)
}

/// What someone is credited as, "Director", or "Directors" for more.
func titleCreditLabel(_ kind: String, count: Int) -> String {
  switch kind {
  case CreditKind.creator: Str.peopleCreditCreator(count)
  case CreditKind.director: Str.peopleCreditDirector(count)
  case CreditKind.writer: Str.peopleCreditWriter(count)
  default: Str.peopleCreditActor(count)
  }
}

/// What a file holds, a part each: the picture, the audio, the subtitles.
struct FileInfo: Equatable {
  var video: String?
  var audio: String?
  var subtitles: String?
}

/// `fileInfoParts` in words: each language once, named in the app's
/// language, or the tracks' count when none says; the audio with the main
/// track's layout after it.
func fileInfo(_ item: MediaItem, tracks: FileTracks?) -> FileInfo? {
  guard let parts = fileInfoParts(item, tracks: tracks) else { return nil }
  let audio = [
    languageList(parts.audioLanguages)
      ?? (parts.audioLanguages.isEmpty ? nil : Str.mediaAudioTracks(parts.audioLanguages.count)),
    parts.layout,
  ].compactMap(\.self).joined(separator: " · ")
  let subtitles =
    languageList(parts.subtitleLanguages)
    ?? (parts.subtitleLanguages.isEmpty ? nil : Str.mediaSubtitles(parts.subtitleLanguages.count))
  let info = FileInfo(video: parts.video, audio: audio.isEmpty ? nil : audio, subtitles: subtitles)
  return info.video == nil && info.audio == nil && info.subtitles == nil ? nil : info
}

/// "42 %", as the app's language writes a share.
func formatPercent(_ share: Double) -> String {
  min(max(share, 0), 1).formatted(.percent.precision(.fractionLength(0)).locale(.app))
}

/// Today as the server writes a day, YYYY-MM-DD, for release dates.
func todayDay() -> String {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: Date())
}

/// A season's files, or with `season` nil, the files without a season number.
func seasonItems(_ api: MatineeApi, _ titleId: String, _ season: Int?) async throws -> [MediaItem] {
  guard let season else { return try await api.looseItems(titleId) }
  return try await api.titleItems(titleId, season: season)
}

#if DEBUG
  /// What a provider would have said about a title, for the dev server,
  /// which has none: `-title.fixture YES` fills in what's missing, so the
  /// pages' overview, credits, genres, ratings, trailer, and logo can be
  /// looked at. Debug builds only.
  enum TitleFixture {
    static var on: Bool { UserDefaults.standard.bool(forKey: "title.fixture") }

    /// A wide logo for the titles from 1999, as Home's stand-in has one.
    static func logo(_ title: TitleSummary) -> URL? {
      guard on, title.year == 1999 else { return nil }
      return URL(string: "https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_light_color_272x92dp.png")
    }

    static func dress(_ title: Title) -> Title {
      guard on else { return title }
      var title = title
      title.overview =
        title.overview
        ?? "A test pattern stands in for the film: a timecode, a tone, and the file's name. "
        + "It plays, seeks, and resumes like the real thing, and says so in more words than fit "
        + "in three lines, so the overview's More has something to open."
      title.tagline = title.tagline ?? "Every frame accounted for."
      if title.genres.isEmpty { title.genres = ["Science Fiction", "Action", "Drama", "Thriller", "Mystery"] }
      if title.studios.isEmpty { title.studios = ["Matinee Pictures", "Test Card Films"] }
      title.rating = title.rating ?? 7.8
      title.contentRating = title.contentRating ?? "PG-13"
      title.originalName = title.originalName ?? (title.isShow ? nil : "\(title.name) (Original)")
      if title.isShow { title.status = title.status ?? "Ended" }
      if title.credits.isEmpty {
        title.credits = [
          Credit(
            kind: title.isShow ? CreditKind.creator : CreditKind.director, name: "Ada Lovelace", role: nil, photo: nil,
            tmdbId: nil),
          Credit(kind: CreditKind.writer, name: "Grace Hopper", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.writer, name: "Alan Turing", role: nil, photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Keanu Reeves", role: "Neo", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Carrie-Anne Moss", role: "Trinity", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Laurence Fishburne", role: "Morpheus", photo: nil, tmdbId: nil),
          Credit(kind: CreditKind.actor, name: "Hugo Weaving", role: "Agent Smith", photo: nil, tmdbId: nil),
        ]
      }
      if title.trailers.isEmpty {
        title.trailers = [Trailer(url: "https://www.youtube.com/watch?v=vKQi3bBA1y8", name: "Trailer", language: "en")]
      }
      title.seasons = title.seasons.map { season in
        var season = season
        season.overview =
          season.overview ?? "The season's overview, from the fixture: what the season is about, in a line or two."
        return season
      }
      if let next = title.next { title.next = dress(next) }
      return title
    }

    static func dress(_ item: MediaItem) -> MediaItem {
      guard on, item.title?.kind == TitleKind.show else { return item }
      var item = item
      let episode = item.episode
      let number = item.episodeNumber ?? 1
      item.episode = EpisodeInfo(
        name: episode?.name,
        overview: episode?.overview
          ?? "What happens in this episode, from the fixture, long enough to wrap onto a second line and a third.",
        airDate: episode?.airDate ?? String(format: "2008-01-%02d", min(28, 6 + number * 7)),
        runtimeMinutes: episode?.runtimeMinutes, still: episode?.still)
      return item
    }
  }
#endif

/// The title as the page shows it: as the server sent it, and in debug
/// builds with the fixture's words where it sent none.
func titleShown(_ title: Title) -> Title {
  #if DEBUG
    TitleFixture.dress(title)
  #else
    title
  #endif
}

func itemShown(_ item: MediaItem) -> MediaItem {
  #if DEBUG
    TitleFixture.dress(item)
  #else
    item
  #endif
}
