import SwiftUI

/// The app's motion, timed as the web app's (packages/ui: globals.css and
/// lib/modal.ts) and Android's Motion.kt, so all three feel equally quick:
/// things that move take 280 ms and settle fast, overlays open in 200 ms and
/// close in 150, colors change in 120.
///
/// With Reduce Motion on, what moves fades instead: use `.motion(_:value:)`,
/// `withMotion(_:_:)`, and `Motion.expand`, which read the setting, rather
/// than `.animation` and `withAnimation` with these directly.
public enum Motion {
  /// A page or tab sliding, a sheet or panel moving.
  public static let moveDuration = 0.28
  /// An overlay or a block of content appearing.
  public static let enterDuration = 0.2
  /// The same going away, quicker, so it never holds up what comes next.
  public static let exitDuration = 0.15
  /// A color or a selection changing.
  public static let colorDuration = 0.12
  /// Images over their placeholder.
  public static let imageDuration = 0.15

  /// The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long, soft landing.
  public static func easing(_ duration: Double, delay: Double = 0) -> Animation {
    .timingCurve(0.22, 1, 0.36, 1, duration: duration).delay(delay)
  }

  /// The web's ease-in, for things on their way out.
  public static func exitEasing(_ duration: Double) -> Animation { .timingCurve(0.4, 0, 1, 1, duration: duration) }

  public static let move = easing(moveDuration)
  public static let enter = easing(enterDuration)
  public static let exit = exitEasing(exitDuration)
  public static let color = easing(colorDuration)
  public static let image = easing(imageDuration)

  /// `animation` as Reduce Motion allows it: a movement becomes a quick
  /// fade's timing, since what changes still shouldn't jump.
  public static func animation(_ animation: Animation, reduceMotion: Bool) -> Animation {
    reduceMotion ? .linear(duration: colorDuration) : animation
  }

  /// A block of rows opening below the one that asked for it, and closing
  /// again; a fade alone under Reduce Motion.
  public static func expand(reduceMotion: Bool) -> AnyTransition {
    if reduceMotion { return .opacity.animation(.linear(duration: colorDuration)) }
    return .asymmetric(
      insertion: .move(edge: .top).combined(with: .opacity).animation(enter),
      removal: .move(edge: .top).combined(with: .opacity).animation(exit))
  }
}

private struct MotionModifier<Value: Equatable>: ViewModifier {
  let animation: Animation
  let value: Value
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content.animation(Motion.animation(animation, reduceMotion: reduceMotion), value: value)
  }
}

extension View {
  /// `.animation(_:value:)` with one of `Motion`'s, as Reduce Motion allows it.
  // Disfavored while the app keeps its own `motion(_:value:)`, as `palette` is.
  @_disfavoredOverload public func motion(_ animation: Animation, value: some Equatable) -> some View {
    modifier(MotionModifier(animation: animation, value: value))
  }
}

/// `withAnimation` with one of `Motion`'s, as Reduce Motion allows it.
@discardableResult
public func withMotion<Result>(_ animation: Animation, _ body: () throws -> Result) rethrows -> Result {
  let reduce = UIAccessibility.isReduceMotionEnabled
  return try withAnimation(Motion.animation(animation, reduceMotion: reduce), body)
}

/// Changes state with no animation at all, even inside an animated transaction.
func withoutAnimation(_ body: () -> Void) {
  var transaction = Transaction(animation: nil)
  transaction.disablesAnimations = true
  withTransaction(transaction, body)
}

/// Rows that show only sometimes, like a switch's extra settings: they open
/// and close rather than pop in and push the rest down at once.
public struct Reveal<Content: View>: View {
  let visible: Bool
  @ViewBuilder let content: () -> Content
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  public init(_ visible: Bool, @ViewBuilder content: @escaping () -> Content) {
    self.visible = visible
    self.content = content
  }

  public var body: some View {
    VStack(spacing: 0) {
      if visible { content().transition(Motion.expand(reduceMotion: reduceMotion)) }
    }
    .clipped()
    .motion(Motion.enter, value: visible)
  }
}
