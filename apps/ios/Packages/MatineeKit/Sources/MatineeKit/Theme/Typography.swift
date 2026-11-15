import CoreText
import SwiftUI
import UIKit

/// Red Hat Text, the web's face, bundled with the kit. It's a variable
/// font, so a weight is a point on its weight axis rather than a file:
/// SwiftUI's `Font.custom` and `.fontWeight` don't reach it, and every font
/// here comes through `uiFont` with the exact weight the web sets.
public nonisolated enum RedHatText {
  private static let weightAxis = 0x7767_6874  // 'wght'
  // NSCache is thread-safe, and fonts are immutable.
  nonisolated(unsafe) private static let cache = NSCache<NSString, UIFont>()

  /// Registers the bundled font with the process. Idempotent; the first
  /// font asked for does it, so nothing has to call it.
  public static let register: Void = {
    guard let url = Bundle.module.url(forResource: "red_hat_text", withExtension: "ttf") else { return }
    // Fails harmlessly when the app registered the same file through UIAppFonts.
    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  }()

  static func value(_ weight: Font.Weight) -> CGFloat {
    switch weight {
    case .ultraLight, .thin, .light: 300
    case .medium: 500
    case .semibold: 600
    case .bold, .heavy, .black: 700
    default: 400
    }
  }

  /// The font at `size` points and `weight`, or the system's should the
  /// bundled one be missing, which the gallery would show.
  public static func uiFont(size: CGFloat, weight: Font.Weight) -> UIFont {
    _ = register
    let key = "\(size)-\(value(weight))" as NSString
    if let font = cache.object(forKey: key) { return font }
    let descriptor = UIFontDescriptor(fontAttributes: [
      .name: "RedHatText-Regular",
      UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: value(weight)],
    ])
    let font = UIFont(descriptor: descriptor, size: size)
    let resolved = font.fontName.hasPrefix("RedHatText") ? font : .systemFont(ofSize: size, weight: uiWeight(weight))
    cache.setObject(resolved, forKey: key)
    return resolved
  }

  /// A SwiftUI font at a size that doesn't follow Dynamic Type, for text
  /// drawn to fit a shape, like an avatar's initials.
  public static func font(fixedSize size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font(uiFont(size: size, weight: weight))
  }

  private static func uiWeight(_ weight: Font.Weight) -> UIFont.Weight {
    switch value(weight) {
    case 300: .light
    case 500: .medium
    case 600: .semibold
    case 700: .bold
    default: .regular
    }
  }
}

/// The web's type scale, by Tailwind's names: `text-sm` is `.sm`,
/// `text-2xl` is `.xl2`, and globals.css's `text-13px` is `.px13`. Each
/// has the web's size and line height in points, which globals.css keeps
/// to whole even pixels so text centers on the icon beside it, and grows
/// with Dynamic Type from the system style nearest its size.
public nonisolated enum TextSize: String, CaseIterable, Sendable {
  case px9, px10, px11, xs, px13, sm, px15, base, lg, xl, px22, xl2, px26, px28, xl3, px32, xl4, xl5

  /// Size and line height in points.
  public var metrics: (size: CGFloat, line: CGFloat) {
    switch self {
    case .px9: (9, 12)
    case .px10: (10, 14)
    case .px11: (11, 16)
    case .xs: (12, 16)
    case .px13: (13, 20)
    case .sm: (14, 20)
    case .px15: (15, 22)
    case .base: (16, 24)
    case .lg: (18, 28)
    case .xl: (20, 28)
    case .px22: (22, 28)
    case .xl2: (24, 32)
    case .px26: (26, 32)
    case .px28: (28, 32)
    case .xl3: (30, 36)
    case .px32: (32, 40)
    case .xl4: (36, 40)
    case .xl5: (48, 48)
    }
  }

  /// The web's class for it, for the gallery and the README.
  public var webName: String {
    switch self {
    case .px9, .px10, .px11, .px13, .px15, .px22, .px26, .px28, .px32: "text-\(rawValue.dropFirst(2))px"
    case .xl2: "text-2xl"
    case .xl3: "text-3xl"
    case .xl4: "text-4xl"
    case .xl5: "text-5xl"
    default: "text-\(rawValue)"
    }
  }

  /// The system style whose Dynamic Type curve this one follows.
  var uiTextStyle: UIFont.TextStyle {
    switch self {
    case .px9, .px10, .px11: .caption2
    case .xs: .caption1
    case .px13: .footnote
    case .sm, .px15: .subheadline
    case .base: .body
    case .lg, .xl: .title3
    case .px22, .xl2: .title2
    case .px26, .px28, .xl3: .title1
    case .px32, .xl4, .xl5:
      #if os(tvOS)
        .title1
      #else
        .largeTitle
      #endif
    }
  }

  /// How much Dynamic Type grows this size at `dynamicType`.
  public func scale(at dynamicType: DynamicTypeSize) -> CGFloat {
    let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicType))
    let size = metrics.size
    return UIFontMetrics(forTextStyle: uiTextStyle).scaledValue(for: size, compatibleWith: traits) / size
  }

  /// The UIKit font at `dynamicType`.
  public func uiFont(_ weight: Font.Weight = .regular, dynamicType: DynamicTypeSize = .large) -> UIFont {
    RedHatText.uiFont(size: (metrics.size * scale(at: dynamicType)).rounded(), weight: weight)
  }
}

/// Letter spacing: the web's `tracking-tight` on headings.
public nonisolated enum Tracking: Sendable {
  case normal, tight

  var em: CGFloat {
    switch self {
    case .normal: 0
    case .tight: -0.025
    }
  }
}

private struct TextStyleModifier: ViewModifier {
  let size: TextSize
  let weight: Font.Weight
  let tracking: Tracking
  var lineHeight = true
  @Environment(\.dynamicTypeSize) private var dynamicType

  @ViewBuilder func body(content: Content) -> some View {
    let metrics = size.metrics
    let scale = size.scale(at: dynamicType)
    let font = RedHatText.uiFont(size: (metrics.size * scale).rounded(), weight: weight)
    let line = (metrics.line * scale).rounded()
    let styled = content.font(Font(font)).tracking(tracking.em * metrics.size * scale)
    // The web's line heights can be tighter than the font's own, which
    // `lineSpacing` can only add to; iOS 26 sets them exactly.
    if !lineHeight {
      styled
    } else if #available(iOS 26, tvOS 26, *) {
      styled.lineHeight(.exact(points: line))
    } else {
      styled.lineSpacing(max(0, line - font.lineHeight))
    }
  }
}

extension View {
  /// Sets text in the web's type scale: `text-sm font-medium` is
  /// `.textStyle(.sm, weight: .medium)`, and a heading's
  /// `text-xl font-semibold tracking-tight` is
  /// `.textStyle(.xl, weight: .semibold, tracking: .tight)`.
  public func textStyle(_ size: TextSize, weight: Font.Weight = .regular, tracking: Tracking = .normal) -> some View
  {
    modifier(TextStyleModifier(size: size, weight: weight, tracking: tracking))
  }

  /// The font alone, without the scale's line height, for text in a frame
  /// of fixed size, like a badge's.
  func textFont(_ size: TextSize, weight: Font.Weight = .regular) -> some View {
    modifier(TextStyleModifier(size: size, weight: weight, tracking: .normal, lineHeight: false))
  }
}
