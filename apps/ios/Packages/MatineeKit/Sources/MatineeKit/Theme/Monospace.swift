import SwiftUI
import UIKit

/*
 * The web's `font-mono`, which on Apple's systems is ui-monospace, SF
 * Mono: for what's read character by character, such as a code to type
 * on another device, where Red Hat Text's letters could be taken for
 * each other.
 */

extension Tracking {
  /// `tracking-wider`, 0.05em: the web's spacing for a code.
  public static let codeEm: CGFloat = 0.05
}

extension View {
  /// Monospaced text at one of the web's sizes, as `font-mono` sets it,
  /// growing with Dynamic Type as `.textStyle` does. `tracking` is in ems;
  /// a code takes `Tracking.codeEm`, the web's `tracking-wider`.
  public func monoTextStyle(_ size: TextSize, weight: Font.Weight = .regular, tracking: CGFloat = 0) -> some View {
    modifier(MonoTextModifier(size: size, weight: weight, tracking: tracking))
  }
}

private struct MonoTextModifier: ViewModifier {
  let size: TextSize
  let weight: Font.Weight
  let tracking: CGFloat
  @Environment(\.dynamicTypeSize) private var dynamicType

  func body(content: Content) -> some View {
    let points = (size.metrics.size * size.scale(at: dynamicType)).rounded()
    content
      .font(Font(UIFont.monospacedSystemFont(ofSize: points, weight: uiWeight)))
      .tracking(tracking * points)
  }

  private var uiWeight: UIFont.Weight {
    switch weight {
    case .ultraLight, .thin, .light: .light
    case .medium: .medium
    case .semibold: .semibold
    case .bold, .heavy, .black: .bold
    default: .regular
    }
  }
}
