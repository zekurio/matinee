import SwiftUI
import UIKit

/*
 * The colors on screen, by the names the app's screens use, from the theme
 * the person picked (see ThemeStore): the web's roles, as its globals.css
 * turns them into tokens, and Android's `Palette` names them. A view reads
 * them from the environment:
 *
 *     @Environment(\.palette) private var palette
 *     Text(name).foregroundStyle(palette.muted)
 *
 * `.matineeTheme(store)` on the root puts them there and keeps them in step
 * with the mode and the device's appearance.
 */
nonisolated struct Palette: Hashable, Sendable {
  /// Every role, for the few that have no name of their own here (success, warning, live).
  let colors: ThemeColors

  init(_ colors: ThemeColors) { self.colors = colors }

  var background: Color { colors.background.color }  // --neutral-0
  var card: Color { colors.surface.color }  // --neutral-50
  var raised: Color { colors.surfaceRaised.color }  // --neutral-100, popovers and sheets
  var secondary: Color { colors.input.color }  // --neutral-150
  var border: Color { colors.border.color }  // --neutral-200
  var input: Color { colors.borderStrong.color }  // --neutral-300
  var muted: Color { colors.textDim.color }  // --neutral-600, muted text
  var faint: Color { colors.textFaint.color }  // --foreground-faint
  var foreground: Color { colors.text.color }  // --neutral-900
  var accent: Color { colors.accent.color }
  var accentForeground: Color { colors.accentForeground.color }
  var danger: Color { colors.danger.color }

  /// The accent's tint behind it, as faint as it must be for the accent to read on it (--accent-soft).
  var accentSoft: Color {
    colors.accent.opacity(
      contrastSafeTintAlpha(colors.accent, colors.background, preferred: softAlpha(dark: isDark)))
  }

  /// amber-300, the rating star.
  var star: Color { RGB(0xFCD34D).color }

  /// Whether the theme on screen is dark, for what sits on it, like the status bar.
  var isDark: Bool { colors.isDark }

  /// The gradients that stand in for missing art, as `tone()` picks them: the surfaces, a step apart.
  var tones: [(Color, Color)] {
    [0.07, 0.09, 0.11, 0.10].map { lift in
      (
        mix(colors.surfaceRaised, colors.text, lift).color,
        mix(colors.surfaceRaised, colors.text, lift / 3).color
      )
    }
  }
}

extension EnvironmentValues {
  /// The theme's colors for the appearance on screen.
  @Entry var palette = Palette(MATINEE_DARK)
}

/// Red Hat Text, bundled (Info.plist's UIAppFonts). It's a variable font,
/// so a weight is a point on its weight axis rather than a file: SwiftUI's
/// `Font.custom` and `.fontWeight` don't reach it, and every font here
/// comes through `uiFont`, with the exact weights Android sets.
nonisolated enum RedHatText {
  private static let weightAxis = 0x7767_6874  // 'wght'
  // NSCache is thread-safe, and fonts are immutable.
  nonisolated(unsafe) private static let cache = NSCache<NSString, UIFont>()

  static func value(_ weight: Font.Weight) -> CGFloat {
    switch weight {
    case .ultraLight, .thin, .light: 300
    case .medium: 500
    case .semibold: 600
    case .bold, .heavy, .black: 700
    default: 400
    }
  }

  /// The font at `size` points and `weight`, falling back to the system's
  /// should the bundled one be missing, which the gallery would show.
  static func uiFont(size: CGFloat, weight: Font.Weight) -> UIFont {
    let key = "\(size)-\(value(weight))" as NSString
    if let font = cache.object(forKey: key) { return font }
    let descriptor = UIFontDescriptor(fontAttributes: [
      .name: "RedHatText-Regular",
      UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: value(weight)],
    ])
    let font = UIFont(descriptor: descriptor, size: size)
    let resolved = font.fontName.hasPrefix("RedHatText") ? font : .systemFont(ofSize: size, weight: weight.uiWeight)
    cache.setObject(resolved, forKey: key)
    return resolved
  }

  /// A SwiftUI font of it, at a size that doesn't follow Dynamic Type, for
  /// text drawn to fit a shape, like an avatar's initials.
  static func font(fixedSize size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font(uiFont(size: size, weight: weight))
  }
}

extension Font.Weight {
  nonisolated fileprivate var uiWeight: UIFont.Weight {
    switch RedHatText.value(self) {
    case 300: .light
    case 500: .medium
    case 600: .semibold
    case 700: .bold
    default: .regular
    }
  }
}

/// The type scale, by Android's (Material's) names, as Theme.kt sets it:
/// `style = MaterialTheme.typography.titleLarge` is `.textStyle(.titleLarge)`.
/// Each scales with Dynamic Type from the system style nearest its size.
nonisolated enum Typography: CaseIterable, Sendable {
  case displayLarge, displayMedium, displaySmall
  case headlineLarge, headlineMedium, headlineSmall
  case titleLarge, titleMedium, titleSmall
  case bodyLarge, bodyMedium, bodySmall
  case labelLarge, labelMedium, labelSmall

  /// Size, weight, and line height in points, and tracking in em.
  var spec: (size: CGFloat, weight: Font.Weight, line: CGFloat, tracking: CGFloat) {
    switch self {
    case .displayLarge: (48, .bold, 52, -0.025)
    case .displayMedium: (40, .bold, 44, -0.025)
    case .displaySmall: (34, .bold, 38, -0.025)
    case .headlineLarge: (30, .bold, 36, -0.025)
    case .headlineMedium: (26, .bold, 32, -0.025)
    case .headlineSmall: (22, .semibold, 28, -0.025)
    case .titleLarge: (20, .semibold, 28, -0.025)
    case .titleMedium: (16, .semibold, 24, 0)
    case .titleSmall: (14, .medium, 20, 0)
    case .bodyLarge: (16, .regular, 24, 0)
    case .bodyMedium: (14, .regular, 20, 0)
    case .bodySmall: (13, .regular, 20, 0)
    case .labelLarge: (14, .medium, 20, 0)
    case .labelMedium: (13, .medium, 18, 0)
    case .labelSmall: (11, .medium, 16, 0)
    }
  }

  /// The system style whose Dynamic Type curve this one follows.
  var relativeTo: Font.TextStyle {
    switch self {
    case .displayLarge, .displayMedium, .displaySmall, .headlineLarge: .largeTitle
    case .headlineMedium: .title
    case .headlineSmall: .title2
    case .titleLarge: .title3
    case .titleMedium, .bodyLarge: .body
    case .titleSmall, .bodyMedium, .labelLarge: .subheadline
    case .bodySmall, .labelMedium: .footnote
    case .labelSmall: .caption2
    }
  }

  var uiTextStyle: UIFont.TextStyle {
    switch relativeTo {
    case .largeTitle: .largeTitle
    case .title: .title1
    case .title2: .title2
    case .title3: .title3
    case .subheadline: .subheadline
    case .footnote: .footnote
    case .caption2: .caption2
    default: .body
    }
  }

  /// The UIKit font, scaled for the trait collection's Dynamic Type, or
  /// the current one's.
  func uiFont(_ weight: Font.Weight? = nil, traits: UITraitCollection? = nil) -> UIFont {
    let base = RedHatText.uiFont(size: spec.size, weight: weight ?? spec.weight)
    return UIFontMetrics(forTextStyle: uiTextStyle).scaledFont(for: base, compatibleWith: traits)
  }

  /// How much Dynamic Type grows this style at `size`.
  func scale(at size: DynamicTypeSize) -> CGFloat {
    let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size))
    return UIFontMetrics(forTextStyle: uiTextStyle).scaledValue(for: spec.size, compatibleWith: traits)
      / spec.size
  }
}

/// The font, its tracking, and its line height, all three following Dynamic Type.
private struct TypographyModifier: ViewModifier {
  let style: Typography
  let weight: Font.Weight?
  @Environment(\.dynamicTypeSize) private var dynamicType

  @ViewBuilder func body(content: Content) -> some View {
    let spec = style.spec
    let scale = style.scale(at: dynamicType)
    let font = RedHatText.uiFont(size: (spec.size * scale).rounded(), weight: weight ?? spec.weight)
    let line = spec.line * scale
    let styled = content.font(Font(font)).tracking(spec.tracking * spec.size * scale)
    // Android's line heights are tighter than the font's own, which
    // `lineSpacing` can only add to; iOS 26 sets them exactly.
    if #available(iOS 26, *) {
      styled.lineHeight(.exact(points: line))
    } else {
      styled.lineSpacing(max(0, line - font.lineHeight))
    }
  }
}

extension View {
  /// Sets text in a style of the type scale: Android's
  /// `style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium`
  /// is `.textStyle(.bodyMedium, weight: .medium)`.
  func textStyle(_ style: Typography, weight: Font.Weight? = nil) -> some View {
    modifier(TypographyModifier(style: style, weight: weight))
  }
}

extension View {
  /// The app's theme on everything under it: the palette in the environment,
  /// the accent as the tint, Red Hat Text, the page's background, and the
  /// same colors on the navigation bars, tab bars, and sheets UIKit draws.
  /// Goes once on the root.
  func matineeTheme(_ store: ThemeStore) -> some View {
    modifier(ThemeRoot(store: store)).preferredColorScheme(store.mode.colorScheme)
  }

  /// Dark whatever the theme, as the player is: video plays on black.
  func forceDarkTheme(_ store: ThemeStore) -> some View {
    environment(\.palette, Palette(store.dark))
      .environment(\.colorScheme, .dark)
  }
}

private struct ThemeRoot: ViewModifier {
  let store: ThemeStore
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    let palette = Palette(store.colors(for: scheme == .dark ? .dark : .light))
    content
      .environment(\.palette, palette)
      .tint(palette.accent)
      .foregroundStyle(palette.foreground)
      .textStyle(.bodyLarge)
      .background(palette.background.ignoresSafeArea())
      .onChange(of: palette, initial: true) { SystemBars.apply(palette) }
  }
}

/// The colors and fonts of what UIKit draws for SwiftUI: navigation and tab
/// bars, and the controls SwiftUI leaves to it. Set on the appearance
/// proxies, which bars made after it take; `.topBar` sets a page's bar
/// colors in SwiftUI too, so one already on screen follows a theme change.
enum SystemBars {
  static func apply(_ palette: Palette) {
    let colors = palette.colors
    let bar = UINavigationBarAppearance()
    bar.configureWithOpaqueBackground()
    bar.backgroundColor = colors.background.uiColor
    bar.shadowColor = .clear
    bar.titleTextAttributes = [
      .font: Typography.titleLarge.uiFont(), .foregroundColor: colors.text.uiColor,
    ]
    bar.largeTitleTextAttributes = [
      .font: Typography.headlineLarge.uiFont(), .foregroundColor: colors.text.uiColor,
    ]
    let button = UIBarButtonItemAppearance()
    button.normal.titleTextAttributes = [
      .font: Typography.labelLarge.uiFont(), .foregroundColor: colors.text.uiColor,
    ]
    bar.buttonAppearance = button
    bar.backButtonAppearance = button
    let navigation = UINavigationBar.appearance()
    navigation.standardAppearance = bar
    navigation.compactAppearance = bar
    navigation.scrollEdgeAppearance = bar
    // The back chevron and bar buttons are the text's color, as Android's top bar draws them.
    navigation.tintColor = colors.text.uiColor

    let tabs = UITabBarAppearance()
    tabs.configureWithOpaqueBackground()
    tabs.backgroundColor = colors.background.uiColor
    tabs.shadowColor = colors.border.uiColor
    for item in [tabs.stackedLayoutAppearance, tabs.inlineLayoutAppearance, tabs.compactInlineLayoutAppearance] {
      item.normal.iconColor = colors.textDim.uiColor
      item.normal.titleTextAttributes = [
        .font: Typography.labelSmall.uiFont(), .foregroundColor: colors.textDim.uiColor,
      ]
      item.selected.iconColor = colors.text.uiColor
      item.selected.titleTextAttributes = [
        .font: Typography.labelSmall.uiFont(), .foregroundColor: colors.text.uiColor,
      ]
    }
    UITabBar.appearance().standardAppearance = tabs
    UITabBar.appearance().scrollEdgeAppearance = tabs

    UIRefreshControl.appearance().tintColor = colors.textDim.uiColor
    UIPageControl.appearance().currentPageIndicatorTintColor = colors.text.uiColor
    UIPageControl.appearance().pageIndicatorTintColor = colors.borderStrong.uiColor
    // Alerts, menus, and text selection take the window's tint.
    for scene in UIApplication.shared.connectedScenes {
      for window in (scene as? UIWindowScene)?.windows ?? [] {
        window.tintColor = colors.accent.uiColor
        window.backgroundColor = colors.background.uiColor
      }
    }
  }
}
