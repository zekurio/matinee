import Foundation
import SwiftUI
import UIKit

/*
 * Colors as the web has them (packages/ui/src/lib/theme-colors.ts and
 * theme-color-math.ts), ported from Android's ThemeColors.kt by way of the
 * app's Theme/ThemeColors.swift: a color per role, Matinee's light and dark
 * palettes (ThemePresets.gen.swift), and the server's accent on them.
 * Contrast follows WCAG relative luminance; mixing happens in OKLab, so
 * tinted ramps never pass through gray.
 */

public nonisolated enum Appearance: String, Sendable, CaseIterable {
  case light, dark
}

/// An opaque sRGB color, its channels 0–1. The math below works on these;
/// views read SwiftUI colors from `Palette`.
public nonisolated struct RGB: Hashable, Sendable {
  public var red: Double
  public var green: Double
  public var blue: Double

  public init(red: Double, green: Double, blue: Double) {
    self.red = red
    self.green = green
    self.blue = blue
  }

  /// `RGB(0x6D8CF5)`, as the generated presets write them.
  public init(_ hex: Int) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255)
  }

  /// `#rrggbb`, the one form themes store colors in; nil otherwise.
  public init?(hex value: String?) {
    guard var digits = value?.trimmingCharacters(in: .whitespaces) else { return nil }
    if digits.hasPrefix("#") { digits.removeFirst() }
    guard digits.count == 6, let number = Int(digits, radix: 16) else { return nil }
    self.init(number)
  }

  public var color: Color { Color(.sRGB, red: red, green: green, blue: blue) }
  public var uiColor: UIColor { UIColor(red: red, green: green, blue: blue, alpha: 1) }

  public func opacity(_ alpha: Double) -> Color { color.opacity(alpha) }

  public static let black = RGB(0x000000)
  public static let white = RGB(0xFFFFFF)
  static let softBlack = RGB(0x100E12)
  static let softWhite = RGB(0xFAF8FC)
}

/// A color per role, as the contract's `THEME_COLOR_ROLES` name them. Views
/// read these through `Palette`, which names them as globals.css does.
public nonisolated struct ThemeColors: Hashable, Sendable {
  public var background: RGB
  public var surface: RGB
  public var surfaceRaised: RGB
  public var surfaceSunken: RGB
  public var input: RGB
  public var border: RGB
  public var borderStrong: RGB
  public var borderEmphasis: RGB
  public var text: RGB
  public var textMuted: RGB
  public var textDim: RGB
  public var textFaint: RGB
  public var accent: RGB
  public var accentForeground: RGB
  public var accentHover: RGB
  public var accentActive: RGB
  public var accentDim: RGB
  public var success: RGB
  public var warning: RGB
  public var danger: RGB
  public var info: RGB
  public var live: RGB

  public init(
    background: RGB, surface: RGB, surfaceRaised: RGB, surfaceSunken: RGB, input: RGB, border: RGB,
    borderStrong: RGB, borderEmphasis: RGB, text: RGB, textMuted: RGB, textDim: RGB, textFaint: RGB,
    accent: RGB, accentForeground: RGB, accentHover: RGB, accentActive: RGB, accentDim: RGB,
    success: RGB, warning: RGB, danger: RGB, info: RGB, live: RGB
  ) {
    self.background = background
    self.surface = surface
    self.surfaceRaised = surfaceRaised
    self.surfaceSunken = surfaceSunken
    self.input = input
    self.border = border
    self.borderStrong = borderStrong
    self.borderEmphasis = borderEmphasis
    self.text = text
    self.textMuted = textMuted
    self.textDim = textDim
    self.textFaint = textFaint
    self.accent = accent
    self.accentForeground = accentForeground
    self.accentHover = accentHover
    self.accentActive = accentActive
    self.accentDim = accentDim
    self.success = success
    self.warning = warning
    self.danger = danger
    self.info = info
    self.live = live
  }

  /// Reads like a dark background: white text contrasts better than black.
  public var isDark: Bool { luminance(background) < 0.179 }

  /// Matinee's own palette for an appearance.
  public static func matinee(_ appearance: Appearance) -> ThemeColors {
    appearance == .light ? MATINEE_LIGHT : MATINEE_DARK
  }

  /// Replaces the accent with `seed`, adjusted for contrast against the
  /// background: the server's accent on the Matinee theme, which an admin
  /// picks without seeing every background it lands on.
  public func withAccent(_ seed: RGB) -> ThemeColors {
    let accent = fitAccent(seed, background)
    let family = accentFamily(accent, background)
    var colors = self
    colors.accent = accent
    colors.accentForeground = family.foreground
    colors.accentHover = family.hover
    colors.accentActive = family.active
    colors.accentDim = family.dim
    return colors
  }
}

/// sRGB channel, 0–1, to linear light.
nonisolated private func linear(_ channel: Double) -> Double {
  channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
}

public nonisolated func luminance(_ color: RGB) -> Double {
  0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)
}

public nonisolated func contrastRatio(_ first: RGB, _ second: RGB) -> Double {
  let a = luminance(first)
  let b = luminance(second)
  return (max(a, b) + 0.05) / (min(a, b) + 0.05)
}

nonisolated private struct Oklab {
  var l: Double
  var a: Double
  var b: Double

  init(l: Double, a: Double, b: Double) {
    self.l = l
    self.a = a
    self.b = b
  }

  init(_ color: RGB) {
    let r = linear(color.red)
    let g = linear(color.green)
    let b = linear(color.blue)
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    self.init(
      l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s)
  }

  var rgb: RGB {
    let l = pow(self.l + 0.3963377774 * a + 0.2158037573 * b, 3)
    let m = pow(self.l - 0.1055613458 * a - 0.0638541728 * b, 3)
    let s = pow(self.l - 0.0894841775 * a - 1.291485548 * b, 3)
    // Rounded to bytes, as the web does, so both get the same colors.
    func encode(_ channel: Double) -> Double {
      let value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * pow(channel, 1 / 2.4) - 0.055
      return (min(max(value, 0), 1) * 255).rounded() / 255
    }
    return RGB(
      red: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      green: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      blue: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s))
  }
}

/// Perceptual interpolation, `amount` of the way from `first` to `second`:
/// the web's `color-mix(in oklab, …)`.
public nonisolated func mix(_ first: RGB, _ second: RGB, _ amount: Double) -> RGB {
  let start = Oklab(first)
  let end = Oklab(second)
  return Oklab(
    l: start.l + (end.l - start.l) * amount,
    a: start.a + (end.a - start.a) * amount,
    b: start.b + (end.b - start.b) * amount
  ).rgb
}

/// Paints `foreground` at `alpha` over an opaque `background`.
nonisolated func composite(_ background: RGB, _ foreground: RGB, _ alpha: Double) -> RGB {
  RGB(
    red: background.red + (foreground.red - background.red) * alpha,
    green: background.green + (foreground.green - background.green) * alpha,
    blue: background.blue + (foreground.blue - background.blue) * alpha)
}

nonisolated private func contrastTarget(_ background: RGB) -> RGB {
  contrastRatio(.white, background) > contrastRatio(.black, background) ? .white : .black
}

nonisolated private func adjust(_ color: RGB, _ target: RGB, accepts: (RGB) -> Bool) -> RGB {
  if accepts(color) { return color }
  var low = 0.0
  var high = 1.0
  for _ in 0..<16 {
    let amount = (low + high) / 2
    if accepts(mix(color, target, amount)) { high = amount } else { low = amount }
  }
  return mix(color, target, high)
}

/// Lightens or darkens `color` just enough to reach the contrast target.
nonisolated private func ensureContrast(_ color: RGB, _ background: RGB, _ minimum: Double) -> RGB {
  adjust(color, contrastTarget(background)) { contrastRatio($0, background) >= minimum }
}

/// Like `ensureContrast`, but also readable on its own translucent tint.
nonisolated private func ensureTintedContrast(
  _ color: RGB, _ background: RGB, tintAlpha: Double, _ minimum: Double
) -> RGB {
  adjust(color, contrastTarget(background)) {
    contrastRatio($0, background) >= minimum
      && contrastRatio($0, composite(background, $0, tintAlpha)) >= minimum
  }
}

/// The largest tint opacity, up to `preferred`, that keeps `foreground` legible on it.
public nonisolated func contrastSafeTintAlpha(
  _ foreground: RGB, _ background: RGB, preferred: Double, minimum: Double = 4.55
) -> Double {
  func passes(_ alpha: Double) -> Bool {
    contrastRatio(foreground, composite(background, foreground, alpha)) >= minimum
  }
  if passes(preferred) { return preferred }
  var low = 0.0
  var high = preferred
  for _ in 0..<16 {
    let alpha = (low + high) / 2
    if passes(alpha) { low = alpha } else { high = alpha }
  }
  return low
}

nonisolated private func readableForeground(_ background: RGB) -> RGB {
  [RGB.softWhite, .softBlack, .white, .black].reduce(RGB.softWhite) { best, candidate in
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best
  }
}

/// How strong the accent's tint is on a background of each tone, as globals.css has it.
public nonisolated func softAlpha(dark: Bool) -> Double { dark ? 0.22 : 0.12 }

nonisolated private func fitAccent(_ seed: RGB, _ background: RGB) -> RGB {
  ensureTintedContrast(seed, background, tintAlpha: softAlpha(dark: luminance(background) < 0.179), 4.5)
}

nonisolated private struct AccentFamily {
  var foreground: RGB
  var hover: RGB
  var active: RGB
  var dim: RGB
}

nonisolated private func accentFamily(_ accent: RGB, _ background: RGB) -> AccentFamily {
  let dark = luminance(background) < 0.179
  let foreground = readableForeground(accent)
  return AccentFamily(
    foreground: foreground,
    hover: ensureContrast(mix(accent, dark ? .white : .black, dark ? 0.12 : 0.14), foreground, 4.5),
    active: ensureContrast(mix(accent, dark ? .black : .white, dark ? 0.14 : 0.12), foreground, 4.5),
    dim: mix(accent, background, 0.58))
}
