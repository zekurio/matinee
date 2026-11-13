import SwiftUI
import UIKit

/*
 * Bars.kt's bars as far as they belong to a page rather than the shell: the
 * top bar of a page opened from a tab, the floating buttons over a title's
 * art, Home's header, and the scrim that keeps the status bar readable over
 * art. The tabs are the shell's.
 *
 * On iOS the top bar is the navigation bar, so back is the system's button
 * and its edge swipe; these set its colors, font, and buttons to Android's.
 */

extension View {
  /// The top of a page opened from a tab, as Android's `TopBar`: back (the
  /// system's), the page's name, and what the page can do. With `home`, a
  /// button back to Home's first page beside back. It stays put while the
  /// page scrolls. Goes on the page, inside its `NavigationStack`.
  func topBar<Actions: View>(
    _ title: String?, home: Bool = false, @ViewBuilder actions: @escaping () -> Actions
  ) -> some View {
    modifier(TopBar(title: title, home: home, actions: actions))
  }

  func topBar(_ title: String?, home: Bool = false) -> some View {
    topBar(title, home: home) { EmptyView() }
  }

  /// Back and Home over a title's, season's, or episode's art, with the
  /// page above it, like the show of a season, in a pill: Android's
  /// `ItemTopBar`. The navigation bar steps aside for the art; the edge
  /// swipe still goes back.
  func itemTopBar(parent: String? = nil, onParent: (() -> Void)? = nil) -> some View {
    modifier(ItemTopBar(parent: parent, onParent: onParent))
  }
}

private struct TopBar<Actions: View>: ViewModifier {
  let title: String?
  let home: Bool
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    content
      .navigationTitle(title ?? "")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(palette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .toolbarColorScheme(palette.isDark ? .dark : .light, for: .navigationBar)
      .toolbar {
        if home && !offline {
          ToolbarItem(placement: .topBarLeading) {
            Button { nav.home() } label: { Image(Lucide.house) }
              .accessibilityLabel(Str.shellHomeLink)
          }
        }
        ToolbarItemGroup(placement: .topBarTrailing) { actions() }
      }
  }
}

private struct ItemTopBar: ViewModifier {
  let parent: String?
  let onParent: (() -> Void)?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .toolbar(.hidden, for: .navigationBar)
      .background { BackSwipe() }
      .overlay(alignment: .top) {
        HStack(spacing: 6) {
          RoundIconButton(.arrowLeft, label: Str.commonBack, iconSize: 22, background: floating) { dismiss() }
          if !offline {
            RoundIconButton(.house, label: Str.shellHomeLink, iconSize: 20, background: floating) { nav.home() }
          }
          if let parent, let onParent {
            Button(action: onParent) {
              Text(parent).textStyle(.labelLarge).lineLimit(1).foregroundStyle(palette.foreground)
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(floating, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(RoundPress())
          }
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
      }
  }

  /// The page's color veiling the art behind a floating button, as the web's bars have it.
  private var floating: Color { palette.background.opacity(0.6) }
}

/// Keeps the edge swipe going back on a page whose navigation bar is
/// hidden: UIKit only lets it begin while the bar's own back button would
/// show, so this answers for it, on any page but the first.
private struct BackSwipe: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> Controller { Controller() }
  func updateUIViewController(_ controller: Controller, context: Context) {}

  final class Controller: UIViewController {
    override func viewWillAppear(_ animated: Bool) {
      super.viewWillAppear(animated)
      guard let gesture = navigationController?.interactivePopGestureRecognizer else { return }
      gesture.delegate = Delegate.shared
      gesture.isEnabled = true
    }
  }

  final class Delegate: NSObject, UIGestureRecognizerDelegate {
    static let shared = Delegate()

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
      // The gesture's view is the navigation controller's own.
      guard let navigation = gesture.view?.next as? UINavigationController else { return false }
      return navigation.viewControllers.count > 1
    }
  }
}

/// Home's header: room for the status bar over the banner's art, faded for
/// it to read, and whether the app is offline. It scrolls away with the
/// page. The banner's own title logo carries the top, so there's no app
/// logo competing with it; search and the account are in the tab bar.
struct AppHeader<Action: View>: View {
  @ViewBuilder var action: () -> Action
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  init(@ViewBuilder action: @escaping () -> Action) { self.action = action }

  var body: some View {
    HStack {
      Spacer()
      if offline {
        LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.muted)
      } else {
        action()
      }
    }
    .frame(height: 56)
    .padding(.horizontal, Gutter)
    // Readable over bright art, fading out a little below the header as on the web.
    .background(alignment: .top) {
      LinearGradient(
        stops: [
          .init(color: palette.background.opacity(0.85), location: 0),
          .init(color: palette.background.opacity(0.75), location: 0.35),
          .init(color: .clear, location: 1),
        ], startPoint: .top, endPoint: .bottom
      )
      .padding(.bottom, -40)
      .ignoresSafeArea(edges: .top)
    }
  }
}

extension AppHeader where Action == EmptyView {
  init() { self.init { EmptyView() } }
}

extension View {
  /// Keeps the status bar readable once a scroll view under it scrolls: a
  /// shade that deepens with the first 40 points of scrolling, as the
  /// page's top slides under the bar, and fades from the top edge down to
  /// nothing, so there's no band across the art at the top. Goes on the
  /// `ScrollView`; Android's `StatusBarScrim`.
  func statusBarScrim() -> some View { modifier(StatusBarScrim()) }
}

private struct StatusBarScrim: ViewModifier {
  @State private var scrolled: CGFloat = 0
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        min(max((geometry.contentOffset.y + geometry.contentInsets.top) / 40, 0), 1)
      } action: { _, value in scrolled = value }
      .overlay(alignment: .top) {
        GeometryReader { proxy in
          let bar = proxy.safeAreaInsets.top
          let shown = 0.35 + 0.65 * scrolled
          LinearGradient(
            stops: [
              .init(color: palette.background.opacity(0.9 * shown), location: 0),
              .init(color: palette.background.opacity(0.6 * shown), location: 0.6),
              .init(color: .clear, location: 1),
            ], startPoint: .top, endPoint: .bottom
          )
          // Past the bar by half its height, so the fade has room.
          .frame(height: bar * 1.5)
          .ignoresSafeArea(edges: .top)
        }
        .frame(height: 0)
        .allowsHitTesting(false)
      }
  }
}
