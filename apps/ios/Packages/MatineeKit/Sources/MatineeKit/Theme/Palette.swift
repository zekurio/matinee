import SwiftUI

/*
 * The colors on screen, named as globals.css names them, from the theme the
 * app picked. A view reads them from the environment:
 *
 *     @Environment(\.palette) private var palette
 *     Text(name).foregroundStyle(palette.mutedForeground)
 *
 * `.matineeTheme(_:)` on the root puts them there and keeps them in step
 * with the color scheme on screen.
 *
 * Careful with two names that read differently on Android: the web's
 * `muted` is a surface (neutral-100) and `mutedForeground` the quiet text;
 * Android's `Palette.Muted` is the text. And `ring` is the focus ring, the
 * accent; the hairline round anything floating is `hairline`.
 */
public nonisolated struct Palette: Hashable, Sendable {
  /// Every role, for math on them, like `mix` or `withAccent`.
  public let colors: ThemeColors

  public init(_ colors: ThemeColors) { self.colors = colors }

  /// Whether the theme on screen is dark.
  public var isDark: Bool { colors.isDark }

  // MARK: Surfaces

  /// `--background`, neutral-0: the page.
  public var background: Color { colors.background.color }
  /// `--card` and `bg-surface`, neutral-50: a card, the settings sheet.
  public var card: Color { colors.surface.color }
  /// `--popover`, neutral-100: menus, dialogs, sheets, toasts.
  public var popover: Color { colors.surfaceRaised.color }
  /// `--secondary`, neutral-150: secondary buttons, icon tiles, the segmented track.
  public var secondary: Color { colors.input.color }
  /// `--muted`, neutral-100: skeletons, avatar fallbacks, an empty state's tile. A surface, not text.
  public var muted: Color { colors.surfaceRaised.color }
  /// `--field`, the sunken surface every text field and select sits on.
  public var field: Color { colors.surfaceSunken.color }

  // MARK: Text

  /// `--foreground`, neutral-900.
  public var foreground: Color { colors.text.color }
  /// `--muted-foreground`, neutral-600: secondary text, placeholder, quiet icons.
  public var mutedForeground: Color { colors.textDim.color }
  /// `--foreground-faint`: the quietest text, like a count after a label.
  public var foregroundFaint: Color { colors.textFaint.color }

  // MARK: Lines

  /// `--border`, neutral-200: hairlines between rows and around blocks.
  public var border: Color { colors.border.color }
  /// `--input`, neutral-300: a field's border, one step above `border`.
  public var input: Color { colors.borderStrong.color }
  /// `--input-hover`, neutral-400: a field's border under the pointer, an off switch's track.
  public var inputHover: Color { colors.borderEmphasis.color }
  /// `ring-1 ring-foreground/10`: the hairline round anything floating.
  public var hairline: Color { colors.text.opacity(0.1) }
  /// `--ring`, the focus ring: the accent.
  public var ring: Color { colors.accent.color }

  // MARK: Accent

  /// `--accent` and `--primary`.
  public var accent: Color { colors.accent.color }
  public var accentForeground: Color { colors.accentForeground.color }
  public var accentHover: Color { colors.accentHover.color }
  public var accentActive: Color { colors.accentActive.color }
  public var accentDim: Color { colors.accentDim.color }
  /// `--accent-soft`: the accent's tint behind it, as faint as it must be for the accent to read on it.
  public var accentSoft: Color {
    colors.accent.opacity(
      contrastSafeTintAlpha(colors.accent, colors.background, preferred: softAlpha(dark: isDark)))
  }
  /// `--accent-border`.
  public var accentBorder: Color { colors.accent.opacity(isDark ? 0.55 : 0.4) }

  // MARK: Status

  /// `--destructive` and `--danger`.
  public var destructive: Color { colors.danger.color }
  public var success: Color { colors.success.color }
  public var warning: Color { colors.warning.color }
  public var info: Color { colors.info.color }
  public var live: Color { colors.live.color }
  /// The `-soft` tints: the status color at 12%.
  public var destructiveSoft: Color { colors.danger.opacity(0.12) }
  public var successSoft: Color { colors.success.opacity(0.12) }
  public var warningSoft: Color { colors.warning.opacity(0.12) }
  public var infoSoft: Color { colors.info.opacity(0.12) }

  /// amber-300, the rating star.
  public var star: Color { RGB(0xFCD34D).color }

  // MARK: Glass

  /// `--popover-glass`: the popover, see-through, over a blur. 65% in dark,
  /// and milkier, 84%, in light, where a big panel over posters must stay readable.
  public var popoverGlass: Color { colors.surfaceRaised.opacity(isDark ? 0.65 : 0.84) }

  /// The gradients that stand in for missing art: the surfaces, a step apart.
  public var tones: [(Color, Color)] {
    [0.07, 0.09, 0.11, 0.10].map { lift in
      (
        mix(colors.surfaceRaised, colors.text, lift).color,
        mix(colors.surfaceRaised, colors.text, lift / 3).color
      )
    }
  }

  /// `color-mix(in oklab, a, b amount)`, for the few web colors that are mixes, like a secondary button's hover.
  public func mixed(_ base: KeyPath<ThemeColors, RGB>, with other: KeyPath<ThemeColors, RGB>, _ amount: Double)
    -> Color
  {
    mix(colors[keyPath: base], colors[keyPath: other], amount).color
  }

  public static let matineeDark = Palette(MATINEE_DARK)
  public static let matineeLight = Palette(MATINEE_LIGHT)
}

extension EnvironmentValues {
  /// The theme's colors for the appearance on screen.
  // Disfavored while the app keeps an old `\.palette` of its own, which
  // extension members from an imported module would otherwise make
  // ambiguous in files that don't import the kit. Harmless once it's gone.
  @_disfavoredOverload @Entry public var palette = Palette.matineeDark
}
