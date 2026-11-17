import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsData.kt: what Settings offers and saves, apart from how it's
 * laid out. The lists come from the server's `playback.options`, as
 * AGENTS.md says a client takes them; only the words are the app's.
 * The Apple TV app compiles this file too (project.yml).
 */

/// Saves the account's playback preferences, which every device of the
/// account plays by. The page shows the change at once, while it's on its
/// way, and goes back to what the server has, with a message, when the
/// server refuses. A change made while another is out builds on it.
@Observable final class PlaybackSave {
  /// What's on its way to the server, shown in place of the account's.
  private(set) var pending: PlaybackPreferences?
  private var saving = 0

  /// The preferences to show: the change on its way, else the account's.
  func shown(_ user: User?) -> PlaybackPreferences {
    pending ?? user?.playback ?? DEFAULT_PLAYBACK_PREFERENCES
  }

  func save(
    _ changed: PlaybackPreferences, api: MatineeApi?, session: MatineeSession, snackbar: Snackbar
  ) {
    guard let api else { return }
    pending = changed
    saving += 1
    launchShowing(snackbar, Str.playerErrorSavePreferences) { [self] in
      defer {
        saving -= 1
        if saving == 0 { pending = nil }
      }
      do {
        let user = try await api.account.playback.setPreferences(playbackPreferences: changed)
        session.updateUser(user: user)
      } catch {
        // A later save, if there is one, says what the account has.
        if saving == 1 { pending = nil }
        throw error
      }
    }
  }
}

/// Saves whether a show's specials list with its seasons, which the server
/// applies for every device of the account, as the web's ShowsSection: the
/// switch moves at once, and a refusal puts it back with a message. The
/// pages that list seasons fetch again after it.
@Observable final class SpecialsSave {
  /// The value on its way to the server.
  private(set) var pending: Bool?

  /// What the switch shows: the value on its way, else the account's.
  func shown(_ user: User?) -> Bool { pending ?? user?.library.showSpecials ?? true }

  func save(
    _ show: Bool, api: MatineeApi?, session: MatineeSession, viewer: ViewerState?, snackbar: Snackbar
  ) {
    guard let api else { return }
    pending = show
    launchShowing(snackbar, Str.playbackSpecialsFailed) { [self] in
      defer { if pending == show { pending = nil } }
      let user = try await api.account.library.setPreferences(showSpecials: show)
      session.updateUser(user: user)
      viewer?.changed()
    }
  }
}

/// The audio languages to pick from: the file's default, the original, then
/// the server's, with `current` among them when another app set one the
/// server doesn't list, as the web's `languageOptions`.
func audioLanguageChoices(_ options: PlaybackOptions?, current: String?) -> [(String?, String)] {
  let fixed: [(String?, String)] = [(nil, Str.playbackAudioFileDefault), (ORIGINAL_LANGUAGE, Str.playbackAudioOriginal)]
  return fixed + languageTags(options?.audioLanguages, current: current, fixed: [ORIGINAL_LANGUAGE]).map { ($0, languageName($0)) }
}

/// The subtitle languages to pick from: this device's, then the server's.
func subtitleLanguageChoices(_ options: PlaybackOptions?, current: String?) -> [(String?, String)] {
  let device = Locale.app.language.languageCode?.identifier ?? "en"
  return [(nil, Str.playbackSubtitlesDeviceLanguage(languageName(device)))]
    + languageTags(options?.subtitleLanguages, current: current, fixed: []).map { ($0, languageName($0)) }
}

/// The server's languages, `current` first when it isn't one of them or of `fixed`.
private func languageTags(_ available: [String]?, current: String?, fixed: [String]) -> [String] {
  let tags = available ?? []
  guard let current, !fixed.contains(current), !tags.contains(current) else { return tags }
  return [current] + tags
}

/// The skip lengths to pick from, with `current` too when another app set one the steps don't have.
func skipChoices(_ current: Int, _ options: PlaybackOptions?) -> [(Int, String)] {
  Array(Set((options?.skipSteps ?? []) + [current])).sorted().map { ($0, Str.playbackSkipSeconds($0)) }
}

/// What a session in the list is called: the device's name, the browser, or the kind of app.
func sessionName(_ session: Session) -> String {
  session.deviceName ?? session.browser ?? session.platform.map { Str.accountDeviceApp(platformLabel($0)) }
    ?? Str.accountDeviceBrowser
}

func subtitleModeLabel(_ mode: String) -> String {
  switch mode {
  case SubtitleMode.always: Str.playbackSubtitlesModeAlways
  case SubtitleMode.foreign: Str.playbackSubtitlesModeForeign
  case SubtitleMode.forced: Str.playbackSubtitlesModeForced
  case SubtitleMode.off: Str.playbackSubtitlesModeOff
  default: Str.playbackSubtitlesModeDefault
  }
}

func subtitleColorLabel(_ color: SubtitleColor) -> String {
  switch color {
  case .white: Str.settingsSubtitlesColorWhite
  case .yellow: Str.settingsSubtitlesColorYellow
  case .cyan: Str.settingsSubtitlesColorCyan
  case .green: Str.settingsSubtitlesColorGreen
  }
}

func subtitleBackgroundLabel(_ background: SubtitleBackground) -> String {
  switch background {
  case .none: Str.settingsSubtitlesBackgroundNone
  case .shaded: Str.settingsSubtitlesBackgroundShaded
  case .black: Str.settingsSubtitlesBackgroundBlack
  }
}

func subtitleEdgeLabel(_ edge: SubtitleEdge) -> String {
  switch edge {
  case .outline: Str.settingsSubtitlesEdgeOutline
  case .none: Str.settingsSubtitlesEdgeNone
  // Only the system's style asks for raised and depressed, and it isn't picked here.
  case .shadow, .raised, .depressed: Str.settingsSubtitlesEdgeShadow
  }
}

/// The contract's `DevicePlatform` by name, the same in every language, as the web's `platformLabel`.
nonisolated func platformLabel(_ platform: String) -> String {
  switch platform {
  case "android": "Android"
  case "androidtv": "Android TV"
  case "ios": "iOS"
  case "linux": "Linux"
  case "macos": "macOS"
  case "tizen": "Samsung TV"
  case "tvos": "Apple TV"
  case "windows": "Windows"
  default: platform.prefix(1).uppercased() + platform.dropFirst()
  }
}

/// What a device is, at a glance. Nil is a browser.
nonisolated func platformIcon(_ platform: String?) -> Lucide {
  switch platform {
  case "androidtv", "tizen", "tvos": .tv
  case "android", "ios": .smartphone
  default: .monitor
  }
}

/// "Failed (stream)": how the latest try went, and with which source.
func statusLabel(_ attempt: AttemptDiagnostics) -> String {
  let mode =
    switch attempt.mode {
    case .direct: Str.diagnosticsModeDirect
    case .stream: Str.diagnosticsModeStream
    case .hls, .encode: Str.diagnosticsModeHls
    case .local: Str.diagnosticsModeLocal
    }
  return switch attempt.outcome {
  case .loading: Str.diagnosticsStatusLoading(mode)
  case .playing: Str.diagnosticsStatusPlaying(mode)
  case .failed: Str.diagnosticsStatusFailed(mode)
  case .replaced: Str.diagnosticsStatusReplaced(mode)
  case .closed: Str.diagnosticsStatusClosed(mode)
  }
}
