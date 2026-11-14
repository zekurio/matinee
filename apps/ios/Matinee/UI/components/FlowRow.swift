import SwiftUI

/// Views side by side, wrapping onto more lines when they don't fit, each
/// line's views centered on each other: Compose's `FlowRow`, which Android's
/// banner facts, title badges, and search chips use. A view wider than a
/// line, as a long text at a large size, gets the line's width and wraps.
struct FlowRow: Layout {
  var spacing: CGFloat
  var lineSpacing: CGFloat

  /// `spacing` between views on a line, `lineSpacing` between lines, the same unless given.
  init(spacing: CGFloat = 8, lineSpacing: CGFloat? = nil) {
    self.spacing = spacing
    self.lineSpacing = lineSpacing ?? spacing
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let lines = arrange(subviews, width: proposal.width ?? .infinity)
    let width = lines.map(\.width).max() ?? 0
    let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
    return CGSize(width: proposal.width.map { min($0, width) } ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for (index, size) in line.items {
        subviews[index].place(
          at: CGPoint(x: x, y: y + (line.height - size.height) / 2), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var items: [(Int, CGSize)] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Line] {
    var lines: [Line] = []
    var line = Line()
    for (index, subview) in subviews.enumerated() {
      var size = subview.sizeThatFits(.unspecified)
      if size.width > width { size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
      if !line.items.isEmpty, line.width + spacing + size.width > width {
        lines.append(line)
        line = Line()
      }
      line.width += (line.items.isEmpty ? 0 : spacing) + size.width
      line.height = max(line.height, size.height)
      line.items.append((index, size))
    }
    if !line.items.isEmpty { lines.append(line) }
    return lines
  }
}
