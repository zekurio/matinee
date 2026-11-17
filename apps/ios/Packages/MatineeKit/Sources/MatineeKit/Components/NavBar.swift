import SwiftUI

/// The tabs at the top of a tablet's page, as the web's NavBar from `sm`
/// up: one frosted capsule, centered, of `leading` (the logo, to Home), a
/// hairline, the tabs with their names, a hairline, and `trailing`, as
/// search and the account, by their icons or pictures alone. The open tab
/// sits in a pill. The web's phone bar doesn't scale up to a tablet; this
/// is what the web shows there instead.
///
/// Every item is 44 tall, the web's `pointer:coarse` size, and keeps its
/// size at the accessibility text sizes, with a long press showing its
/// name. With a keyboard, ⌘1, ⌘2, … pick the tabs in order.
public struct NavBar<ID: Hashable, Leading: View>: View {
  let items: [TabBarItem<ID>]
  let trailing: [TabBarItem<ID>]
  let selection: ID?
  let onSelect: (ID) -> Void
  @ViewBuilder let leading: () -> Leading
  @Environment(\.palette) private var palette

  /// How far the capsule sits below the top safe area: the web's `top-4`.
  public static var inset: CGFloat { Space.s4 }

  public init(
    _ items: [TabBarItem<ID>], trailing: [TabBarItem<ID>] = [], selection: ID?, onSelect: @escaping (ID) -> Void,
    @ViewBuilder leading: @escaping () -> Leading
  ) {
    self.items = items
    self.trailing = trailing
    self.selection = selection
    self.onSelect = onSelect
    self.leading = leading
  }

  public var body: some View {
    HStack(spacing: 2) {
      leading()
      divider
      ForEach(items.indices, id: \.self) { index in
        item(items[index], labelled: true, shortcut: index)
      }
      if !trailing.isEmpty {
        divider
        ForEach(trailing.indices, id: \.self) { index in
          item(trailing[index], labelled: false, shortcut: items.count + index)
        }
      }
    }
    .padding(Space.s1)
    .background { glass }
    .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.1)) }
    .kitShadow(.bar)
    .motion(Motion.color, value: selection)
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    .accessibilityElement(children: .contain)
  }

  /// `bg-background/60 backdrop-blur-xl backdrop-saturate-150`.
  @ViewBuilder private var glass: some View {
    GlassCapsule()
  }

  private var divider: some View {
    Rectangle().fill(palette.foreground.opacity(0.1))
      .frame(width: 1, height: 20)
      .padding(.horizontal, Space.s1)
      .accessibilityHidden(true)
  }

  private func item(_ item: TabBarItem<ID>, labelled: Bool, shortcut: Int) -> some View {
    let selected = item.id == selection
    return Button {
      onSelect(item.id)
    } label: {
      HStack(spacing: Space.s1_5) {
        TabGlyph(item: item, selected: selected, size: 16)
        if labelled {
          Text(item.label).textStyle(.sm, weight: .medium).lineLimit(1).fixedSize()
        }
      }
      .foregroundStyle(selected ? palette.foreground : palette.foreground.opacity(0.7))
      .padding(.horizontal, labelled || item.picture != nil ? Space.s3 : 0)
      .frame(minWidth: TouchTarget, minHeight: TouchTarget)
      .background(selected ? palette.foreground.opacity(0.1) : .clear, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(KitPressStyle(shape: Capsule()))
    .modifier(TabShortcut(index: shortcut))
    .accessibilityLabel(item.label)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityShowsLargeContentViewer {
      if let icon = item.icon { Image(icon) }
      Text(item.label)
    }
  }
}

/// The NavBar's surface: the page's background at 60% over a blur, solid
/// under Reduce Transparency. The thinnest material, as the phone's tabs
/// have it, so the veil is what colors it rather than the material's tint.
private struct GlassCapsule: View {
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    if reduceTransparency {
      Capsule().fill(palette.popover)
    } else {
      Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, palette.scheme)
        .overlay(Capsule().fill(palette.background.opacity(0.6)))
    }
  }
}

extension View {
  /// Floats `bar` at the top of this page, centered, over the status bar's
  /// frost (`StatusBarFrost`), as a phone's page has it once it scrolls:
  /// the page blurred and veiled across the status bar, thinning out below
  /// it. The page's safe area starts below the bar, so content starts clear
  /// of it; art that bleeds to the top ignores the safe area and runs under
  /// it, or in a scroll view reaches up by `\.navBarClearance`. A page with
  /// art under the bar at rest says how strong the frost is with `navBarFrost`.
  public func navBar<ID: Hashable, Leading: View>(_ bar: NavBar<ID, Leading>) -> some View {
    modifier(NavBarModifier(bar: bar))
  }
}

/// `.navBar`, and `.tabBars` with the bar at the top. Without a bar it
/// draws nothing, takes no room, and gives no clearance, but is the same
/// view, so a page that trades its `NavBar` for a bottom bar stays the page
/// it was.
struct NavBarModifier<ID: Hashable, Leading: View>: ViewModifier {
  let bar: NavBar<ID, Leading>?
  /// The status bar's height, where the bar starts, and where it ends.
  @State private var statusBar: CGFloat = 0
  @State private var clearance: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .environment(\.navBarClearance, bar == nil ? 0 : clearance)
      // Over the page and under the bar. The bar doesn't know how far the
      // page under it has scrolled, so unless the page says otherwise
      // (`navBarFrost`), its frost is a scrolled page's, which at rest, over
      // only the page's background above its content, doesn't show.
      .overlayPreferenceValue(NavBarFrostKey.self, alignment: .top) { said in
        if bar != nil {
          let frost = said ?? .scrolled
          StatusBarFrost(bar: statusBar, veil: frost.veil, reducedVeil: frost.reducedVeil)
            .opacity(frost.opacity)
            .ignoresSafeArea(edges: [.top, .horizontal])
            .allowsHitTesting(false)
        }
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        if let bar {
          bar
            .padding(.horizontal, Space.s3)
            .padding(.top, NavBar<ID, Leading>.inset)
            .padding(.bottom, Space.s2)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: ClosedRange<CGFloat>.self) { proxy in
              let frame = proxy.frame(in: .global)
              return max(frame.minY, 0)...max(frame.maxY, frame.minY, 0)
            } action: { span in
              statusBar = span.lowerBound
              clearance = span.upperBound
            }
        }
      }
  }
}
