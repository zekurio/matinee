import Foundation

/*
 * What a file holds, for the title and episode pages' media info, from
 * TitleData.kt's `rememberFileInfo` and the web's media-info.tsx. The
 * server words the picture and the audio layout (`resolution`, `format`,
 * `dynamicRange`, and `layout` on the probe) and lists the tracks; this
 * only picks which list to read and in what order. The app words the
 * languages and the counts.
 */

/// The tracks a file holds, as the server lists them for the player: the
/// audio's languages, the main track first, and the subtitles', which
/// include subtitle files beside the video that the probe never saw.
public struct FileTracks: Sendable, Hashable {
  public var audio: [String?]
  public var subtitles: [String?]

  public init(audio: [String?], subtitles: [String?]) {
    self.audio = audio
    self.subtitles = subtitles
  }

  /// The server's lists for `itemId`, both asked at once.
  public static func load(_ api: MatineeApi, _ itemId: String) async throws -> FileTracks {
    async let audio = api.media.audio(id: itemId)
    async let subtitles = api.media.subtitles(id: itemId)
    return FileTracks(audio: try await audio, subtitles: try await subtitles.tracks)
  }

  /// From the server's answers: the main audio first, the rest in its order.
  public init(audio: [AudioTrack], subtitles: [SubtitleTrack]) {
    self.init(
      audio: audio.filter(\.primary).map(\.language) + audio.filter { !$0.primary }.map(\.language),
      subtitles: subtitles.map(\.language))
  }
}

/// What a file holds, before the app words it: the picture as the server
/// wrote it, the audio's languages and the main track's layout, and the
/// subtitles' languages. Language tags may be nil for a track that
/// doesn't say; the app counts those when no track says.
public struct FileInfoParts: Sendable, Hashable {
  /// "1080p · HEVC · HDR10".
  public var video: String?
  public var audioLanguages: [String?]
  /// The main audio track's layout as the server wrote it, "5.1".
  public var layout: String?
  public var subtitleLanguages: [String?]
}

/// What `item` holds. The languages come from `tracks`, the server's lists,
/// once they loaded; until then, or when they failed, from what the probe
/// found in the file, the default audio first. Nil without a probe, or
/// when it says nothing at all.
public func fileInfoParts(_ item: MediaItem, tracks: FileTracks?) -> FileInfoParts? {
  guard let probe = item.probe else { return nil }
  let probeAudio = probe.audio.filter(\.default) + probe.audio.filter { !$0.default }
  let main = probe.audio.first(where: \.default) ?? probe.audio.first
  let parts = FileInfoParts(
    video: videoSummary(item).flatMap { $0.isEmpty ? nil : $0 },
    audioLanguages: tracks?.audio ?? probeAudio.map(\.language),
    layout: main?.layout,
    subtitleLanguages: tracks?.subtitles ?? probe.subtitles.map(\.language))
  let empty =
    parts.video == nil && parts.audioLanguages.isEmpty && parts.layout == nil && parts.subtitleLanguages.isEmpty
  return empty ? nil : parts
}
