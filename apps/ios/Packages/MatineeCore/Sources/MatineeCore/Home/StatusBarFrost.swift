import Foundation

/*
 * The frost under an iPad's tab bar (the kit's `NavBar`), over the status
 * bar: how strong it is for how far Home's banner under it has scrolled.
 * The kit draws it; this says how much. A phone's pages have no frost at
 * the top: a page under the status bar shows there as it is.
 */

/// The frost's strength at a scroll offset. Light at rest, so the banner's
/// art under the bar shows through, but never clear; it deepens over the
/// first 40 points of scrolling, to the bar's own, a scrolled page's.
public struct StatusBarFrostStrength: Equatable, Sendable {
  /// How far a page scrolls before the frost is at its full strength:
  /// Android's 40 dp.
  public static let distance = 40.0

  /// How far the page has scrolled under the bar, from 0 at its top to 1
  /// once it's `distance` down.
  public let scrolled: Double

  /// `offset` is how far the page is scrolled down from its top; a pull
  /// past the top counts as none.
  public init(offset: Double) {
    let down = offset / Self.distance
    scrolled = down.isFinite ? min(max(down, 0), 1) : 0
  }

  /// The page's color over the blur: 35% at rest, 75% scrolled.
  public var veil: Double { 0.35 + 0.4 * scrolled }

  /// The veil where nothing is blurred, under Reduce Transparency: Android's
  /// for phones that can't blur, 60% at rest and 85% scrolled.
  public var reducedVeil: Double { 0.6 + 0.25 * scrolled }
}
