import SwiftUI

/// How strong the frost under a `NavBar` is, as the page under it says.
/// The bar can't see how far its page has scrolled, so by itself it frosts
/// as over a scrolled page (75%, 85% under Reduce Transparency), which over
/// the page's background at rest doesn't show. A page that draws art under
/// the bar at rest, as Home's featured banner on an iPad, says how strong
/// with `.navBarFrost(…)`, as the phone's `StatusBarFrost` is told.
public struct NavBarFrost: Equatable, Sendable {
  public var veil: Double
  public var reducedVeil: Double
  public var opacity: Double

  public init(veil: Double, reducedVeil: Double, opacity: Double = 1) {
    self.veil = veil
    self.reducedVeil = reducedVeil
    self.opacity = opacity
  }

  /// A scrolled page's, the bar's own.
  public static let scrolled = NavBarFrost(veil: 0.75, reducedVeil: 0.85)
}

struct NavBarFrostKey: PreferenceKey {
  static let defaultValue: NavBarFrost? = nil

  /// The first page to say wins: the one on top.
  static func reduce(value: inout NavBarFrost?, nextValue: () -> NavBarFrost?) {
    value = value ?? nextValue()
  }
}

extension View {
  /// Tells the `NavBar` over this page how strong its status bar frost is:
  /// the page's veil over the blur, the veil under Reduce Transparency, and
  /// how much of the frost shows. Only while this view is on screen; once
  /// it's gone, as art scrolled away in a lazy stack, the bar's own returns.
  public func navBarFrost(_ frost: NavBarFrost) -> some View {
    preference(key: NavBarFrostKey.self, value: frost)
  }
}

extension EnvironmentValues {
  /// How far below the screen's top a page under a `NavBar` starts: the
  /// status bar and the bar. Art at the top of a scrolling page reaches up
  /// by this much to run under them, where `.ignoresSafeArea` can't take
  /// it. 0 without a bar.
  @Entry public var navBarClearance: CGFloat = 0
}
