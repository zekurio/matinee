import SwiftUI

/// Which of the kit's tab bars a page's tabs are drawn as: a phone's
/// `BottomBar`, or a tablet's `NavBar`.
public enum TabBarPlacement: Hashable, Sendable {
  /// The full-width `BottomBar` along the bottom, as `.bottomBar` puts it.
  case bottom
  /// The `NavBar` floating at the top, as `.navBar` puts it.
  case top
}

extension View {
  /// The tabs on this page as `placement` says: `bottom` along its bottom,
  /// as `.bottomBar(bottom)` puts it, or `top` floating at its top, as
  /// `.navBar(top)` does. Either is the chrome around one page: when the
  /// placement changes, as an iPad's window narrows to a phone's width and
  /// back, the page stays the same view, so it keeps its state, what it
  /// loaded, and where it's scrolled, and only the bar around it changes.
  /// Two branches of `.bottomBar` and `.navBar` would build the page again.
  ///
  /// Each bar does what it does alone: the bottom bar takes its room off the
  /// page's safe area, steps aside for the keyboard, and lifts toasts over
  /// it; the top bar starts the page's safe area below it, frosts the status
  /// bar as the page asks (`navBarFrost`), and gives art under it its
  /// clearance (`\.navBarClearance`). The bar that isn't drawn takes no
  /// room, gives no clearance, and ignores what the page asks of it, so a
  /// page can say how strong the top bar's frost is and stay the same page
  /// under the bottom bar.
  ///
  /// ```swift
  /// page.tabBars(
  ///   style == .phone ? .bottom : .top,
  ///   bottom: BottomBar(items, selection: tab) { tab = $0 },
  ///   top: NavBar(items, selection: tab) { tab = $0 } leading: { LogoMark(size: 24) })
  /// ```
  public func tabBars<ID: Hashable, Leading: View>(
    _ placement: TabBarPlacement, bottom: BottomBar<ID>, top: NavBar<ID, Leading>
  ) -> some View {
    modifier(NavBarModifier(bar: placement == .top ? top : nil))
      .modifier(BottomBarModifier(bar: placement == .bottom ? bottom : nil))
  }
}
