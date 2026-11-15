import CoreFoundation
import Foundation
import MediaAccessibility
import Testing

@testable import MatineeCore

@Suite @MainActor struct SubtitleStyleTests {
  @Test func ownLook() throws {
    let name = "SubtitleStyleTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let prefs = PlayerPrefs(defaults: defaults)
    for (choice, color) in [
      (SubtitleColor.white, CaptionColor(1, 1, 1)),
      (.yellow, CaptionColor(1, 225.0 / 255, 77.0 / 255)),
      (.cyan, CaptionColor(108.0 / 255, 229.0 / 255, 1)),
      (.green, CaptionColor(124.0 / 255, 242.0 / 255, 154.0 / 255)),
    ] {
      prefs.subtitleColor = choice
      #expect(subtitleLook(prefs).color == color)
    }
    for (choice, alpha) in [(SubtitleBackground.none, 0.0), (.shaded, 0.45), (.black, 1.0)] {
      prefs.subtitleBackground = choice
      #expect(subtitleLook(prefs).background == CaptionColor(0, 0, 0, alpha))
    }
    prefs.subtitleScale = 2
    for edge in [SubtitleEdge.shadow, .outline, .none, .raised, .depressed] {
      prefs.subtitleEdge = edge
      let look = subtitleLook(prefs)
      #expect(look.edge == edge)
      #expect(look.edgeColor == CaptionColor(0, 0, 0))
      #expect(look.window.alpha == 0)
      #expect(look.scale == 2)
    }
  }

  @Test func followsSystemChanges() async throws {
    let name = "SubtitleStyleTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let prefs = PlayerPrefs(defaults: defaults)
    prefs.subtitleSystemStyle = true
    let style = SystemCaptionStyle.shared
    let before = style.revision
    let look = subtitleLook(prefs)
    #expect(abs(look.scale - MACaptionAppearanceGetRelativeCharacterSize(.user, nil)) < 0.001)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetLocalCenter(),
      CFNotificationName(kMACaptionAppearanceSettingsChangedNotification), nil, nil, true)
    for _ in 0..<100 where style.revision == before {
      try await Task.sleep(for: .milliseconds(1))
    }
    #expect(style.revision > before)
  }
}
