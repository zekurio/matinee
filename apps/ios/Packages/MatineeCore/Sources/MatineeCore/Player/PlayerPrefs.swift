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
  public var quality: String { didSet { save() } }
  public var videoCodec: String { didSet { save() } }
  public var audioCodec: String { didSet { save() } }
  public var convertAudio: Set<String> { didSet { save() } }
  public var autoplayNext: Bool { didSet { save() } }
  public var fillScreen: Bool { didSet { save() } }
  public var pictureInPicture: Bool { didSet { save() } }
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
