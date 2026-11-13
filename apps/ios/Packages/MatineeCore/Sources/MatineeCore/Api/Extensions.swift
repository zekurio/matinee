import Foundation

extension TitleSummary { public var isShow: Bool { kind == TitleKind.show } }
extension Title {
  public var isShow: Bool { kind == TitleKind.show }
  public var summary: TitleSummary {
    TitleSummary(
      id: id, libraryId: libraryId, kind: kind, name: name, year: year, overview: overview,
      images: images, genres: genres, rating: rating, contentRating: contentRating,
      originalLanguage: originalLanguage, favorite: favorite, watched: watched)
  }
}
private func userName(_ displayName: String?, _ username: String) -> String {
  guard let displayName, !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    return username
  }
  return displayName
}
extension User {
  public var name: String { userName(displayName, username) }
  public var isAdmin: Bool { role == UserRole.admin }
}
extension ProfileUser { public var name: String { userName(displayName, username) } }
extension AdminUser {
  public var name: String { userName(displayName, username) }
  public var isAdmin: Bool { role == UserRole.admin }
}
public struct ImageTarget: Sendable, Hashable {
  public var titleId: String
  public var season: Int?
  public var episode: Int?
  public init(titleId: String, season: Int? = nil, episode: Int? = nil) {
    self.titleId = titleId
    self.season = season
    self.episode = episode
  }
  public var slots: [String] {
    season == nil
      ? [ImageSlot.poster, ImageSlot.backdrop, ImageSlot.logo]
      : episode == nil ? [ImageSlot.poster] : [ImageSlot.still]
  }
}
public let MAX_IMAGE_BYTES: Int64 = 25 * 1024 * 1024
public let IMAGE_TYPES: Set<String> = ["image/jpeg", "image/png", "image/webp"]
public let ORIGINAL_LANGUAGE = "original"
public let DEFAULT_SKIP_SECONDS = 10
public let DEFAULT_PLAYBACK_PREFERENCES = PlaybackPreferences(
  audioLanguage: nil, subtitleMode: SubtitleMode.default, subtitleLanguage: nil,
  rememberSubtitles: true, skipBackSeconds: DEFAULT_SKIP_SECONDS,
  skipForwardSeconds: DEFAULT_SKIP_SECONDS)
extension PlaybackPreferences {
  public var skipBack: Int { skipBackSeconds ?? DEFAULT_SKIP_SECONDS }
  public var skipForward: Int { skipForwardSeconds ?? DEFAULT_SKIP_SECONDS }
}
public let FALLBACK_PLAYBACK_OPTIONS = PlaybackOptions(
  qualities: [], maxBitrate: nil, downloads: false, downloadVideoPresets: [], skipSteps: [],
  videoCodecs: [TranscodeVideoCodec.h264], audioCodecs: [TranscodeAudioCodec.aac],
  audioLanguages: [], subtitleLanguages: [])
public typealias OfflinePlay = PlaybackOfflineInput.Play
public let PLAYBACK_UNPLAYABLE = "UNPLAYABLE"
public let PLAYBACK_RESTRICTED = "PLAYBACK_RESTRICTED"
public let PLAYBACK_BUSY = "TOO_MANY_STREAMS"
