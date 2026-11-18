import SwiftUI

/*
 * Small additions to the kit's tokens for the app's shell and components,
 * kept apart from the files they extend.
 */

extension InsettableShape where Self == RoundedRectangle {
  /// The same, where a shape is asked for: `Pressable(shape: .kit(Radius.sm))`.
  public static func kit(_ radius: CGFloat) -> RoundedRectangle {
    RoundedRectangle(cornerRadius: radius, style: .circular)
  }
}

extension Motion {
  /// Controls and overlays fading in and out, as the player's controls and
  /// a card's Play under the pointer: in at `enter`, out at `exit`.
  public static let fade: AnyTransition = .asymmetric(
    insertion: .opacity.animation(enter), removal: .opacity.animation(exit))
}
