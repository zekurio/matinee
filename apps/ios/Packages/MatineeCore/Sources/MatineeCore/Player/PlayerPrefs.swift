import Foundation
import Observation

public enum PlayerEngine: String, Sendable, CaseIterable { case avPlayer }
public enum Decoders: String, Sendable { case hardware }
public enum SubtitleColor: String, Sendable { case white, yellow, cyan, green }
public enum SubtitleBackground: String, Sendable { case none, shaded, black }
public enum SubtitleEdge: String, Sendable { case shadow, outline, none, raised, depressed }
public let OWN_SUBTITLE_EDGES: [SubtitleEdge] = [.shadow, .outline, .none]
public let SUBTITLE_SCALES: [Double] = [0.75, 1, 1.25, 1.5, 2]

@Observable @MainActor public final class PlayerPrefs {
  @ObservationIgnored private let defaults: UserDefaults
  /// The quality videos start in. The server answers with the nearest one the
  /// account may use, so one over its limit stays saved for when it's lifted.
  public var quality: String { didSet { save() } }
  /// The codec encodes come in, or AUTOMATIC.
  public var videoCodec: String { didSet { save() } }
  /// The codec streams convert audio to, or AUTOMATIC.
  public var audioCodec: String { didSet { save() } }
  /// Formats the device plays that streams convert anyway.
  public var convertAudio: Set<String> { didSet { save() } }
  /// Count down to the next episode and start it.
  public var autoplayNext: Bool { didSet { save() } }
  /// The video fills the screen, cut at its edges, rather than showing whole.
  public var fillScreen: Bool { didSet { save() } }
  /// Keep playing in a small window on leaving the app.
  public var pictureInPicture: Bool { didSet { save() } }
  /// Draw subtitles as the system's caption settings say, instead of our choices.
  public var subtitleSystemStyle: Bool { didSet { save() } }
  public var subtitleScale: Double { didSet { save() } }
  public var subtitleColor: SubtitleColor { didSet { save() } }
  public var subtitleBackground: SubtitleBackground { didSet { save() } }
  public var subtitleEdge: SubtitleEdge { didSet { save() } }
  // AVPlayer selects its own decoder. It exposes no hardware/software preference.
  public var engine: PlayerEngine { .avPlayer }
  public var decoders: Decoders { .hardware }
  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let p = defaults.dictionary(forKey: "player") ?? [:]
    quality = p["quality"] as? String ?? ORIGINAL_QUALITY
    videoCodec = p["video_codec"] as? String ?? AUTOMATIC
    audioCodec = p["audio_codec"] as? String ?? AUTOMATIC
    convertAudio = Set(p["convert_audio"] as? [String] ?? [])
    autoplayNext = p["autoplay_next"] as? Bool ?? true
    fillScreen = p["fill_screen"] as? Bool ?? false
    pictureInPicture = p["picture_in_picture"] as? Bool ?? true
    subtitleSystemStyle = p["subtitle_system_style"] as? Bool ?? false
    subtitleScale = p["subtitle_scale"] as? Double ?? 1
    subtitleColor = SubtitleColor(rawValue: p["subtitle_color"] as? String ?? "") ?? .white
    subtitleBackground =
      SubtitleBackground(rawValue: p["subtitle_background"] as? String ?? "") ?? .shaded
    subtitleEdge = SubtitleEdge(rawValue: p["subtitle_edge"] as? String ?? "") ?? .shadow
  }
  private func save() {
    defaults.set(
      [
        "quality": quality, "video_codec": videoCodec, "audio_codec": audioCodec,
        "convert_audio": Array(convertAudio), "autoplay_next": autoplayNext,
        "fill_screen": fillScreen,
        "picture_in_picture": pictureInPicture, "subtitle_system_style": subtitleSystemStyle,
        "subtitle_scale": subtitleScale, "subtitle_color": subtitleColor.rawValue,
        "subtitle_background": subtitleBackground.rawValue, "subtitle_edge": subtitleEdge.rawValue,
      ], forKey: "player")
  }
}
