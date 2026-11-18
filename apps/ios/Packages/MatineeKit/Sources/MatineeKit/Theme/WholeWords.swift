import SwiftUI
import UIKit

extension View {
  /// Keeps every word of `text`, set as `.textStyle(size, weight:, tracking:)`,
  /// whole. SwiftUI breaks a word wider than the line in the middle
  /// ("Schauspi/el", a long German compound at an accessibility size); this
  /// steps the text down Dynamic Type sizes, as far as needed and no further,
  /// until its widest word fits. Goes after `.textStyle` on the `Text` that
  /// shows `text`, and gives it the line's full width, with `alignment` in it.
  public func keepsWordsWhole(
    _ text: String, _ size: TextSize, weight: Font.Weight = .regular, tracking: Tracking = .normal,
    alignment: Alignment = .leading
  ) -> some View {
    modifier(WholeWords(text: text, size: size, weight: weight, tracking: tracking, alignment: alignment))
  }
}

private struct WholeWords: ViewModifier {
  let text: String
  let size: TextSize
  let weight: Font.Weight
  let tracking: Tracking
  let alignment: Alignment
  @Environment(\.dynamicTypeSize) private var dynamicType
  @State private var width: CGFloat?

  func body(content: Content) -> some View {
    content
      .dynamicTypeSize(fitting)
      // The line's width, whatever size the text is set at, so a smaller size can't narrow it again.
      .frame(maxWidth: .infinity, alignment: alignment)
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
  }

  private var fitting: DynamicTypeSize {
    guard let width, width > 0 else { return dynamicType }
    var current = dynamicType
    while widest(at: current) > width, let smaller = DynamicTypeSize.allCases.last(where: { $0 < current }) {
      current = smaller
    }
    return current
  }

  /// The widest word's width at `dynamicType`, in the font and tracking `textStyle` sets there.
  private func widest(at dynamicType: DynamicTypeSize) -> CGFloat {
    let scale = size.scale(at: dynamicType)
    let attributes: [NSAttributedString.Key: Any] = [
      .font: RedHatText.uiFont(size: (size.metrics.size * scale).rounded(), weight: weight),
      .kern: tracking.em * size.metrics.size * scale,
    ]
    let words = text.split(whereSeparator: \.isWhitespace)
    return words.map { ceil(NSAttributedString(string: String($0), attributes: attributes).size().width) }.max() ?? 0
  }
}
