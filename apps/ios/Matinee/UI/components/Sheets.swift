import SwiftUI

/*
 * Sheets as Actions.kt and WatchedAt.kt draw them, and the rows they and
 * many settings sheets share. On iOS a sheet is the system's, with its
 * grabber and detents, on the theme's raised surface.
 */

extension View {
  /// A sheet's look: the raised surface rather than the system's gray, its
  /// grabber, and `detents`, as iOS sheets have them.
  func matineeSheet(_ detents: Set<PresentationDetent> = [.medium, .large]) -> some View {
    modifier(SheetLook(detents: detents))
  }
}

private struct SheetLook: ViewModifier {
  let detents: Set<PresentationDetent>
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .presentationBackground(palette.raised)
      .presentationDetents(detents)
      .presentationDragIndicator(.visible)
      .presentationCornerRadius(20)
  }
}

/// A sheet's heading: what it's for, and under it where that belongs.
struct SheetHeader: View {
  let title: String
  var subtitle: String?
  @Environment(\.palette) private var palette

  init(_ title: String, _ subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text(title).textStyle(.titleMedium).lineLimit(2).accessibilityAddTraits(.isHeader)
        if let subtitle {
          Text(subtitle).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
        }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 8)
      Rectangle().fill(palette.border).frame(height: 1).padding(.vertical, 6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A row in a sheet menu: an icon and a label.
struct SheetItem: View {
  let icon: Lucide
  let label: String
  var destructive = false
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ icon: Lucide, _ label: String, destructive: Bool = false, action: @escaping () -> Void) {
    self.icon = icon
    self.label = label
    self.destructive = destructive
    self.action = action
  }

  var body: some View {
    let color = destructive ? palette.danger : palette.foreground
    Button(action: action) {
      HStack(spacing: 16) {
        LucideIcon(icon, tint: destructive ? color : palette.muted)
        Text(label).textStyle(.bodyLarge).foregroundStyle(color)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 14)
      .frame(minHeight: MinTouch)
      .contentShape(Rectangle())
    }
    .buttonStyle(RowPress())
  }
}

/// A list row's press: the row's color deepens under the finger, as iOS lists do.
struct RowPress: ButtonStyle {
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(enabled ? 1 : 0.5)
      .background(palette.foreground.opacity(configuration.isPressed ? 0.08 : 0))
  }
}
