import SwiftUI

/// Which edge of what opened it a menu lines up with.
public enum MenuAlignment: Sendable {
  case leading, trailing
}

extension View {
  /// A menu that opens from this view, as the web's DropdownMenu: the
  /// popover's glass, `rounded-xl`, a hairline ring and a deep shadow, at
  /// least `min-w-40` wide, below this view or above it when there's more
  /// room there. `items` are `MenuItem`s, `MenuLabel`s, and
  /// `MenuSeparator`s; a tap on an item closes the menu and then runs it.
  /// `matchWidth` makes it as wide as this view, as a select's list is.
  ///
  ///     RoundIconButton(.ellipsis, label: "More") { open = true }
  ///       .dropdownMenu(isPresented: $open, align: .trailing) {
  ///         MenuItem("Refresh", icon: .refreshCw) { refresh() }
  ///         MenuSeparator()
  ///         MenuItem("Delete", icon: .trash, destructive: true) { confirm = true }
  ///       }
  ///
  /// For the actions of a title or file, which the web shows as a sheet on
  /// phones, use `matineeSheet` with `SheetItem`s instead.
  public func dropdownMenu<Items: View>(
    isPresented: Binding<Bool>, align: MenuAlignment = .leading, matchWidth: Bool = false,
    @ViewBuilder items: @escaping () -> Items
  ) -> some View {
    modifier(DropdownMenuModifier(isPresented: isPresented, align: align, matchWidth: matchWidth, items: items))
  }
}

/// Where the menu's opener is on screen. A reference, so the menu, which
/// lives in its own presentation, follows the opener as it's measured or moves.
@Observable
final class MenuAnchor {
  var frame = CGRect.zero
}

private struct DropdownMenuModifier<Items: View>: ViewModifier {
  @Binding var isPresented: Bool
  let align: MenuAlignment
  let matchWidth: Bool
  @ViewBuilder let items: () -> Items
  @State private var anchor = MenuAnchor()

  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { anchor.frame = $0 }
      .kitOverlay(isPresented: $isPresented) { visible in
        MenuLayer(anchorBox: anchor, visible: visible, align: align, matchWidth: matchWidth, items: items)
      }
  }
}

private struct MenuLayer<Items: View>: View {
  let anchorBox: MenuAnchor
  let visible: Bool
  let align: MenuAlignment
  let matchWidth: Bool
  @ViewBuilder let items: () -> Items
  @Environment(\.overlayDismiss) private var dismiss
  @Environment(\.layoutDirection) private var direction
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var size = CGSize.zero

  private var anchor: CGRect { anchorBox.frame }

  var body: some View {
    ZStack(alignment: .topLeading) {
      // Not dimmed, as a menu isn't: a tap anywhere outside closes it.
      Color.clear.contentShape(Rectangle()).ignoresSafeArea()
        .onTapGesture { dismiss() }
        .accessibilityHidden(true)
      GeometryReader { proxy in
        let safe = proxy.frame(in: .global).insetBy(dx: 8, dy: 8)
        let placement = place(in: safe)
        MenuPanel(maxHeight: placement.maxHeight, width: matchWidth ? anchor.width : nil, items: items)
          .environment(\.layoutDirection, direction)
          .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
          .scaleEffect(visible || reduceMotion ? 1 : 0.95, anchor: placement.below ? .top : .bottom)
          .offset(y: visible || reduceMotion ? 0 : (placement.below ? -4 : 4))
          .opacity(visible && size != .zero && anchor != .zero ? 1 : 0)
          .offset(x: placement.origin.x - proxy.frame(in: .global).minX, y: placement.origin.y - proxy.frame(in: .global).minY)
      }
      // Laid out left to right, in the window's coordinates; the panel itself keeps the layout's direction.
      .environment(\.layoutDirection, .leftToRight)
    }
    .closesOnExit { dismiss() }
  }

  private func place(in safe: CGRect) -> (origin: CGPoint, below: Bool, maxHeight: CGFloat) {
    let gap: CGFloat = 4
    let roomBelow = safe.maxY - anchor.maxY - gap
    let roomAbove = anchor.minY - safe.minY - gap
    let below = size.height <= roomBelow || roomBelow >= roomAbove
    let maxHeight = max(120, below ? roomBelow : roomAbove)
    let height = min(size.height, maxHeight)
    var y = below ? anchor.maxY + gap : anchor.minY - gap - height
    y = min(max(y, safe.minY), max(safe.minY, safe.maxY - height))
    let startsLeft = (align == .leading) == (direction == .leftToRight)
    var x = startsLeft ? anchor.minX : anchor.maxX - size.width
    x = min(max(x, safe.minX), max(safe.minX, safe.maxX - size.width))
    return (CGPoint(x: x, y: y), below, maxHeight)
  }
}

/// The menu's panel: its items in a column, scrolling when they don't fit.
private struct MenuPanel<Items: View>: View {
  let maxHeight: CGFloat
  let width: CGFloat?
  @ViewBuilder let items: () -> Items
  @Environment(\.palette) private var palette

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    ViewThatFits(in: .vertical) {
      column
      ScrollView { column }.scrollBounceBehavior(.basedOnSize)
    }
    .modifier(ClampSize(fixedWidth: width, minimum: 176, maximum: 320, maxHeight: maxHeight))
    .glassBackground(in: shape)
    .overlay { shape.strokeBorder(palette.hairline) }
    .clipShape(shape)
    .kitShadow(.menu)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
  }

  private var column: some View {
    VStack(alignment: .leading, spacing: 0) { items() }.padding(4)
  }
}

/// As wide as its content wants, between `minimum` and `maximum`, or
/// exactly `fixedWidth`; as tall as it wants, up to `maxHeight`.
private struct ClampSize: ViewModifier {
  let fixedWidth: CGFloat?
  let minimum: CGFloat
  let maximum: CGFloat
  let maxHeight: CGFloat

  func body(content: Content) -> some View {
    ClampedLayout(fixedWidth: fixedWidth, minimum: minimum, maximum: maximum, maxHeight: maxHeight) { content }
  }
}

private struct ClampedLayout: Layout {
  let fixedWidth: CGFloat?
  let minimum: CGFloat
  let maximum: CGFloat
  let maxHeight: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let child = subviews.first else { return .zero }
    let width = fixedWidth ?? min(max(child.sizeThatFits(.unspecified).width, minimum), maximum)
    let ideal = child.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
    return CGSize(width: width, height: min(ideal, maxHeight))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
  }
}

/// A row in a menu, as the web's DropdownMenuItem: `rounded-md`,
/// `text-sm`, an optional icon before it, and a check after it when it's
/// `selected`. `destructive` paints it in the danger color. A tap closes
/// the menu, then runs `action`.
public struct MenuItem: View {
  let label: String
  let icon: Lucide?
  let selected: Bool
  let destructive: Bool
  let action: @MainActor () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.overlayDismiss) private var dismiss

  public init(
    _ label: String, icon: Lucide? = nil, selected: Bool = false, destructive: Bool = false,
    action: @escaping @MainActor () -> Void
  ) {
    self.label = label
    self.icon = icon
    self.selected = selected
    self.destructive = destructive
    self.action = action
  }

  public var body: some View {
    let color = destructive ? palette.destructive : palette.foreground
    Button {
      dismiss(then: action)
    } label: {
      HStack(spacing: 8) {
        if let icon { LucideIcon(icon, size: 16, tint: color) }
        Text(label)
          .textStyle(.sm, weight: selected ? .medium : .regular)
          .foregroundStyle(color)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        if selected { LucideIcon(.check, size: 16, tint: color).padding(.leading, 16) }
      }
      // px-2, and py-2.5 for a finger.
      .padding(.horizontal, 8)
      .padding(.vertical, 10)
      .frame(minHeight: 40)
      .contentShape(Rectangle())
    }
    .buttonStyle(
      KitPressStyle(shape: RoundedRectangle.kit(Radius.md), washColor: destructive ? palette.destructive : nil, ring: .inside)
    )
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// A group's name in a menu: `text-xs font-medium` muted, as the web's DropdownMenuLabel.
public struct MenuLabel: View {
  let text: String
  @Environment(\.palette) private var palette

  public init(_ text: String) { self.text = text }

  public var body: some View {
    Text(text)
      .textStyle(.xs, weight: .medium)
      .foregroundStyle(palette.mutedForeground)
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
      .accessibilityAddTraits(.isHeader)
  }
}

/// A line between groups in a menu, edge to edge: `-mx-1 my-1 bg-foreground/10`.
public struct MenuSeparator: View {
  @Environment(\.palette) private var palette

  public init() {}

  public var body: some View {
    Separator(color: palette.foreground.opacity(0.1)).padding(.horizontal, -4).padding(.vertical, 4)
  }
}
