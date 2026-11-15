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

/// The top of a page opened from a tab, as the web's PhoneTopBar and
/// Android's `TopBar`: Back, the page's name in `text-xl font-semibold
/// tracking-tight`, and what the page can do, on the page's background,
/// 64 tall. `centered` centers the name over a hairline, as the web's
/// settings sheet has it. Back does `onLeading`, or dismisses the page.
/// With `onHome`, a house beside Back goes to the app's first page, as the
/// web's bar has it on a page with no name of its own.
public struct TopBar<Actions: View>: View {
  let title: String?
  let leading: TopBarLeading
  let centered: Bool
  let onLeading: (() -> Void)?
  let onHome: (() -> Void)?
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale

  public init(
    _ title: String?, leading: TopBarLeading = .back, centered: Bool = false, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil, @ViewBuilder actions: @escaping () -> Actions
  ) {
    self.title = title
    self.leading = leading
    self.centered = centered
    self.onLeading = onLeading
    self.onHome = onHome
    self.actions = actions
  }

  public var body: some View {
    VStack(spacing: 0) {
      ZStack {
        if centered, let title {
          Text(title)
            .textStyle(.base, weight: .semibold, tracking: .tight)
            .lineLimit(1)
            .padding(.horizontal, 56)
            .accessibilityAddTraits(.isHeader)
        }
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
          if !centered, let title {
            Text(title)
              .textStyle(.xl, weight: .semibold, tracking: .tight)
              .lineLimit(1)
              .padding(.leading, leading == .none ? Space.gutter - 4 : 4)
              .accessibilityAddTraits(.isHeader)
          }
          Spacer(minLength: 0)
          HStack(spacing: 0) { actions() }
        }
        .padding(.horizontal, 4)
      }
      .frame(height: centered ? 56 : 64)
      if centered { Separator() }
    }
    .foregroundStyle(palette.foreground)
    .background(palette.background.ignoresSafeArea(edges: .top))
  }
}

extension TopBar where Actions == EmptyView {
  public init(
    _ title: String?, leading: TopBarLeading = .back, centered: Bool = false, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil
  ) {
    self.init(title, leading: leading, centered: centered, onLeading: onLeading, onHome: onHome) { EmptyView() }
  }
}

extension View {
  /// Gives a page in a `NavigationStack` the kit's `TopBar` in place of the
  /// system's navigation bar, which it hides, while keeping the edge swipe
  /// back that hiding it would otherwise take away. The page scrolls under
  /// nothing: the bar stays put above it.
  public func topBar<Actions: View>(
    _ title: String?, leading: TopBarLeading = .back, centered: Bool = false, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil, @ViewBuilder actions: @escaping () -> Actions
  ) -> some View {
    self
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        .background(SwipeBack())
      #endif
      .safeAreaInset(edge: .top, spacing: 0) {
        TopBar(title, leading: leading, centered: centered, onLeading: onLeading, onHome: onHome, actions: actions)
      }
      .pageBackground()
  }

  public func topBar(
    _ title: String?, leading: TopBarLeading = .back, centered: Bool = false, onLeading: (() -> Void)? = nil,
    onHome: (() -> Void)? = nil
  ) -> some View {
    topBar(title, leading: leading, centered: centered, onLeading: onLeading, onHome: onHome) { EmptyView() }
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

/// A destination in the tab bars: its name, which shows beside its icon
/// while it's the open one (always, in the `NavBar`) and is what VoiceOver
/// reads, and a lucide icon or, `picture`, a view of its own, as the
/// profile tab's avatar.
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

/// The tabs, floating over the bottom of a tab's first page, as the web's
/// phone TabBar and Android's `BottomBar`: a frosted capsule of the tabs,
/// and `accessory`, as search, in a circle of its own beside it. The open
/// tab shows its name beside its icon in a pill; the rest show only their
/// icons. The page scrolls on beneath it, with no fade: the frost alone
/// keeps it readable, as Android has it since its fade went.
///
/// It keeps its size at the accessibility text sizes, as iOS's tab bar
/// does; a long press on a tab shows its name large instead. With a
/// keyboard, ⌘1, ⌘2, … pick the tabs in order.
public struct BottomBar<ID: Hashable>: View {
  let items: [TabBarItem<ID>]
  let accessory: TabBarItem<ID>?
  let selection: ID?
  let onSelect: (ID) -> Void
  @Environment(\.palette) private var palette

  /// What the bar takes above the bottom safe area: itself and the gap
  /// under it, and 8 above it so a page's last row clears it, as
  /// Android's `BOTTOM_BAR_HEIGHT`. What a toast rises over.
  public static var clearance: CGFloat { barHeight + lift + Space.s2 }
  static var barHeight: CGFloat { 60 }
  static var lift: CGFloat { Space.s3 }

  public init(
    _ items: [TabBarItem<ID>], accessory: TabBarItem<ID>? = nil, selection: ID?, onSelect: @escaping (ID) -> Void
  ) {
    self.items = items
    self.accessory = accessory
    self.selection = selection
    self.onSelect = onSelect
  }

  public var body: some View {
    HStack(spacing: 10) {
      HStack(spacing: 0) {
        ForEach(items.indices, id: \.self) { index in
          tab(items[index], wide: true, shortcut: index)
        }
      }
      .floating(Capsule())
      if let accessory {
        tab(accessory, wide: false, shortcut: items.count).floating(Circle())
      }
    }
    .padding(.top, Space.s7)
    .padding(.bottom, Self.lift)
    .frame(maxWidth: .infinity)
    .motion(Motion.move, value: selection)
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    .accessibilityElement(children: .contain)
  }

  private func tab(_ item: TabBarItem<ID>, wide: Bool, shortcut: Int) -> some View {
    let selected = item.id == selection
    return Button {
      onSelect(item.id)
    } label: {
      HStack(spacing: Space.s2) {
        TabGlyph(item: item, selected: selected, size: 22)
        if selected && wide {
          Text(item.label).textStyle(.sm, weight: .medium).lineLimit(1).fixedSize()
        }
      }
      .foregroundStyle(selected ? palette.foreground : palette.mutedForeground)
      .padding(.horizontal, selected && wide ? 18 : 0)
      .frame(minWidth: wide ? 56 : 52, minHeight: 52)
      .background(selected ? palette.foreground.opacity(0.1) : .clear, in: Capsule())
      .contentShape(Capsule())
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
  /// Floats `bar` over the bottom of this page, which keeps scrolling under
  /// it and ends clear of it. It steps aside while the keyboard is up.
  public func bottomBar<ID: Hashable>(_ bar: BottomBar<ID>) -> some View {
    modifier(BottomBarModifier(bar: bar))
  }
}

private struct BottomBarModifier<ID: Hashable>: ViewModifier {
  let bar: BottomBar<ID>
  @State private var keyboard = false
  @State private var height: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if !keyboard {
          bar
            .onGeometryChange(for: CGFloat.self) { $0.size.height - Space.s7 } action: { height = $0 }
            .transition(.opacity)
        }
      }
      .preference(key: BottomBarHeightKey.self, value: keyboard ? 0 : height)
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

extension View {
  /// The bars' surfaces: the popover, frosted, with a faint rim, lifted off
  /// the page by a shadow: `bg-popover/85 backdrop-blur-xl border-foreground/[0.08]`.
  func floating<S: Shape>(_ shape: S) -> some View {
    modifier(Floating(shape: shape))
  }
}

private struct Floating<S: Shape>: ViewModifier {
  let shape: S
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  func body(content: Content) -> some View {
    content
      .padding(4)
      .background {
        if reduceTransparency {
          shape.fill(palette.popover)
        } else {
          shape.fill(.regularMaterial).overlay(shape.fill(palette.popover.opacity(0.85)))
        }
      }
      .overlay { shape.stroke(palette.foreground.opacity(0.08)) }
      .kitShadow(.bar)
  }
}
