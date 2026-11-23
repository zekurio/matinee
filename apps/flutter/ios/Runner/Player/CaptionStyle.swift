import CoreGraphics
import MediaAccessibility

/// The caption style in Settings > Accessibility > Subtitles & Captioning,
/// on an iPhone, an iPad, and an Apple TV alike. MediaAccessibility has no
/// edge color, so the edge is black, as the system draws it.
func systemCaptionStyle() -> CaptionStyleMessage {
  func argb(_ color: CGColor, _ opacity: CGFloat) -> Int64 {
    let rgb =
      color.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components
      ?? [1, 1, 1, 1]
    let channels = rgb.count >= 3 ? Array(rgb.prefix(3)) : [rgb[0], rgb[0], rgb[0]]
    return ([opacity] + channels).reduce(Int64(0)) { ($0 << 8) | Int64((min(max($1, 0), 1) * 255).rounded()) }
  }
  let edge: CaptionEdgeMessage =
    switch MACaptionAppearanceGetTextEdgeStyle(.user, nil) {
    case .raised: .raised
    case .depressed: .depressed
    case .uniform: .outline
    case .dropShadow: .shadow
    default: .none
    }
  return CaptionStyleMessage(
    foreground: argb(
      owned(MACaptionAppearanceCopyForegroundColor(.user, nil)), MACaptionAppearanceGetForegroundOpacity(.user, nil)),
    background: argb(
      owned(MACaptionAppearanceCopyBackgroundColor(.user, nil)), MACaptionAppearanceGetBackgroundOpacity(.user, nil)),
    window: argb(
      owned(MACaptionAppearanceCopyWindowColor(.user, nil)), MACaptionAppearanceGetWindowOpacity(.user, nil)),
    edge: edge, edgeColor: 0xFF00_0000,
    scale: Double(MACaptionAppearanceGetRelativeCharacterSize(.user, nil)))
}

/// MediaAccessibility's Copy functions hand over a retained color, which
/// Swift imports as Unmanaged unless the SDK's header is audited; either
/// way this takes it.
private func owned(_ color: Unmanaged<CGColor>) -> CGColor { color.takeRetainedValue() }
private func owned(_ color: CGColor) -> CGColor { color }
