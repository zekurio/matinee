import CoreGraphics
import CoreText
import MediaAccessibility
import Observation

/// Reading the revision lets an observed render follow Accessibility changes
/// without requiring the player to close and reopen.
@Observable @MainActor public final class SystemCaptionStyle {
  public static let shared = SystemCaptionStyle()
  public private(set) var revision = 0

  private init() {
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetLocalCenter(), Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let style = Unmanaged<SystemCaptionStyle>.fromOpaque(observer).takeUnretainedValue()
        Task { @MainActor in style.revision += 1 }
      }, kMACaptionAppearanceSettingsChangedNotification, nil, .deliverImmediately)
  }
}

public struct CaptionColor: Sendable, Equatable {
  public var red: Double
  public var green: Double
  public var blue: Double
  public var alpha: Double
  public init(_ red: Double, _ green: Double, _ blue: Double, _ alpha: Double = 1) {
    self.red = red
    self.green = green
    self.blue = blue
    self.alpha = alpha
  }
  init(_ color: CGColor, opacity: Double) {
    let rgb =
      color.converted(
        to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?
      .components ?? [1, 1, 1, 1]
    self.init(Double(rgb[0]), Double(rgb[1]), Double(rgb[2]), opacity)
  }
}
public struct SubtitleLook: Sendable, Equatable {
  public var color: CaptionColor
  public var background: CaptionColor
  public var window: CaptionColor
  public var edge: SubtitleEdge
  public var edgeColor: CaptionColor
  public var scale: Double
  public var font: String?
}
@MainActor public func subtitleLook(_ prefs: PlayerPrefs) -> SubtitleLook {
  let color: CaptionColor =
    switch prefs.subtitleColor {
    case .white: CaptionColor(1, 1, 1)
    case .yellow: CaptionColor(1, 225.0 / 255, 77.0 / 255)
    case .cyan: CaptionColor(108.0 / 255, 229.0 / 255, 1)
    case .green: CaptionColor(124.0 / 255, 242.0 / 255, 154.0 / 255)
    }
  var look = SubtitleLook(
    color: color,
    background: CaptionColor(
      0, 0, 0, prefs.subtitleBackground == .none ? 0 : prefs.subtitleBackground == .black ? 1 : 0.45
    ), window: CaptionColor(0, 0, 0, 0), edge: prefs.subtitleEdge, edgeColor: CaptionColor(0, 0, 0),
    scale: prefs.subtitleScale)
  guard prefs.subtitleSystemStyle else { return look }
  _ = SystemCaptionStyle.shared.revision
  let domain = MACaptionAppearanceDomain.user
  look.color = CaptionColor(
    MACaptionAppearanceCopyForegroundColor(domain, nil).takeRetainedValue(),
    opacity: MACaptionAppearanceGetForegroundOpacity(domain, nil))
  look.background = CaptionColor(
    MACaptionAppearanceCopyBackgroundColor(domain, nil).takeRetainedValue(),
    opacity: MACaptionAppearanceGetBackgroundOpacity(domain, nil))
  look.window = CaptionColor(
    MACaptionAppearanceCopyWindowColor(domain, nil).takeRetainedValue(),
    opacity: MACaptionAppearanceGetWindowOpacity(domain, nil))
  look.scale = MACaptionAppearanceGetRelativeCharacterSize(domain, nil)
  look.edge =
    switch MACaptionAppearanceGetTextEdgeStyle(domain, nil) {
    case .dropShadow: .shadow
    case .uniform: .outline
    case .raised: .raised
    case .depressed: .depressed
    default: .none
    }
  let descriptor = MACaptionAppearanceCopyFontDescriptorForStyle(domain, nil, .default)
    .takeRetainedValue()
  look.font = CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String
  return look
}
