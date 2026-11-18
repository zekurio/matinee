import SwiftUI

/// System follows the device; light and dark stay as picked.
public nonisolated enum ThemeMode: String, Sendable, CaseIterable {
  case system, light, dark

  /// What `preferredColorScheme` gets: nil leaves it to the device.
  public var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }
}

/// The colors each appearance shows: Matinee's palettes, with the server's
/// accent on them when it set one. The app's theme store builds one and
/// hands it to `.matineeTheme`; the kit doesn't know where accents come from.
public nonisolated struct MatineeTheme: Hashable, Sendable {
  public var light: ThemeColors
  public var dark: ThemeColors

  public init(light: ThemeColors = MATINEE_LIGHT, dark: ThemeColors = MATINEE_DARK) {
    self.light = light
    self.dark = dark
  }

  /// Matinee's palettes with an accent per appearance, as `auth.config`'s
  /// `themeAccents` sends them (`#rrggbb`, or nil for Matinee's own).
  public init(accentLight: String?, accentDark: String?) {
    self.init(
      light: RGB(hex: accentLight).map(MATINEE_LIGHT.withAccent) ?? MATINEE_LIGHT,
      dark: RGB(hex: accentDark).map(MATINEE_DARK.withAccent) ?? MATINEE_DARK)
  }

  public static let matinee = MatineeTheme()

  public func colors(for scheme: ColorScheme) -> ThemeColors { scheme == .dark ? dark : light }
}

extension View {
  /// The theme on everything under it: the palette in the environment, the
  /// accent as the tint (text selection and the caret), Red Hat Text for
  /// text that sets no style, and the page's background. Goes once on the
  /// root, and again on the root of anything the system presents in its
  /// own window. `mode` picks light or dark, or leaves it to the device.
  public func matineeTheme(_ theme: MatineeTheme = .matinee, mode: ThemeMode = .system) -> some View {
    modifier(ThemeRoot(theme: theme)).preferredColorScheme(mode.colorScheme)
  }

  /// Dark whatever the theme, as the player is: video plays on black.
  public func forceDarkTheme(_ theme: MatineeTheme = .matinee) -> some View {
    let palette = Palette(theme.dark)
    return environment(\.palette, palette)
      .environment(\.colorScheme, .dark)
      .foregroundStyle(palette.foreground)
      .tint(palette.accent)
  }
}

private struct ThemeRoot: ViewModifier {
  let theme: MatineeTheme
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    let palette = Palette(theme.colors(for: scheme))
    content
      .environment(\.palette, palette)
      .tint(palette.accent)
      .foregroundStyle(palette.foreground)
      // The font for text that sets none; not its line height, which would
      // reach text in a fixed frame.
      .textFont(.sm)
      .background(palette.background.ignoresSafeArea())
  }
}

extension View {
  /// Frosted glass, the web's `glass` utility, for what floats over the
  /// page or the player: the popover, see-through, over a blur of what's
  /// behind. Solid when the person asked for less transparency.
  public func glassBackground<S: Shape>(in shape: S) -> some View {
    modifier(GlassBackground(shape: shape))
  }
}

private struct GlassBackground<S: Shape>: ViewModifier {
  let shape: S
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  func body(content: Content) -> some View {
    content.background {
      if reduceTransparency {
        shape.fill(palette.popover)
      } else {
        // The web's blur(24px) saturate(1.8) brightness(0.8) in dark, and a
        // milkier blur(40px) saturate(1.2) in light, come closest as the
        // thin material under the popover's tint.
        shape.fill(palette.isDark ? .ultraThinMaterial : .thinMaterial)
          .overlay(shape.fill(palette.popoverGlass))
      }
    }
  }
}
