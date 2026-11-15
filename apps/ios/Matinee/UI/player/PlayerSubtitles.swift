import MatineeCore
import MatineeKit
import MatineeMPV
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Subtitles` and SubtitleStyle.kt's `SubtitleLine`: the
 * WebVTT cues showing now, drawn by the app in the viewer's look or the
 * system's caption style. A track the engine draws, mpv's styled ASS and
 * bitmaps, AVPlayer's own, or one the server burned in, comes in the
 * picture and needs nothing here: the controller's `cues` are nil then.
 * Plain text mpv reads from the file comes through its engine's `text`.
 *
 * Nothing here is for a finger, so the TV's player can draw the same lines.
 */

/// The cues showing now, over the video, risen above the controls while
/// they show. Sized to the part of the video on screen rather than to the
/// screen, so they keep their place in the picture on a phone and an iPad.
struct Subtitles: View {
  let controller: PlayerController
  let look: SubtitleLook
  /// How far up from the screen's bottom edge the controls reach while
  /// they show, which the lines rise above; nil while they're away.
  let lift: CGFloat?
  /// The video's rectangle on screen, cut to the screen when it fills.
  let video: CGRect
  /// The screen's full size, under the safe areas.
  let screen: CGSize
  let safeBottom: CGFloat
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let embedded = (controller.playbackEngine as? MPVPlaybackEngine)?.text ?? ""
    let shown = embedded.isEmpty ? controller.cues?.at(controller.position) ?? [] : [Cue(text: embedded)]
    // 20 points on a phone held sideways, as Android's 20 sp there, and in
    // step with the picture elsewhere.
    let size = max(12, min(video.height, video.width * 9 / 16) / 19.5)
    // Inside the picture, a twentieth of its height up from its bottom, and
    // clear of the home indicator.
    let inVideo = screen.height - video.maxY + video.height * 0.05
    let rest = max(inVideo, MatineeKit.Space.s7 + safeBottom)
    let bottom = lift.map { max(rest, $0 + MatineeKit.Space.s3) } ?? rest
    VStack(spacing: 2) {
      ForEach(Array(shown.enumerated()), id: \.offset) { _, cue in
        SubtitleLine(cue: cue, look: look, size: size)
      }
    }
    .frame(width: max(0, video.width - 2 * max(24, video.width * 0.06)))
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .padding(.bottom, bottom)
    // Moves with the controls rather than jumping when they come and go.
    .animation(MatineeKit.Motion.animation(MatineeKit.Motion.move, reduceMotion: reduceMotion), value: lift == nil)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// One cue, centered, at `size` times the look's scale: the text over its
/// background, inside the window, with a shadow, a hard edge, or an outline
/// drawn under the fill. Settings' Subtitles page draws its sample with it
/// too, so the sample is what the player shows.
struct SubtitleLine: View {
  let cue: Cue
  let look: SubtitleLook
  var size: CGFloat = 20

  var body: some View {
    let fontSize = size * look.scale
    let padding: CGFloat = look.background.alpha > 0 ? 8 : 0
    let windowPadding: CGFloat = look.window.alpha > 0 ? 6 : 0
    ZStack {
      if look.edge == .outline {
        // Round strokes around each glyph, under the fill, as Android's 14 % stroke.
        let width = fontSize * 0.07
        ForEach(0..<8, id: \.self) { step in
          let angle = Double(step) * .pi / 4
          text(fontSize, color: look.edgeColor.color)
            .offset(x: cos(angle) * width, y: sin(angle) * width)
        }
      }
      text(fontSize, color: look.color.color)
        .modifier(EdgeShadow(edge: look.edge, color: look.edgeColor.color))
    }
    .padding(.horizontal, padding)
    .padding(.vertical, 2)
    .background(look.background.color, in: RoundedRectangle(cornerRadius: 4))
    .padding(windowPadding)
    .background(look.window.color, in: RoundedRectangle(cornerRadius: 6))
  }

  private func text(_ fontSize: CGFloat, color: Color) -> some View {
    Text(styled(fontSize))
      .foregroundStyle(color)
      .multilineTextAlignment(.center)
      // Android's line height, 1.3 times the size.
      .lineSpacing(max(0, fontSize * 1.3 - font(fontSize, bold: false).lineHeight))
      .fixedSize(horizontal: false, vertical: true)
  }

  /// The cue's spans with their bold, italic, and underline.
  private func styled(_ fontSize: CGFloat) -> AttributedString {
    var result = AttributedString()
    for span in cue.spans {
      var part = AttributedString(span.text)
      let base = Font(font(fontSize, bold: span.bold))
      // Red Hat Text has no italic of its own; SwiftUI slants it.
      part.font = span.italic ? base.italic() : base
      if span.underline { part.underlineStyle = .single }
      result += part
    }
    return result
  }

  /// The system style's font when it names one, else the app's, at medium
  /// weight as Android draws subtitles.
  private func font(_ fontSize: CGFloat, bold: Bool) -> UIFont {
    guard let name = look.font, let named = UIFont(name: name, size: fontSize) else {
      return MatineeKit.RedHatText.uiFont(size: fontSize, weight: bold ? .bold : .medium)
    }
    guard bold, let descriptor = named.fontDescriptor.withSymbolicTraits(.traitBold) else { return named }
    return UIFont(descriptor: descriptor, size: fontSize)
  }
}

/// A soft shadow below, or a hard edge above and to the left or below and to the right.
private struct EdgeShadow: ViewModifier {
  let edge: SubtitleEdge
  let color: Color

  func body(content: Content) -> some View {
    switch edge {
    case .shadow: content.shadow(color: color, radius: 3, x: 0, y: 2)
    case .raised: content.shadow(color: color, radius: 0, x: -2, y: -2)
    case .depressed: content.shadow(color: color, radius: 0, x: 2, y: 2)
    case .outline, .none: content
    }
  }
}

extension CaptionColor {
  var color: Color { Color(.sRGB, red: red, green: green, blue: blue, opacity: alpha) }
}
