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

/// What TMDB says someone is known for, in the app's language.
func departmentName(_ id: String) -> String? {
  switch id {
  case PersonDepartment.acting: Str.personDepartmentActing
  case PersonDepartment.directing: Str.personDepartmentDirecting
  case PersonDepartment.writing: Str.personDepartmentWriting
  case PersonDepartment.creator: Str.personDepartmentCreator
  case PersonDepartment.production: Str.personDepartmentProduction
  case PersonDepartment.editing: Str.personDepartmentEditing
  case PersonDepartment.camera: Str.personDepartmentCamera
  case PersonDepartment.sound: Str.personDepartmentSound
  case PersonDepartment.art: Str.personDepartmentArt
  case PersonDepartment.costume: Str.personDepartmentCostume
  case PersonDepartment.visualEffects: Str.personDepartmentVisualEffects
  case PersonDepartment.lighting: Str.personDepartmentLighting
  case PersonDepartment.crew: Str.personDepartmentCrew
  default: nil
  }
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
