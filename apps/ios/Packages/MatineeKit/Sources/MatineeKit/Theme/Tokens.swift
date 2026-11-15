import SwiftUI

/*
 * The web's measures. A size outside these is a size the web doesn't draw;
 * add a token here, after the web, rather than a number in a screen.
 */

/// The web's radius scale: globals.css sets `--radius` to 0.625rem and
/// steps the others from it. Corners are circular, as the web's and
/// Android's are, not iOS's continuous curve, so the three clients match.
public enum Radius {
  /// `rounded-sm`: small boxes inside a card, a poster.
  public static let sm: CGFloat = 6
  /// `rounded-md`: a menu's rows, a calendar day.
  public static let md: CGFloat = 8
  /// `rounded-lg`: buttons, fields, icon tiles.
  public static let lg: CGFloat = 10
  /// `rounded-xl`: dialogs, menus, lists, toasts, the top of a sheet.
  public static let xl: CGFloat = 14
  /// `rounded-2xl`: large panels.
  public static let xl2: CGFloat = 18
}

extension RoundedRectangle {
  /// A shape of the radius scale: `.kit(Radius.lg)`.
  public static func kit(_ radius: CGFloat) -> RoundedRectangle {
    RoundedRectangle(cornerRadius: radius, style: .circular)
  }
}

/// Tailwind's spacing scale, 4 points a step: `gap-3` is `Space.s3`,
/// `px-2.5` is `Space.s2_5`.
public enum Space {
  public static let s0_5: CGFloat = 2
  public static let s1: CGFloat = 4
  public static let s1_5: CGFloat = 6
  public static let s2: CGFloat = 8
  public static let s2_5: CGFloat = 10
  public static let s3: CGFloat = 12
  public static let s3_5: CGFloat = 14
  public static let s4: CGFloat = 16
  public static let s5: CGFloat = 20
  public static let s6: CGFloat = 24
  public static let s7: CGFloat = 28
  public static let s8: CGFloat = 32
  public static let s10: CGFloat = 40
  public static let s12: CGFloat = 48
  public static let s16: CGFloat = 64

  /// The page's side margin on phones, the web's `px-4`.
  public static let gutter: CGFloat = 16
  /// Between a page's sections, the web's `gap-8` in settings.
  public static let section: CGFloat = 32
}

/// What a finger needs: everything pressable takes at least this much
/// room, however small it's drawn, as the web's `[@media(pointer:coarse)]:h-11`.
public let TouchTarget: CGFloat = 44

/// The web's shadows, for what floats.
public struct KitShadow: Sendable {
  public let color: Color
  public let radius: CGFloat
  public let y: CGFloat

  /// `shadow-xl shadow-black/40`: menus and selects.
  public static let menu = KitShadow(color: .black.opacity(0.4), radius: 14, y: 10)
  /// `shadow-2xl`: dialogs.
  public static let dialog = KitShadow(color: .black.opacity(0.45), radius: 28, y: 18)
  /// Sonner's toast: `0 12px 32px -8px rgb(0 0 0 / 0.6)`.
  public static let toast = KitShadow(color: .black.opacity(0.45), radius: 14, y: 10)
  /// The tab bar's: `0 10px 32px -6px rgb(0 0 0 / 0.55)`.
  public static let bar = KitShadow(color: .black.opacity(0.4), radius: 14, y: 8)
  /// `shadow-sm`: a raised segment, a chip over a picture.
  public static let small = KitShadow(color: .black.opacity(0.12), radius: 1.5, y: 1)
}

extension View {
  /// One of the web's shadows. Light themes get a lighter one, as black
  /// at the dark theme's strength reads as dirt on white.
  public func kitShadow(_ shadow: KitShadow) -> some View {
    modifier(ShadowModifier(shadow: shadow))
  }
}

private struct ShadowModifier: ViewModifier {
  let shadow: KitShadow
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content.shadow(
      color: palette.isDark ? shadow.color : shadow.color.opacity(0.35), radius: shadow.radius, y: shadow.y)
  }
}
