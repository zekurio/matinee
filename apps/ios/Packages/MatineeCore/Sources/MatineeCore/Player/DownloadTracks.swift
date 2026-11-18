import Foundation

// Which audio and subtitles a download starts with, and who draws them.
// A file from the server gets all of that from playback.start. A download
// can't ask the server, so it picks here.

/// pt-BR and pt are the same language here.
private func sameLanguage(_ a: String?, _ b: String?) -> Bool {
  guard let a, let b else { return false }
  return a.lowercased().split(separator: "-").first == b.lowercased().split(separator: "-").first
}
/// The track for language, or the title's own for `original`, else the file's
/// primary one. Substitute a decodable track in the same language if needed.
public func downloadAudio(
  _ tracks: [AudioTrack], language: String?, originalLanguage: String?, decodes: (String) -> Bool
) -> AudioTrack? {
  let primary = tracks.first(where: \.primary) ?? tracks.first
  let target = language == ORIGINAL_LANGUAGE ? originalLanguage : language
  let matches = tracks.filter {
    sameLanguage($0.language, target) && !$0.label.localizedCaseInsensitiveContains("commentary")
  }
  let wanted =
    matches.first { $0 == primary } ?? matches.max { ($0.channels ?? 0) < ($1.channels ?? 0) }
    ?? primary
  guard let wanted, !decodes(wanted.codec), let language = wanted.language else { return wanted }
  return tracks.filter {
    $0 != wanted && $0.language == language && decodes($0.codec)
      && !$0.label.localizedCaseInsensitiveContains("commentary")
  }.max { ($0.channels ?? 0) < ($1.channels ?? 0) } ?? wanted
}
/// The subtitle a download starts with, or nil for off, by the subtitle mode.
public func downloadSubtitle(
  _ tracks: [SubtitleTrack], audioLanguage: String?, preferences: PlaybackPreferences,
  deviceLanguage: String = profileLanguage(.current)
) -> SubtitleTrack? {
  // Text the screen draws, from the WebVTT saved beside the download.
  let shown = tracks.filter { $0.delivery == SubtitleDelivery.webvtt }
  let language = preferences.subtitleLanguage ?? deviceLanguage
  // The exact tag first, then the file's default, then one without SDH.
  func best(_ language: String?, forced: Bool = false) -> SubtitleTrack? {
    func score(_ track: SubtitleTrack) -> Int {
      (track.language == language ? 4 : 0) + (track.default ? 2 : 0) + (track.sdh ? 0 : 1)
    }
    return shown.filter { $0.forced == forced && sameLanguage($0.language, language) }.max {
      score($0) < score($1)
    }
  }
  let forced = best(audioLanguage, forced: true) ?? best(language, forced: true)
  switch preferences.subtitleMode {
  case SubtitleMode.off: return nil
  case SubtitleMode.forced: return forced
  case SubtitleMode.always: return best(language) ?? forced
  case SubtitleMode.foreign:
    return audioLanguage != nil && !sameLanguage(audioLanguage, language)
      ? best(language) ?? forced : forced
  default:
    // Some muxers mark every track default, which says nothing.
    let flagged = shown.filter(\.default)
    return forced ?? (shown.count > 1 && flagged.count == shown.count ? nil : flagged.first)
  }
}

/// Who draws `track` of a download: the engine draws a picture track, like
/// PGS, from a download that's the file as it is, and mpv an ASS or SSA
/// track there with its styling and fonts. The view draws text from the
/// WebVTT saved beside it, or from `url` when it wasn't saved.
public func downloadSubtitleShow(_ track: SubtitleTrack?, mpv: Bool = false, url: String)
  -> SubtitleShow
{
  guard let track else { return .off }
  let picture = track.delivery == SubtitleDelivery.pgs || track.delivery == SubtitleDelivery.burn_in
  let styled = track.format == "ASS" || track.format == "SSA"
  if let stream = streamIndex(track), track.source == SubtitleSource.embedded,
    picture || (mpv && styled)
  {
    return .inFile(track, stream)
  }
  return track.delivery == SubtitleDelivery.webvtt ? .screen(track, url) : .off
}
