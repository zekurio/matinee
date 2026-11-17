import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsData.kt for a TV: what Settings offers and saves, apart from
 * how it's laid out. The lists come from the server's `playback.options`,
 * as AGENTS.md says a client takes them; only the words are the app's.
 * The saving, the choices, and most of the words are the iPhone's
 * (Matinee/UI/settings/SettingsData.swift); this is what a TV adds.
 */

/// What this TV decodes, asked once: it doesn't change while the app runs.
@MainActor enum TVDevice {
  static let capabilities = Capabilities.probe()
}

extension PlaybackSave {
  /// Saves `user`'s preferences with `edit` made to what shows now.
  func change(
    _ user: User?, api: MatineeApi?, session: MatineeSession, snackbar: Snackbar,
    _ edit: (inout PlaybackPreferences) -> Void
  ) {
    var next = shown(user)
    edit(&next)
    save(next, api: api, session: session, snackbar: snackbar)
  }
}

/// The iPhone's choices as a side panel's options.
func audioLanguageOptions(_ options: PlaybackOptions?, current: String?) -> [TVOption<String?>] {
  audioLanguageChoices(options, current: current).map { TVOption($0.0, $0.1) }
}

func subtitleLanguageOptions(_ options: PlaybackOptions?, current: String?) -> [TVOption<String?>] {
  subtitleLanguageChoices(options, current: current).map { TVOption($0.0, $0.1) }
}

func skipOptions(_ current: Int, _ options: PlaybackOptions?) -> [TVOption<Int>] {
  skipChoices(current, options).map { TVOption($0.0, $0.1) }
}

/// The label of `value` among `options`, or `fallback` when it isn't one.
func optionLabel<Value: Hashable>(_ options: [TVOption<Value>], _ value: Value, fallback: String = "") -> String {
  options.first { $0.value == value }?.label ?? fallback
}

func themeModeLabel(_ mode: ThemeMode) -> String {
  switch mode {
  case .system: Str.webAppearanceColorSchemeSystem
  case .light: Str.webAppearanceColorSchemeLight
  case .dark: Str.webAppearanceColorSchemeDark
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
