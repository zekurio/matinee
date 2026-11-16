import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsData.kt for a TV: what Settings offers and saves, apart from
 * how it's laid out. The lists come from the server's `playback.options`,
 * as AGENTS.md says a client takes them; only the words are the app's.
 * The iPhone's are in Matinee/UI/settings/SettingsData.swift, which a TV
 * doesn't share, so these follow it and should change with it.
 */

/// What this TV decodes, asked once: it doesn't change while the app runs.
@MainActor enum TVDevice {
  static let capabilities = Capabilities.probe()
}

/// Saves the account's playback preferences, which every device of the
/// account plays by. The page shows the change at once, while it's on its
/// way, and goes back to what the server has, with a message, when the
/// server refuses. A change made while another is out builds on it.
@Observable final class TVPlaybackSave {
  /// What's on its way to the server, shown in place of the account's.
  private(set) var pending: PlaybackPreferences?
  private var saving = 0

  /// The preferences to show: the change on its way, else the account's.
  func shown(_ user: User?) -> PlaybackPreferences {
    pending ?? user?.playback ?? DEFAULT_PLAYBACK_PREFERENCES
  }

  /// Saves `user`'s preferences with `edit` made to what shows now.
  func change(
    _ user: User?, api: MatineeApi?, session: MatineeSession, snackbar: Snackbar,
    _ edit: (inout PlaybackPreferences) -> Void
  ) {
    var next = shown(user)
    edit(&next)
    save(next, api: api, session: session, snackbar: snackbar)
  }

  private func save(_ changed: PlaybackPreferences, api: MatineeApi?, session: MatineeSession, snackbar: Snackbar) {
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
/// applies for every device of the account: the switch moves at once, and
/// a refusal puts it back with a message.
@Observable final class TVSpecialsSave {
  private(set) var pending: Bool?

  func shown(_ user: User?) -> Bool { pending ?? user?.library.showSpecials ?? true }

  func save(_ show: Bool, api: MatineeApi?, session: MatineeSession, viewer: ViewerState?, snackbar: Snackbar) {
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
func audioLanguageOptions(_ options: PlaybackOptions?, current: String?) -> [TVOption<String?>] {
  let fixed: [TVOption<String?>] = [
    TVOption(nil, Str.playbackAudioFileDefault), TVOption(ORIGINAL_LANGUAGE, Str.playbackAudioOriginal),
  ]
  return fixed
    + languageTags(options?.audioLanguages, current: current, fixed: [ORIGINAL_LANGUAGE]).map {
      TVOption<String?>($0, languageName($0))
    }
}

/// The subtitle languages to pick from: this TV's, then the server's.
func subtitleLanguageOptions(_ options: PlaybackOptions?, current: String?) -> [TVOption<String?>] {
  let device = Locale.app.language.languageCode?.identifier ?? "en"
  let fixed: [TVOption<String?>] = [TVOption(nil, Str.playbackSubtitlesDeviceLanguage(languageName(device)))]
  return fixed
    + languageTags(options?.subtitleLanguages, current: current, fixed: []).map { TVOption<String?>($0, languageName($0)) }
}

/// The server's languages, `current` first when it isn't one of them or of `fixed`.
private func languageTags(_ available: [String]?, current: String?, fixed: [String]) -> [String] {
  let tags = available ?? []
  guard let current, !fixed.contains(current), !tags.contains(current) else { return tags }
  return [current] + tags
}

/// The skip lengths to pick from, with `current` too when another app set one the steps don't have.
func skipOptions(_ current: Int, _ options: PlaybackOptions?) -> [TVOption<Int>] {
  Array(Set((options?.skipSteps ?? []) + [current])).sorted().map { TVOption($0, Str.playbackSkipSeconds($0)) }
}

/// The label of `value` among `options`, or `fallback` when it isn't one.
func optionLabel<Value: Hashable>(_ options: [TVOption<Value>], _ value: Value, fallback: String = "") -> String {
  options.first { $0.value == value }?.label ?? fallback
}

/// What a session in the list is called: the device's name, the browser, or the kind of app.
func sessionName(_ session: Session) -> String {
  session.deviceName ?? session.browser ?? session.platform.map { Str.accountDeviceApp(platformLabel($0)) }
    ?? Str.accountDeviceBrowser
}

/// The contract's `DevicePlatform` by name, the same in every language, as the web's `platformLabel`.
func platformLabel(_ platform: String) -> String {
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
func platformIcon(_ platform: String?) -> Lucide {
  switch platform {
  case "androidtv", "tizen", "tvos": .tv
  case "android", "ios": .smartphone
  default: .monitor
  }
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

func themeModeLabel(_ mode: ThemeMode) -> String {
  switch mode {
  case .system: Str.webAppearanceColorSchemeSystem
  case .light: Str.webAppearanceColorSchemeLight
  case .dark: Str.webAppearanceColorSchemeDark
  }
}

/// "Failed (stream)": how the latest playback went, and with which source.
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

extension AuthState {
  /// The server in use, while signed in.
  var server: String? {
    switch self {
    case .signedIn(let server, _), .offline(let server, _): server
    default: nil
    }
  }
}
