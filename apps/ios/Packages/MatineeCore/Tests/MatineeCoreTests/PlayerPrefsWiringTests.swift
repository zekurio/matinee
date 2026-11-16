import Foundation
import Observation
import Testing

@testable import MatineeCore

/// The player's gesture and button settings reach an open player: Settings
/// and the player share `PlayerPrefs.shared`, and the player reads each in
/// a view's body or at the moment a touch starts, so a change has to be
/// seen by whatever observes it, and kept under the key it's read back from.
@Suite @MainActor struct PlayerPrefsWiringTests {
  private struct Pref {
    let name: String
    let key: String
    let read: (PlayerPrefs) -> Bool
    let write: (PlayerPrefs, Bool) -> Void
  }

  /// Each switch in Settings' Gestures and Buttons, with Android's key for it.
  private let prefs: [Pref] = [
    Pref(name: "swipe levels", key: "swipe_levels", read: { $0.swipeLevels }, write: { $0.swipeLevels = $1 }),
    Pref(
      name: "remember brightness", key: "remember_brightness", read: { $0.rememberBrightness },
      write: { $0.setRememberBrightness($1) }),
    Pref(name: "swipe seek", key: "swipe_seek", read: { $0.swipeSeek }, write: { $0.swipeSeek = $1 }),
    Pref(name: "hold speed", key: "hold_speed", read: { $0.holdSpeed }, write: { $0.holdSpeed = $1 }),
    Pref(name: "skip", key: "button_skip", read: { $0.skipButtons }, write: { $0.skipButtons = $1 }),
    Pref(
      name: "picture in picture", key: "button_picture_in_picture", read: { $0.pictureInPictureButton },
      write: { $0.pictureInPictureButton = $1 }),
    Pref(name: "lock", key: "button_lock", read: { $0.lockButton }, write: { $0.lockButton = $1 }),
    Pref(name: "audio", key: "button_audio", read: { $0.audioButton }, write: { $0.audioButton = $1 }),
    Pref(
      name: "subtitles", key: "button_subtitles", read: { $0.subtitlesButton }, write: { $0.subtitlesButton = $1 }),
  ]

  private func fresh() throws -> (PlayerPrefs, UserDefaults, String) {
    let name = "PlayerPrefsWiringTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    return (PlayerPrefs(defaults: defaults), defaults, name)
  }

  /// A view that read the setting hears its change, as the player's controls
  /// and its gestures do while it's open.
  @Test func eachChangeReachesWhatReadIt() throws {
    for pref in prefs {
      let (player, defaults, name) = try fresh()
      defer { defaults.removePersistentDomain(forName: name) }
      let heard = Heard()
      withObservationTracking { _ = pref.read(player) } onChange: { heard.value = true }
      pref.write(player, !pref.read(player))
      #expect(heard.value, "\(pref.name) changed unseen")
    }
  }

  /// Off and on again, each is kept under Android's key and read back from it.
  @Test func eachIsKeptUnderItsKey() throws {
    for pref in prefs {
      let (player, defaults, name) = try fresh()
      defer { defaults.removePersistentDomain(forName: name) }
      let start = pref.read(player)
      pref.write(player, !start)
      let saved = try #require(defaults.dictionary(forKey: "player"))
      #expect(saved[pref.key] as? Bool == !start, "\(pref.name) saved under another key")
      #expect(pref.read(PlayerPrefs(defaults: defaults)) == !start, "\(pref.name) not read back")
      pref.write(player, start)
      #expect(pref.read(PlayerPrefs(defaults: defaults)) == start, "\(pref.name) not read back")
    }
  }

  /// The brightness a swipe leaves is kept only while remembering is on, and
  /// turning it off forgets it, so the next player starts at the screen's.
  @Test func brightnessFollowsRemembering() throws {
    let (player, defaults, name) = try fresh()
    defer { defaults.removePersistentDomain(forName: name) }
    player.setRememberBrightness(true)
    player.brightness = 0.3
    #expect(PlayerPrefs(defaults: defaults).brightness == 0.3)
    let heard = Heard()
    withObservationTracking { _ = player.brightness } onChange: { heard.value = true }
    player.setRememberBrightness(false)
    #expect(heard.value)
    #expect(PlayerPrefs(defaults: defaults).brightness == -1)
  }

  /// Settings and the player hold the same set, so neither writes back over the other.
  @Test func settingsAndPlayerShareOneSet() {
    let settings = PlayerPrefs.shared
    let player = PlayerPrefs.shared
    #expect(settings === player)
  }
}

/// Whether an observation fired, set from its `onChange`.
private final class Heard: @unchecked Sendable {
  var value = false
}
