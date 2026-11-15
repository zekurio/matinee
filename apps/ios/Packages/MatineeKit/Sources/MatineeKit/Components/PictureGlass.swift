import SwiftUI

/*
 * The web player's surfaces over the picture (apps/web/src/components/
 * player-controls.tsx and around it): black over a blur with a faint white
 * ring, whatever the theme, since video is what's underneath. The play
 * button and the seek preview are `bg-black/45`, the notes `bg-black/60`,
 * the skip button `bg-black/70`, and the next episode's card `bg-black/80`,
 * each `backdrop-blur-md ring-1 ring-white/15`. Under Reduce Transparency
 * they turn solid, as the kit's glass does.
 */

/// How dark a surface over the picture is, as the web player's `bg-black/*`.
public enum PictureShade: Sendable {
  /// `bg-black/45`: the play button, the seek preview.
  case light
  /// `bg-black/60`: the notes over the video.
  case medium
  /// `bg-black/70`: the skip button.
  case strong
  /// `bg-black/80`: the next episode's card.
  case solid

  var opacity: Double {
    switch self {
    case .light: 0.45
    case .medium: 0.6
    case .strong: 0.7
    case .solid: 0.8
    }
  }
}

extension View {
  /// The web player's glass behind this, in `shape`: black at `shade` over
  /// a blur, and a hairline ring of white at `ring` (`ring-white/15`, or 0
  /// for none).
  public func pictureGlass<S: InsettableShape>(in shape: S, shade: PictureShade = .light, ring: Double = 0.15)
    -> some View
  {
    modifier(PictureGlass(shape: shape, shade: shade, ring: ring))
  }

  /// The web player's text over the picture, `[text-shadow:0_1px_2px_rgb(0_0_0/0.6)]`,
  /// which keeps white text and icons legible over a bright frame.
  public func pictureShadow() -> some View {
    shadow(color: .black.opacity(0.6), radius: 1, y: 1)
  }
}

private struct PictureGlass<S: InsettableShape>: ViewModifier {
  let shape: S
  let shade: PictureShade
  let ring: Double
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  func body(content: Content) -> some View {
    content
      .background {
        if reduceTransparency {
          shape.fill(.black.opacity(max(0.85, shade.opacity)))
        } else {
          shape.fill(.ultraThinMaterial).environment(\.colorScheme, .dark)
            .overlay(shape.fill(.black.opacity(shade.opacity)))
        }
      }
      .overlay {
        if ring > 0 { shape.strokeBorder(.white.opacity(ring), lineWidth: 1).allowsHitTesting(false) }
      }
  }
}
