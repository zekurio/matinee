import SwiftUI
import UIKit

/// The web's `font-mono`: the system's monospaced face (`ui-monospace`,
/// SF Mono on Apple devices) at a size of the type scale, growing with
/// Dynamic Type as `textStyle` does. For what reads in columns or by the
/// character: a device code, a playback report, a log.
private struct MonoStyleModifier: ViewModifier {
  let size: TextSize
  let weight: Font.Weight
  /// Letter spacing in ems, as the web's `tracking-wider` is 0.05.
  let tracking: CGFloat
  @Environment(\.dynamicTypeSize) private var dynamicType

  func body(content: Content) -> some View {
    let metrics = size.metrics
    let scale = size.scale(at: dynamicType)
    let points = (metrics.size * scale).rounded()
    let font = UIFont.monospacedSystemFont(ofSize: points, weight: uiWeight)
    let line = (metrics.line * scale).rounded()
    content
      .font(Font(font))
      .tracking(tracking * points)
      .lineSpacing(max(0, line - font.lineHeight))
  }

  private var uiWeight: UIFont.Weight {
    switch weight {
    case .medium: .medium
    case .semibold: .semibold
    case .bold, .heavy, .black: .bold
    default: .regular
    }
  }
}

extension View {
  /// Sets text in the web's `font-mono` at a size of the type scale:
  /// `font-mono font-medium tracking-wider` is
  /// `.monoStyle(.sm, weight: .medium, tracking: 0.05)`.
  public func monoStyle(_ size: TextSize, weight: Font.Weight = .regular, tracking: CGFloat = 0) -> some View {
    modifier(MonoStyleModifier(size: size, weight: weight, tracking: tracking))
  }
}
