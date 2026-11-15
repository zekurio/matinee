import Foundation
import MatineeCore
import Observation
import SwiftUI

/// System follows the device; light and dark stay as picked.
nonisolated enum ThemeMode: String, Sendable, CaseIterable {
  case system, light, dark

  static func of(_ key: String?) -> ThemeMode { key.flatMap(ThemeMode.init(rawValue:)) ?? .system }

  /// What `preferredColorScheme` gets: nil leaves it to the device.
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }
}

/// The live theme, as the web's theme engine and Android's ThemeStore keep
/// it: Matinee's light and dark, the mode picked on this device, and the
/// accent the server's admins chose. Which of the two shows under `system`
/// is the device's to say; `.matineeTheme(_:)` reads it from the
/// environment, so there's nothing here to keep in step with it.
///
/// Android's Material You switch has no iOS counterpart and isn't ported.
@Observable
final class ThemeStore {
  private let defaults: UserDefaults

  /// The mode picked on this device.
  private(set) var mode: ThemeMode

  /// The server's accents, as `auth.config` sent them last.
  private(set) var accents: ThemeAccents

  /// The colors each appearance shows.
  private(set) var light: ThemeColors
  private(set) var dark: ThemeColors

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let mode = ThemeMode.of(defaults.string(forKey: Keys.mode))
    let accents = Self.readAccents(defaults)
    self.mode = mode
    self.accents = accents
    light = Self.colors(.light, accents)
    dark = Self.colors(.dark, accents)
  }

  func colors(for appearance: Appearance) -> ThemeColors { appearance == .light ? light : dark }

  func setMode(_ mode: ThemeMode) {
    defaults.set(mode.rawValue, forKey: Keys.mode)
    self.mode = mode
  }

  func setAccents(_ value: ThemeAccents) {
    guard value != accents else { return }
    accents = value
    if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: Keys.accents) }
    light = Self.colors(.light, value)
    dark = Self.colors(.dark, value)
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

  /// The server's accent tints Matinee's own palettes.
  private static func colors(_ appearance: Appearance, _ accents: ThemeAccents) -> ThemeColors {
    let base = ThemeColors.matinee(appearance)
    let seed = RGB(hex: appearance == .light ? accents.light : accents.dark)
    return seed.map(base.withAccent) ?? base
  }
}
