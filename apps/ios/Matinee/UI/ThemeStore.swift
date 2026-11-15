import Foundation
import MatineeCore
import MatineeKit
import Observation
import SwiftUI

/// The kit's light, dark, or the device's, not the contract's enum of the same name.
typealias ThemeMode = MatineeKit.ThemeMode

extension ThemeMode {
  /// The mode saved under `key`, or the device's.
  static func of(_ key: String?) -> ThemeMode { key.flatMap(ThemeMode.init(rawValue:)) ?? .system }
}

/// The live theme, as the web's theme engine and Android's ThemeStore keep
/// it: the mode picked on this device, and the accents the server's admins
/// chose, fitted onto Matinee's palettes by the kit (`MatineeTheme`). The
/// root hands `theme` and `mode` to `.matineeTheme`, which picks light or
/// dark by the device under `system`.
///
/// Android's Material You switch has no iOS counterpart and isn't ported.
@Observable
final class ThemeStore {
  private let defaults: UserDefaults

  /// The mode picked on this device.
  private(set) var mode: ThemeMode

  /// The server's accents, as `auth.config` sent them last.
  private(set) var accents: ThemeAccents

  /// Matinee's palettes with the server's accents on them.
  private(set) var theme: MatineeTheme

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let accents = Self.readAccents(defaults)
    mode = ThemeMode.of(defaults.string(forKey: Keys.mode))
    self.accents = accents
    theme = MatineeTheme(accentLight: accents.light, accentDark: accents.dark)
  }

  /// The colors each appearance shows, for a page that draws both, like Appearance's previews.
  var light: ThemeColors { theme.light }
  var dark: ThemeColors { theme.dark }

  func setMode(_ mode: ThemeMode) {
    defaults.set(mode.rawValue, forKey: Keys.mode)
    self.mode = mode
  }

  func setAccents(_ value: ThemeAccents) {
    guard value != accents else { return }
    accents = value
    if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: Keys.accents) }
    theme = MatineeTheme(accentLight: value.light, accentDark: value.dark)
  }

  /// The server's accents, read again.
  func pull(_ api: MatineeApi) async {
    if let config = try? await api.auth.config() { setAccents(config.themeAccents) }
  }

  private enum Keys {
    static let mode = "theme.mode"
    static let accents = "theme.accents"
  }

  private static func readAccents(_ defaults: UserDefaults) -> ThemeAccents {
    defaults.data(forKey: Keys.accents).flatMap { try? JSONDecoder().decode(ThemeAccents.self, from: $0) }
      ?? ThemeAccents(light: nil, dark: nil)
  }
}

extension View {
  /// The app's theme from `store` on everything under it: the kit's palette,
  /// type, and background, in the mode picked. Goes once on the root.
  func matineeTheme(_ store: ThemeStore) -> some View {
    matineeTheme(store.theme, mode: store.mode)
  }

  /// Dark whatever the mode, as the player is, with the server's dark accent.
  func forceDarkTheme(_ store: ThemeStore) -> some View {
    forceDarkTheme(store.theme)
  }
}
