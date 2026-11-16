import Foundation

/*
 * Bars.kt's StatusBarScrim and HomeScreen.kt's fade of it: how strong the
 * frost under the status bar is for how far its page has scrolled. The kit's
 * `StatusBarFrost` draws it; this says how much.
 */

/// The status bar frost's strength at a scroll offset. Light at rest, so
/// art under the bar shows through, but never clear; it deepens over the
/// first 40 points of scrolling, as the page's top slides under the bar.
/// Home's frost also fades in over those 40 points, since its header sits
/// below the bar and at rest the frost's feather would only blur the logo.
public struct StatusBarFrostStrength: Equatable, Sendable {
  /// How far a page scrolls before the frost is at its full strength:
  /// Android's 40 dp.
  public static let distance = 40.0

  /// How far the page has scrolled under the bar, from 0 at its top to 1
  /// once it's `distance` down.
  public let scrolled: Double
  /// Whether the frost fades in as the page scrolls, as Home's.
  public let fadesIn: Bool

  /// `offset` is how far the page is scrolled down from its top; a pull
  /// past the top counts as none.
  public init(offset: Double, fadesIn: Bool = false) {
    let down = offset / Self.distance
    scrolled = down.isFinite ? min(max(down, 0), 1) : 0
    self.fadesIn = fadesIn
  }

  /// The page's color over the blur: 35% at rest, 75% scrolled.
  public var veil: Double { 0.35 + 0.4 * scrolled }

  /// The veil where nothing is blurred, under Reduce Transparency: Android's
  /// for phones that can't blur, 60% at rest and 85% scrolled.
  public var reducedVeil: Double { 0.6 + 0.25 * scrolled }

  /// How much of the frost shows at all: all of it, or on Home as much as
  /// the page has scrolled.
  public var opacity: Double { fadesIn ? scrolled : 1 }
}
