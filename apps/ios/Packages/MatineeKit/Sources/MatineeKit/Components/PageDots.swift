import SwiftUI

/// Where a row of pages rests, as the web's carousel dots: a dot for each
/// place it can rest at, the current one drawn long. It only shows; the
/// row itself is what's swiped, and each page tells VoiceOver where it is,
/// so the dots are hidden from it.
///
///     PageDots(count: stops, current: stop)
///
/// `tint` is the dots' color, the text's by default, the current one solid
/// and the others faint.
public struct PageDots: View {
  let count: Int
  let current: Int
  let tint: Color?
  @Environment(\.palette) private var palette

  public init(count: Int, current: Int, tint: Color? = nil) {
    self.count = count
    self.current = current
    self.tint = tint
  }

  public var body: some View {
    let color = tint ?? palette.foreground
    HStack(spacing: Space.s1_5) {
      ForEach(0..<max(count, 0), id: \.self) { index in
        let on = index == current
        Capsule()
          .fill(on ? color : color.opacity(0.25))
          .frame(width: on ? Space.s5 : Space.s1_5, height: Space.s1_5)
      }
    }
    .motion(Motion.move, value: current)
    .accessibilityHidden(true)
  }
}
