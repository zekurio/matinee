import Foundation
import Testing

@testable import MatineeCore

@Suite @MainActor struct PlayerPrefsTests {
  @Test func defaultsAndChoices() throws {
    let name = "PlayerPrefsTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let prefs = PlayerPrefs(defaults: defaults)
    #expect(prefs.engine == .mpv)
    #expect(prefs.quality == ORIGINAL_QUALITY)
    #expect(prefs.videoCodec == AUTOMATIC)
    #expect(prefs.audioCodec == AUTOMATIC)
    #expect(prefs.convertAudio.isEmpty)
    #expect(prefs.autoplayNext)
    #expect(!prefs.fillScreen)
    #expect(prefs.pictureInPicture)
    #expect(!prefs.subtitleSystemStyle)
    #expect(prefs.subtitleScale == 1)
    #expect(prefs.subtitleColor == .white)
    #expect(prefs.subtitleBackground == .shaded)
    #expect(prefs.subtitleEdge == .shadow)
    #expect(SUBTITLE_SCALES == [0.75, 1, 1.25, 1.5, 2])
    #expect(OWN_SUBTITLE_EDGES == [.shadow, .outline, .none])
  }

  @Test func sharedIsOneSet() {
    #expect(PlayerPrefs.shared === PlayerPrefs.shared)
  }

  /// Two sets over the same defaults lose each other's changes, which is why the app keeps one.
  @Test func secondSetOverwrites() throws {
    let name = "PlayerPrefsTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let first = PlayerPrefs(defaults: defaults)
    let second = PlayerPrefs(defaults: defaults)
    first.autoplayNext = false
    second.subtitleScale = 2
    #expect(PlayerPrefs(defaults: defaults).autoplayNext)
  }

  @Test func persistsDeviceWideKeys() throws {
    let name = "PlayerPrefsTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let prefs = PlayerPrefs(defaults: defaults)
    prefs.engine = .avPlayer
    prefs.quality = "2160p"
    prefs.videoCodec = "hevc"
    prefs.audioCodec = "aac"
    prefs.convertAudio = ["ac3", "eac3"]
    prefs.autoplayNext = false
    prefs.fillScreen = true
    prefs.pictureInPicture = false
    prefs.subtitleSystemStyle = true
    prefs.subtitleScale = 1.5
    prefs.subtitleColor = .yellow
    prefs.subtitleBackground = .black
    prefs.subtitleEdge = .outline
    let loaded = PlayerPrefs(defaults: defaults)
    #expect(loaded.engine == .avPlayer)
    #expect(loaded.quality == "2160p")
    #expect(loaded.videoCodec == "hevc")
    #expect(loaded.audioCodec == "aac")
    #expect(loaded.convertAudio == ["ac3", "eac3"])
    #expect(!loaded.autoplayNext && loaded.fillScreen && !loaded.pictureInPicture)
    #expect(loaded.subtitleSystemStyle && loaded.subtitleScale == 1.5)
    #expect(loaded.subtitleColor == .yellow && loaded.subtitleBackground == .black)
    #expect(loaded.subtitleEdge == .outline)
    #expect(
      Set(try #require(defaults.dictionary(forKey: "player")).keys) == [
        "engine", "quality", "video_codec", "audio_codec", "convert_audio", "autoplay_next", "fill_screen",
        "picture_in_picture", "subtitle_system_style", "subtitle_scale", "subtitle_color",
        "subtitle_background", "subtitle_edge",
      ])
  }
}
