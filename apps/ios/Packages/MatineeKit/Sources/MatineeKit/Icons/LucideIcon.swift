import SwiftUI

extension Image {
  /// A lucide icon, a template image that takes the foreground style.
  public init(_ icon: Lucide) {
    self.init(icon.name, bundle: .module)
  }
}

extension Lucide {
  /// Icons that point along the reading direction, mirrored in right-to-left layouts.
  var flipsForRightToLeft: Bool {
    [Lucide.arrowLeft, .chevronLeft, .chevronRight, .logIn, .logOut].contains(self)
  }
}

/// A lucide icon at `size` points, in `tint` or the foreground style. With
/// a `label` VoiceOver reads it; without one it's decoration and hidden.
/// It grows with Dynamic Type beside text that does, unless `scales` is off,
/// as for an icon inside a control of fixed size.
public struct LucideIcon: View {
  let icon: Lucide
  let label: String?
  let size: CGFloat
  let tint: Color?
  let scales: Bool
  @ScaledMetric private var scale: CGFloat = 1

  public init(_ icon: Lucide, label: String? = nil, size: CGFloat = 20, tint: Color? = nil, scales: Bool = true) {
    self.icon = icon
    self.label = label
    self.size = size
    self.tint = tint
    self.scales = scales
  }

  public var body: some View {
    let side = scales ? (size * scale).rounded() : size
    let image = Image(icon)
      .renderingMode(.template)
      .resizable()
      .interpolation(.high)
      .flipsForRightToLeftLayoutDirection(icon.flipsForRightToLeft)
      .frame(width: side, height: side)
    Group {
      // Without a tint it takes the foreground style it's in, as text does.
      if let tint { image.foregroundStyle(tint) } else { image }
    }
    .accessibilityLabel(label ?? "")
    .accessibilityHidden(label == nil)
  }
}
