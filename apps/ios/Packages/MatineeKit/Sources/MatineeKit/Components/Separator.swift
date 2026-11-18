import SwiftUI

/// A hairline, as the web's Separator: 1 point of `--border`, across or,
/// `vertical`, down.
public struct Separator: View {
  let vertical: Bool
  let color: Color?
  @Environment(\.palette) private var palette

  public init(vertical: Bool = false, color: Color? = nil) {
    self.vertical = vertical
    self.color = color
  }

  public var body: some View {
    Rectangle()
      .fill(color ?? palette.border)
      .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
      .accessibilityHidden(true)
  }
}
