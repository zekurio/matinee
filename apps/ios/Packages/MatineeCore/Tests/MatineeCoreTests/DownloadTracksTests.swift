import Foundation
import Testing

@testable import MatineeCore

@Suite struct DownloadTracksTests {
  private func audio(
    _ index: Int, _ language: String? = "en", channels: Int? = 2, primary: Bool = false,
    codec: String = "aac", label: String = "Audio"
  ) -> AudioTrack {
    .init(
      index: index, label: label, language: language, title: nil, codec: codec, format: codec,
      channels: channels, layout: nil, primary: primary)
  }
  private func sub(
    _ id: String, _ language: String? = "en", forced: Bool = false, sdh: Bool = false,
    flagged: Bool = false, delivery: String = SubtitleDelivery.webvtt, format: String = "SRT",
    source: String = SubtitleSource.embedded
  ) -> SubtitleTrack {
    .init(
      id: id, label: id, language: language, title: nil, forced: forced, sdh: sdh, default: flagged,
      source: source,
      index: source == SubtitleSource.embedded ? Int(id.dropFirst("stream-".count)) : nil,
      format: format, delivery: delivery)
  }
  private func pick(
    _ tracks: [SubtitleTrack], mode: String = "auto", language: String? = "en",
    audio: String? = "de"
  ) -> SubtitleTrack? {
    downloadSubtitle(
      tracks, audioLanguage: audio,
      preferences: .init(
        audioLanguage: nil, subtitleMode: mode, subtitleLanguage: language, rememberSubtitles: true),
      deviceLanguage: "en")
  }
  @Test func audioPrimaryAndEmpty() {
    let first = audio(0)
    let primary = audio(1, "de", primary: true)
    #expect(downloadAudio([], language: nil, originalLanguage: nil, decodes: { _ in true }) == nil)
    for language in [nil, "fr"] {
      #expect(
        downloadAudio(
          [first, primary], language: language, originalLanguage: nil, decodes: { _ in true })
          == primary)
      #expect(
        downloadAudio([first], language: language, originalLanguage: nil, decodes: { _ in true })
          == first)
    }
  }
  @Test func preferredAudioAndOriginal() {
    let primary = audio(0, "de", channels: 2, primary: true)
    let surround = audio(1, "de-DE", channels: 6)
    let english = audio(2, "en-US", channels: 8)
    let commentary = audio(3, "en", channels: 10, label: "COMMENTARY")
    #expect(
      downloadAudio(
        [primary, surround], language: "de-AT", originalLanguage: nil, decodes: { _ in true })
        == primary)
    #expect(
      downloadAudio(
        [primary, english, commentary], language: ORIGINAL_LANGUAGE, originalLanguage: "en",
        decodes: { _ in true }) == english)
    #expect(
      downloadAudio(
        [primary, audio(4, "en", channels: nil), english], language: "en", originalLanguage: nil,
        decodes: { _ in true }) == english)
  }
  @Test func decodableStandInUsesExactLanguageAndAvoidsCommentary() {
    let wanted = audio(0, "en", primary: true, codec: "dts")
    let stereo = audio(1)
    let surround = audio(2, channels: 6)
    let region = audio(3, "en-US", channels: 10)
    let commentary = audio(4, channels: 12, label: "Commentary")
    #expect(
      downloadAudio(
        [wanted, stereo, surround, region, commentary], language: nil, originalLanguage: nil,
        decodes: { $0 == "aac" }) == surround)
    #expect(
      downloadAudio(
        [wanted, region, commentary], language: nil, originalLanguage: nil, decodes: { $0 == "aac" }
      ) == wanted)
    let untagged = audio(5, nil, codec: "dts")
    #expect(
      downloadAudio(
        [untagged, stereo], language: nil, originalLanguage: nil, decodes: { _ in false })
        == untagged)
  }
  @Test func subtitleModesAndForcedLanguages() {
    let full = sub("full")
    let forcedAudio = sub("forced-de", "de", forced: true)
    let forcedRead = sub("forced-en", forced: true)
    let tracks = [full, forcedRead, forcedAudio]
    #expect(pick(tracks, mode: SubtitleMode.off) == nil)
    #expect(pick(tracks, mode: SubtitleMode.forced) == forcedAudio)
    #expect(pick([forcedRead], mode: SubtitleMode.forced) == forcedRead)
    #expect(pick(tracks, mode: SubtitleMode.always) == full)
    #expect(pick(tracks, mode: SubtitleMode.foreign) == full)
    #expect(pick(tracks, mode: SubtitleMode.foreign, audio: "en-US") == forcedRead)
    #expect(pick(tracks, mode: SubtitleMode.foreign, audio: nil) == forcedRead)
    #expect(pick([forcedAudio], mode: SubtitleMode.always) == forcedAudio)
    #expect(pick([full], mode: SubtitleMode.always, language: nil) == full)
  }
  @Test func subtitleRanking() {
    let exact = sub("exact", "en-US", sdh: true)
    let flagged = sub("default", "en", flagged: true)
    let plain = sub("plain", "en")
    let sdh = sub("sdh", "en", sdh: true)
    #expect(pick([flagged, exact], mode: SubtitleMode.always, language: "en-US") == exact)
    #expect(pick([plain, flagged], mode: SubtitleMode.always) == flagged)
    #expect(pick([sdh, plain], mode: SubtitleMode.always) == plain)
    #expect(pick([plain, sub("other", "fr")], mode: SubtitleMode.always, language: "pt") == nil)
  }
  @Test func defaultsAndNothingSaved() {
    let flagged = sub("default", flagged: true)
    #expect(pick([flagged]) == flagged)
    #expect(pick([flagged, sub("also-default", "de", flagged: true)]) == nil)
    #expect(pick([flagged, sub("forced", forced: true)])?.id == "forced")
    #expect(pick([sub("unflagged")]) == nil)
    #expect(pick([], mode: SubtitleMode.always) == nil)
    #expect(pick([sub("picture", flagged: true, delivery: SubtitleDelivery.pgs)]) == nil)
    #expect(pick([sub("untagged", nil)], mode: SubtitleMode.always) == nil)
  }
  @Test func subtitleDrawingAndPreviouslyPickedTrack() {
    let picked = sub("stream-7", "fr")
    // A viewer's explicit pick is passed directly to drawing, not run through
    // the initial language preference again. The saved file URL wins here.
    if case .screen(let track, let url) = downloadSubtitleShow(
      picked, mpv: false, url: "file:///saved.vtt")
    {
      #expect(track == picked)
      #expect(url == "file:///saved.vtt")
    } else {
      Issue.record("Expected saved WebVTT")
    }
    for delivery in [SubtitleDelivery.pgs, SubtitleDelivery.burn_in] {
      let track = sub("stream-3", delivery: delivery)
      if case .inFile(let chosen, let index) = downloadSubtitleShow(
        track, mpv: false, url: "unused")
      {
        #expect(chosen == track)
        #expect(index == 3)
      } else {
        Issue.record("Expected embedded picture")
      }
    }
    for format in ["ASS", "SSA"] {
      let styled = sub("stream-4", delivery: SubtitleDelivery.ass, format: format)
      if case .inFile(_, 4) = downloadSubtitleShow(styled, mpv: true, url: "unused") {
      } else {
        Issue.record("Expected mpv styling")
      }
      if case .off = downloadSubtitleShow(styled, mpv: false, url: "unused") {
      } else {
        Issue.record("AVPlayer cannot draw ASS")
      }
    }
    for track in [
      nil, sub("bad-id", delivery: SubtitleDelivery.pgs),
      sub("stream-2", delivery: SubtitleDelivery.pgs, source: SubtitleSource.sidecar),
    ] {
      if case .off = downloadSubtitleShow(track, mpv: true, url: "unused") {
      } else {
        Issue.record("Expected off")
      }
    }
  }
}
