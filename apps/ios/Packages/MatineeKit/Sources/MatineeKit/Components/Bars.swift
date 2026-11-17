import SwiftUI

#if os(iOS)
  import UIKit
#endif

/// What sits at the start of a `TopBar`.
public enum TopBarLeading: Sendable {
  /// Back to where the page was opened from: `arrow-left`.
  case back
  /// Closes what the page is in, as the settings sheet's corner `x`.
  case close
  case none
}

/// The top of a page opened from a tab, as Android's `TopBar`: Back, the
/// page's name after it in `pageTitleStyle()`, and what the page can do, on
/// the page's background, 64 tall. It's the only way a pushed page shows
/// its name, so every page's title is the same size in the same place, as
/// on Android; there is no centered or smaller variant. Back does
/// `onLeading`, or dismisses the page. With `onHome`, a house beside Back
/// goes to the app's first page, as Android's bar has it.
public struct TopBar<Actions: View>: View {
  let title: String?
  let leading: TopBarLeading
  let onLeading: (() -> Void)?
  let onHome: (() -> Void)?
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale

  public init(
    _ title: String?, leading: TopBarLeading = .back, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil, @ViewBuilder actions: @escaping () -> Actions
  ) {
    self.title = title
    self.leading = leading
    self.onLeading = onLeading
    self.onHome = onHome
    self.actions = actions
  }

  public var body: some View {
    HStack(spacing: 0) {
      switch leading {
      case .back, .close:
        RoundIconButton(
          leading == .back ? .arrowLeft : .x,
          label: leading == .back ? KitText.back(locale) : KitText.close(locale), look: .ghost, size: 48,
          iconSize: leading == .back ? 24 : 22
        ) { (onLeading ?? { dismiss() })() }
      case .none: EmptyView()
      }
      if let onHome {
        RoundIconButton(.house, label: KitText.home(locale), look: .ghost, size: 48, iconSize: 22, action: onHome)
      }
      if let title {
        Text(title)
          .pageTitleStyle()
          .lineLimit(1)
          .padding(.leading, leading == .none ? Space.gutter - 4 : 4)
          .accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 0)
      HStack(spacing: 0) { actions() }
    }
    .padding(.horizontal, 4)
    .frame(height: 64)
    .foregroundStyle(palette.foreground)
    .background(palette.background.ignoresSafeArea(edges: .top))
  }
}

extension TopBar where Actions == EmptyView {
  public init(
    _ title: String?, leading: TopBarLeading = .back, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil
  ) {
    self.init(title, leading: leading, onLeading: onLeading, onHome: onHome) { EmptyView() }
  }
}

extension View {
  /// Gives a page in a `NavigationStack` the kit's `TopBar` in place of the
  /// system's navigation bar, which it hides, while keeping the edge swipe
  /// back that hiding it would otherwise take away. The page scrolls under
  /// nothing: the bar stays put above it.
  ///
  /// `hidden` leaves the bar out, and the page is then as with
  /// `.hidesSystemNavigationBar()`, drawing its own top. The page stays the
  /// same view as it changes, so a tab's first page whose top depends on
  /// the shell, as Downloads' name in a bar on a phone and in its own
  /// heading on an iPad, keeps its state and its scroll position when the
  /// shell changes under it.
  public func topBar<Actions: View>(
    _ title: String?, leading: TopBarLeading = .back, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil, hidden: Bool = false, @ViewBuilder actions: @escaping () -> Actions
  ) -> some View {
    self
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        .background(SwipeBack())
      #endif
      .safeAreaInset(edge: .top, spacing: 0) {
        if !hidden {
          TopBar(title, leading: leading, onLeading: onLeading, onHome: onHome, actions: actions)
        }
      }
      .pageBackground()
  }

  public func topBar(
    _ title: String?, leading: TopBarLeading = .back, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil, hidden: Bool = false
  ) -> some View {
    topBar(title, leading: leading, onLeading: onLeading, onHome: onHome, hidden: hidden) { EmptyView() }
  }

  /// Hides the system's navigation bar on a page that draws its own top,
  /// like one with Back floating over art, and keeps the edge swipe back.
  public func hidesSystemNavigationBar() -> some View {
    self
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        .background(SwipeBack())
      #endif
      .pageBackground()
  }

  /// The page's own background, `--background`, behind a page in a
  /// `NavigationStack`, whose container would otherwise show the system's.
  /// `topBar` and `hidesSystemNavigationBar` include it.
  public func pageBackground() -> some View {
    modifier(PageBackground())
  }
}

private struct PageBackground: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .background { palette.background.ignoresSafeArea() }
      #if os(iOS)
        .containerBackground(palette.background, for: .navigation)
      #endif
  }
}

#if os(iOS)
  /// UIKit stops the edge swipe back once the navigation bar is hidden,
  /// since the bar is the gesture's delegate. This hands it a delegate that
  /// allows it whenever there's a page to go back to.
  private struct SwipeBack: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController {
      override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        restore()
      }

      override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // UIKit sets the gestures up again as the page settles; after that, ours.
        restore()
      }

      private func restore() {
        guard let navigation = navigationController else { return }
        let delegate = SwipeBackDelegate.of(navigation)
        var gestures = [navigation.interactivePopGestureRecognizer]
        if #available(iOS 26, *) { gestures.append(navigation.interactiveContentPopGestureRecognizer) }
        for case let gesture? in gestures {
          if gesture.delegate !== delegate { gesture.delegate = delegate }
          gesture.isEnabled = true
        }
      }
    }
  }

  private final class SwipeBackDelegate: NSObject, UIGestureRecognizerDelegate {
    weak var navigation: UINavigationController?
    nonisolated(unsafe) private static var key: UInt8 = 0

    static func of(_ navigation: UINavigationController) -> SwipeBackDelegate {
      if let existing = objc_getAssociatedObject(navigation, &key) as? SwipeBackDelegate { return existing }
      let delegate = SwipeBackDelegate()
      delegate.navigation = navigation
      objc_setAssociatedObject(navigation, &key, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
      return delegate
    }

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
      (navigation?.viewControllers.count ?? 0) > 1 && navigation?.transitionCoordinator == nil
    }
  }
#endif

/// A destination in the tab bars: its name, which the `BottomBar` shows
/// under its icon and the `NavBar` beside it, and which VoiceOver reads,
/// and a lucide icon or, `picture`, a view of its own, as the tablet's
/// account.
public struct TabBarItem<ID: Hashable> {
  let id: ID
  let label: String
  let icon: Lucide?
  let picture: ((Bool) -> AnyView)?

  public init(_ id: ID, label: String, icon: Lucide) {
    self.id = id
    self.label = label
    self.icon = icon
    self.picture = nil
  }

  /// `picture` gets whether the item is the open one.
  public init<Picture: View>(_ id: ID, label: String, @ViewBuilder picture: @escaping (Bool) -> Picture) {
    self.id = id
    self.label = label
    self.icon = nil
    self.picture = { AnyView(picture($0)) }
  }
}

/// How much the bottom bar takes from the bottom of the screen, for what
/// must clear it, as toasts.
struct BottomBarHeightKey: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// The tabs along the bottom of a tab's first page, after Findroid's phone
/// app and iOS's own tab bar: the full width, each tab its icon over its
/// name, both always shown. The open tab's icon sits in a pill of the
/// text's color at 10%, the kit's selected look, and its name turns from
/// muted to the text's color. The bar is frosted, the page blurred under
/// the background at 80%, with a line of `--border` along its top, and it
/// runs on down under the home indicator. Solid under Reduce Transparency.
///
/// Its names grow with Dynamic Type up to `xxLarge` and keep that size from
/// there, as iOS's tab bar keeps its own; a long press on a tab at the
/// accessibility sizes shows its name large instead. With a keyboard, ⌘1,
/// ⌘2, … pick the tabs in order. VoiceOver reads it as a tab bar: each tab
/// with its place among them, and which is open.
public struct BottomBar<ID: Hashable>: View {
  let items: [TabBarItem<ID>]
  let selection: ID?
  let onSelect: (ID) -> Void
  @State private var bottomInset: CGFloat = 0
  @Environment(\.palette) private var palette
  @Environment(\.displayScale) private var displayScale
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  /// What the bar takes above the bottom safe area at the default text
  /// size, what a toast rises over.
  public static var clearance: CGFloat { height }
  /// The bar above the bottom safe area: 6 over the pill, the pill, 2, the
  /// name's 16-point line, and 4 under it.
  static var height: CGFloat { Space.s1_5 + pill.height + Space.s0_5 + 16 + Space.s1 }
  /// The open tab's pill behind its icon, 56 by 32.
  static var pill: CGSize { CGSize(width: Space.s14, height: Space.s8) }
  /// How wide the tabs spread before they gather in the middle, as in a
  /// landscape phone's bar.
  static var spread: CGFloat { 480 }

  public init(_ items: [TabBarItem<ID>], selection: ID?, onSelect: @escaping (ID) -> Void) {
    self.items = items
    self.selection = selection
    self.onSelect = onSelect
  }

  public var body: some View {
    HStack(spacing: 0) {
      ForEach(items.indices, id: \.self) { index in
        tab(items[index], shortcut: index)
      }
    }
    .frame(maxWidth: Self.spread)
    .padding(.horizontal, Space.s2)
    // A phone without a home indicator gets the room under the names that the indicator's inset gives the rest.
    .padding(.bottom, bottomInset > 0 ? 0 : Space.s1_5)
    .frame(maxWidth: .infinity)
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { bottomInset = $0 }
    .background { surface.ignoresSafeArea(edges: .bottom) }
    .overlay(alignment: .top) {
      Rectangle().fill(palette.border).frame(height: 1 / displayScale).accessibilityHidden(true)
    }
    .motion(Motion.move, value: selection)
    .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isTabBar)
  }

  @ViewBuilder private var surface: some View {
    if reduceTransparency {
      palette.background
    } else {
      // The thinnest material, which blurs as the others do but tints
      // least, so the veil over it is what colors it.
      Rectangle().fill(.ultraThinMaterial).environment(\.colorScheme, palette.scheme)
        .overlay(palette.background.opacity(0.8))
    }
  }

  private func tab(_ item: TabBarItem<ID>, shortcut: Int) -> some View {
    let selected = item.id == selection
    return Button {
      onSelect(item.id)
    } label: {
      VStack(spacing: Space.s0_5) {
        TabGlyph(item: item, selected: selected, size: 22)
          .frame(width: Self.pill.width, height: Self.pill.height)
          .background {
            // Grows out from the icon as the tab opens, as Material's indicator does; fades under Reduce Motion.
            Capsule().fill(palette.foreground.opacity(0.1))
              .scaleEffect(x: selected ? 1 : 0.5)
              .opacity(selected ? 1 : 0)
          }
        // Its own width: a third of the narrowest phone holds the longest name at the largest size the
        // bar takes, and a name squeezed by a layout pass mid-launch would stay clipped.
        Text(item.label)
          .textStyle(.xs, weight: .medium)
          .lineLimit(1)
          .fixedSize()
      }
      .foregroundStyle(selected ? palette.foreground : palette.mutedForeground)
      .padding(.top, Space.s1_5)
      .padding(.bottom, Space.s1)
      .frame(maxWidth: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(KitPressStyle(shape: Capsule(), wash: false, pressScale: 0.92))
    .modifier(TabShortcut(index: shortcut))
    .accessibilityLabel(item.label)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityShowsLargeContentViewer {
      if let icon = item.icon { Image(icon) }
      Text(item.label)
    }
  }
}

/// A tab's icon, or its picture.
struct TabGlyph<ID: Hashable>: View {
  let item: TabBarItem<ID>
  let selected: Bool
  let size: CGFloat

  var body: some View {
    if let icon = item.icon {
      LucideIcon(icon, size: size, scales: false)
    } else if let picture = item.picture {
      picture(selected)
    }
  }
}

/// ⌘1 to ⌘9 for the first nine tabs.
struct TabShortcut: ViewModifier {
  let index: Int

  func body(content: Content) -> some View {
    #if os(iOS)
      if index < 9, let digit = "\(index + 1)".first {
        content.keyboardShortcut(KeyEquivalent(digit), modifiers: .command)
      } else {
        content
      }
    #else
      content
    #endif
  }
}

extension View {
  /// Puts `bar` along the bottom of this page, which scrolls on under its
  /// frost and ends clear of it. It steps aside while the keyboard is up.
  public func bottomBar<ID: Hashable>(_ bar: BottomBar<ID>) -> some View {
    modifier(BottomBarModifier(bar: bar))
  }
}

/// `.bottomBar`, and `.tabBars` with the bar at the bottom. Without a bar
/// it draws nothing and takes no room, but is the same view, so a page that
/// trades its bottom bar for a `NavBar` stays the page it was.
struct BottomBarModifier<ID: Hashable>: ViewModifier {
  let bar: BottomBar<ID>?
  @State private var keyboard = false
  @State private var height: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if let bar, !keyboard {
          bar
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .transition(.opacity)
        }
      }
      .preference(key: BottomBarHeightKey.self, value: bar == nil || keyboard ? 0 : height)
      #if os(iOS)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
          keyboard = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
          keyboard = false
        }
      #endif
  }
}

/// The frost under the status bar behind a `NavBar`, the tablet's tabs,
/// and nowhere else: a phone's pages have nothing over the status bar. The
/// page behind it blurred and veiled in the page's color, evenly across the
/// whole bar, so its clock and icons sit on one shade rather than half on
/// shade and half on bare art. Below the bar it thins out over `feather`: the blur
/// eases off as the veil fades, so the page comes back sharp gradually
/// rather than a blurred band ending on a line. `bar` is the status bar's
/// height; the frost is `bar + feather` tall, from the screen's top.
///
/// The page says how strong, through `navBarFrost`: `veil` over the blur,
/// and `reducedVeil` under Reduce Transparency, where nothing is blurred and
/// the veil alone, a stronger one, keeps the bar readable.
struct StatusBarFrost: View {
  let bar: CGFloat
  let veil: Double
  let reducedVeil: Double
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  /// How far below the bar the frost thins out: Android's 48 dp.
  static var feather: CGFloat { 48 }

  init(bar: CGFloat, veil: Double, reducedVeil: Double) {
    self.bar = bar
    self.veil = veil
    self.reducedVeil = reducedVeil
  }

  var body: some View {
    let total = max(bar, 0) + Self.feather
    let edge = max(bar, 0) / total
    ZStack {
      if !reduceTransparency {
        // iOS's materials can't take a radius, nor blur by degrees, so
        // the blur's ease is drawn as how much of it shows.
        Rectangle().fill(.ultraThinMaterial).environment(\.colorScheme, palette.scheme)
          .mask(Self.gradient(Self.blurMask(edge: edge)))
      }
      Rectangle().fill(palette.background.opacity(reduceTransparency ? reducedVeil : veil))
        .mask(Self.gradient(Self.veilMask(edge: edge)))
    }
    .frame(height: total)
    .frame(maxWidth: .infinity)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private static func gradient(_ stops: [(location: Double, opacity: Double)]) -> LinearGradient {
    LinearGradient(
      stops: stops.map { Gradient.Stop(color: .black.opacity($0.opacity), location: $0.location) },
      startPoint: .top, endPoint: .bottom)
  }

  /// The veil's mask, as Android's: whole across the bar, then a smoothstep
  /// out below it, so neither end of the fade shows as an edge. `edge` is
  /// where the bar ends, as a fraction of the frost's height.
  static func veilMask(edge: Double) -> [(location: Double, opacity: Double)] {
    let feather = 1 - edge
    return [
      (0, 1), (edge, 1), (edge + feather * 0.25, 0.84), (edge + feather * 0.5, 0.5),
      (edge + feather * 0.75, 0.16), (1, 0),
    ]
  }

  /// The blur's: the veil's mask, and under it Android's progressive blur,
  /// whole across the bar and easing in and out to none by the frost's end.
  static func blurMask(edge: Double) -> [(location: Double, opacity: Double)] {
    let veil = veilMask(edge: edge)
    let steps = 12
    return [(0, 1)]
      + (0...steps).map { step in
        let along = Double(step) / Double(steps)
        let location = edge + (1 - edge) * along
        return (location, opacity(of: veil, at: location) * (1 - easeInOut(along)))
      }
  }

  /// `stops` read at `location`, as a gradient draws between them.
  private static func opacity(of stops: [(location: Double, opacity: Double)], at location: Double) -> Double {
    guard let after = stops.firstIndex(where: { $0.location >= location }) else { return stops.last?.opacity ?? 0 }
    guard after > 0 else { return stops[after].opacity }
    let from = stops[after - 1]
    let to = stops[after]
    let span = to.location - from.location
    guard span > 0 else { return to.opacity }
    return from.opacity + (to.opacity - from.opacity) * (location - from.location) / span
  }

  /// Compose's `EaseInOut`, `cubic-bezier(0.42, 0, 0.58, 1)`, at `x`.
  private static func easeInOut(_ x: Double) -> Double {
    func curve(_ t: Double, _ a: Double, _ b: Double) -> Double {
      3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
    }
    var low = 0.0
    var high = 1.0
    for _ in 0..<32 {
      let middle = (low + high) / 2
      if curve(middle, 0.42, 0.58) < x { low = middle } else { high = middle }
    }
    return curve((low + high) / 2, 0, 1)
  }
}
