import Foundation

private func sameLanguage(_ a: String?, _ b: String?) -> Bool {
  guard let a, let b else { return false }
  return a.lowercased().split(separator: "-").first == b.lowercased().split(separator: "-").first
}
public func downloadAudio(_ tracks: [AudioTrack], language: String?, originalLanguage: String?, decodes: (String) -> Bool) -> AudioTrack? {
  let primary = tracks.first(where: \.primary) ?? tracks.first
  let target = language == ORIGINAL_LANGUAGE ? originalLanguage : language
  let matches = tracks.filter { sameLanguage($0.language, target) && !$0.label.localizedCaseInsensitiveContains("commentary") }
  let wanted = matches.first { $0 == primary } ?? matches.max { ($0.channels ?? 0) < ($1.channels ?? 0) } ?? primary
  guard let wanted, !decodes(wanted.codec), let language = wanted.language else { return wanted }
  return tracks.filter { $0 != wanted && $0.language == language && decodes($0.codec) && !$0.label.localizedCaseInsensitiveContains("commentary") }.max { ($0.channels ?? 0) < ($1.channels ?? 0) } ?? wanted
}
public func downloadSubtitle(_ tracks: [SubtitleTrack], audioLanguage: String?, preferences: PlaybackPreferences, deviceLanguage: String = profileLanguage(.current)) -> SubtitleTrack? {
  let shown = tracks.filter { $0.delivery == SubtitleDelivery.webvtt }
  let language = preferences.subtitleLanguage ?? deviceLanguage
  func best(_ language: String?, forced: Bool = false) -> SubtitleTrack? {
    func score(_ track: SubtitleTrack) -> Int { (track.language == language ? 4 : 0) + (track.default ? 2 : 0) + (track.sdh ? 0 : 1) }
    return shown.filter { $0.forced == forced && sameLanguage($0.language, language) }.max { score($0) < score($1) }
  }
  let forced = best(audioLanguage, forced: true) ?? best(language, forced: true)
  switch preferences.subtitleMode {
  case SubtitleMode.off: return nil
  case SubtitleMode.forced: return forced
  case SubtitleMode.always: return best(language) ?? forced
  case SubtitleMode.foreign: return audioLanguage != nil && !sameLanguage(audioLanguage, language) ? best(language) ?? forced : forced
  default:
    let flagged = shown.filter(\.default)
    return forced ?? (shown.count > 1 && flagged.count == shown.count ? nil : flagged.first)
  }
}
