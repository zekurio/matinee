import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * The system navigation bar, themed, as the screens not yet rebuilt use it
 * for their top: `legacyTopBar` and `legacyItemTopBar`, and the UIKit
 * appearance that dresses it in the theme's colors and Red Hat Text. A
 * rebuilt page uses the kit's `.topBar`, or `.hidesSystemNavigationBar()`
 * with `ItemTopBar` over art (Bars.swift). This goes with the rest of
 * legacy/ (LegacyControls.swift).
 */

extension View {
  /// The top of a page opened from a tab, as Android's `LegacyTopBar`: back (the
  /// system's), the page's name, and what the page can do. With `home`, a
  /// button back to Home's first page beside back. It stays put while the
  /// page scrolls. Goes on the page, inside its `NavigationStack`.
  func legacyTopBar<Actions: View>(
    _ title: String?, home: Bool = false, @ViewBuilder actions: @escaping () -> Actions
  ) -> some View {
    modifier(LegacyTopBar(title: title, home: home, actions: actions))
  }

  func legacyTopBar(_ title: String?, home: Bool = false) -> some View {
    legacyTopBar(title, home: home) { EmptyView() }
  }

  /// Back and Home over a title's, season's, or episode's art, with the
  /// page above it, like the show of a season, in a pill: Android's
  /// `LegacyItemTopBar`. The navigation bar clears for the art, and back and its
  /// swipes are the system's. The page goes under the bar, to the top edge.
  func legacyItemTopBar(parent: String? = nil, onParent: (() -> Void)? = nil) -> some View {
    modifier(LegacyItemTopBar(parent: parent, onParent: onParent))
  }
}

private struct LegacyTopBar<Actions: View>: ViewModifier {
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

private struct LegacyItemTopBar: ViewModifier {
  let parent: String?
  let onParent: (() -> Void)?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      // The navigation bar, cleared for the art: the system's back button,
      // its edge swipe and its swipe from anywhere on the page, with Home and
      // the page above beside it, each on the system's glass. iOS takes both
      // swipes away from a page whose bar is hidden, and an empty bar counts
      // as hidden, so the buttons live in it rather than over it.
      content
        .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        .toolbarColorScheme(palette.isDark ? .dark : .light, for: .navigationBar)
        .toolbar {
          if !offline {
            ToolbarItem(placement: .topBarLeading) {
              Button { nav.home() } label: { Image(Lucide.house) }
                .accessibilityLabel(Str.shellHomeLink)
            }
          }
          if let parent, let onParent {
            // A glass of its own rather than one shared with Home, as Android's pill is.
            if !offline { ToolbarSpacer(.fixed, placement: .topBarLeading) }
            ToolbarItem(placement: .topBarLeading) {
              Button(action: onParent) { Text(parent).textStyle(.sm, weight: .medium).lineLimit(1) }
            }
          }
        }
    } else {
      content
        .toolbar(.hidden, for: .navigationBar)
        .background { LegacyBackSwipe() }
        .overlay(alignment: .top) { floatingBar }
    }
  }

  /// Back, Home, and the page above, floating over the art, before iOS 26's glass bars.
  private var floatingBar: some View {
    HStack(spacing: 6) {
      LegacyRoundIconButton(.arrowLeft, label: Str.commonBack, iconSize: 22, background: floating, border: edge) {
        dismiss()
      }
      if !offline {
        LegacyRoundIconButton(.house, label: Str.shellHomeLink, iconSize: 20, background: floating, border: edge) {
          nav.home()
        }
      }
      if let parent, let onParent {
        Button(action: onParent) {
          Text(parent).textStyle(.sm, weight: .medium).lineLimit(1).foregroundStyle(palette.foreground)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(floating, in: Capsule())
            .overlay { Capsule().strokeBorder(edge) }
            .contentShape(Capsule())
        }
        .buttonStyle(LegacyRoundPress())
      }
      Spacer(minLength: 0)
    }
    // Lifted off a page as dark as the veil, as the web's floating bar is.
    .compositingGroup()
    .shadow(color: .black.opacity(palette.isDark ? 0.45 : 0.15), radius: 10, y: 4)
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
  }

  /// The page's color veiling the art behind a floating button, as the web's bars have it.
  private var floating: Color { palette.background.opacity(0.6) }

  /// The web's glass has a hairline edge in the text's color, which keeps a
  /// button there over a plain page without art, where the veil alone is the
  /// page's own color and the circle vanished.
  private var edge: Color { palette.foreground.opacity(0.1) }
}

/// Keeps the edge swipe going back on a page whose navigation bar is
/// hidden, before iOS 26: UIKit only lets it begin while the bar's own back
/// button would show, so this answers for it, on any page but the first.
private struct LegacyBackSwipe: UIViewControllerRepresentable {
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


/// The colors and fonts of what UIKit draws for SwiftUI: navigation and tab
/// bars, and the controls SwiftUI leaves to it. Set on the appearance
/// proxies, which bars made after it take; `.topBar` sets a page's bar
/// colors in SwiftUI too, so one already on screen follows a theme change.
enum LegacySystemBars {
  static func apply(_ palette: Palette) {
    let colors = palette.colors
    let bar = UINavigationBarAppearance()
    bar.configureWithOpaqueBackground()
    bar.backgroundColor = colors.background.uiColor
    bar.shadowColor = .clear
    bar.titleTextAttributes = [
      .font: TextSize.xl.uiFont(.semibold), .foregroundColor: colors.text.uiColor,
    ]
    bar.largeTitleTextAttributes = [
      .font: TextSize.xl3.uiFont(.bold), .foregroundColor: colors.text.uiColor,
    ]
    let button = UIBarButtonItemAppearance()
    button.normal.titleTextAttributes = [
      .font: TextSize.sm.uiFont(.medium), .foregroundColor: colors.text.uiColor,
    ]
    bar.buttonAppearance = button
    bar.backButtonAppearance = button
    let navigation = UINavigationBar.appearance()
    navigation.standardAppearance = bar
    navigation.compactAppearance = bar
    navigation.scrollEdgeAppearance = bar
    // The back chevron and bar buttons are the text's color, as Android's top bar draws them.
    navigation.tintColor = colors.text.uiColor

    let tabs = UITabBarAppearance()
    tabs.configureWithOpaqueBackground()
    tabs.backgroundColor = colors.background.uiColor
    tabs.shadowColor = colors.border.uiColor
    for item in [tabs.stackedLayoutAppearance, tabs.inlineLayoutAppearance, tabs.compactInlineLayoutAppearance] {
      item.normal.iconColor = colors.textDim.uiColor
      item.normal.titleTextAttributes = [
        .font: TextSize.px11.uiFont(.medium), .foregroundColor: colors.textDim.uiColor,
      ]
      item.selected.iconColor = colors.text.uiColor
      item.selected.titleTextAttributes = [
        .font: TextSize.px11.uiFont(.medium), .foregroundColor: colors.text.uiColor,
      ]
    }
    UITabBar.appearance().standardAppearance = tabs
    UITabBar.appearance().scrollEdgeAppearance = tabs

    UIRefreshControl.appearance().tintColor = colors.textDim.uiColor
    UIPageControl.appearance().currentPageIndicatorTintColor = colors.text.uiColor
    UIPageControl.appearance().pageIndicatorTintColor = colors.borderStrong.uiColor
    // Alerts, menus, and text selection take the window's tint.
    for scene in UIApplication.shared.connectedScenes {
      // Only the app's own windows: the system adds others over them, on an
      // iPad, which an opaque background would hide the app behind.
      for window in (scene as? UIWindowScene)?.windows ?? [] where window.windowLevel == .normal {
        window.tintColor = colors.accent.uiColor
        window.backgroundColor = colors.background.uiColor
        // Bars already on screen keep what they were made with; the proxies only reach new ones.
        restyle(window, tabs: tabs, navigation: bar, tint: colors.text.uiColor)
      }
    }
  }

  private static func restyle(
    _ view: UIView, tabs: UITabBarAppearance, navigation: UINavigationBarAppearance, tint: UIColor
  ) {
    if let bar = view as? UITabBar {
      bar.standardAppearance = tabs
      bar.scrollEdgeAppearance = tabs
    } else if let bar = view as? UINavigationBar {
      bar.standardAppearance = navigation
      bar.compactAppearance = navigation
      bar.scrollEdgeAppearance = navigation
      bar.tintColor = tint
    }
    for child in view.subviews { restyle(child, tabs: tabs, navigation: navigation, tint: tint) }
  }
}

extension View {
  /// Keeps UIKit's navigation bars, which the screens not yet rebuilt still
  /// show, in the theme's colors. Goes once, on the root.
  func legacySystemBars() -> some View { modifier(LegacySystemBarsModifier()) }
}

private struct LegacySystemBarsModifier: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content.onChange(of: palette, initial: true) { LegacySystemBars.apply(palette) }
  }
}
