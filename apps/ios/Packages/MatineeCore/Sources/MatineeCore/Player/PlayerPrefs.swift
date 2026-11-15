import Foundation
import Observation

public enum PlayerEngine: String, Sendable, CaseIterable { case avPlayer, mpv }
public enum Decoders: String, Sendable { case hardware }
public enum SubtitleColor: String, Sendable { case white, yellow, cyan, green }
public enum SubtitleBackground: String, Sendable { case none, shaded, black }
public enum SubtitleEdge: String, Sendable { case shadow, outline, none, raised, depressed }
public let OWN_SUBTITLE_EDGES: [SubtitleEdge] = [.shadow, .outline, .none]
public let SUBTITLE_SCALES: [Double] = [0.75, 1, 1.25, 1.5, 2]

@Observable @MainActor public final class PlayerPrefs {
  /// The app's one set, which Settings and the player share, as Android's
  /// `app.player`: each writes the whole set on a change, so a second one
  /// over the same defaults would put back what the other changed.
  public static let shared = PlayerPrefs()
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
  /// Up and down swipes on the video's sides change brightness and volume, as Android's.
  public var swipeLevels: Bool { didSet { save() } }
  /// Start each video at the brightness the last swipe left, rather than the screen's own.
  public var rememberBrightness: Bool { didSet { save() } }
  /// The brightness the last swipe left, 0 to 1, or -1 for none kept.
  public var brightness: Double { didSet { save() } }
  /// A sideways swipe on the video seeks.
  public var swipeSeek: Bool { didSet { save() } }
  /// Holding the video plays it at double speed until let go.
  public var holdSpeed: Bool { didSet { save() } }
  /// Which buttons the controls show. Back, play, and the settings menu
  /// always show, so none of these strands anyone.
  public var skipButtons: Bool { didSet { save() } }
  public var pictureInPictureButton: Bool { didSet { save() } }
  public var lockButton: Bool { didSet { save() } }
  public var audioButton: Bool { didSet { save() } }
  public var subtitlesButton: Bool { didSet { save() } }
  /// Draw subtitles as the system's caption settings say, instead of our choices.
  public var subtitleSystemStyle: Bool { didSet { save() } }
  public var subtitleScale: Double { didSet { save() } }
  public var subtitleColor: SubtitleColor { didSet { save() } }
  public var subtitleBackground: SubtitleBackground { didSet { save() } }
  public var subtitleEdge: SubtitleEdge { didSet { save() } }
  // AVPlayer selects its own decoder. It exposes no hardware/software preference.
  public var engine: PlayerEngine { didSet { save() } }
  /// Turns off remembering the brightness, and forgets the one kept, so the
  /// next video starts at the screen's own rather than one from before.
  public func setRememberBrightness(_ on: Bool) {
    rememberBrightness = on
    if !on { brightness = -1 }
  }
  public var decoders: Decoders { .hardware }
  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let p = defaults.dictionary(forKey: "player") ?? [:]
    engine = PlayerEngine(rawValue: p["engine"] as? String ?? "") ?? .mpv
    quality = p["quality"] as? String ?? ORIGINAL_QUALITY
    videoCodec = p["video_codec"] as? String ?? AUTOMATIC
    audioCodec = p["audio_codec"] as? String ?? AUTOMATIC
    convertAudio = Set(p["convert_audio"] as? [String] ?? [])
    autoplayNext = p["autoplay_next"] as? Bool ?? true
    fillScreen = p["fill_screen"] as? Bool ?? false
    pictureInPicture = p["picture_in_picture"] as? Bool ?? true
    swipeLevels = p["swipe_levels"] as? Bool ?? true
    rememberBrightness = p["remember_brightness"] as? Bool ?? false
    brightness = p["brightness_level"] as? Double ?? -1
    swipeSeek = p["swipe_seek"] as? Bool ?? true
    holdSpeed = p["hold_speed"] as? Bool ?? true
    skipButtons = p["button_skip"] as? Bool ?? true
    pictureInPictureButton = p["button_picture_in_picture"] as? Bool ?? true
    lockButton = p["button_lock"] as? Bool ?? true
    audioButton = p["button_audio"] as? Bool ?? true
    subtitlesButton = p["button_subtitles"] as? Bool ?? true
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
        "engine": engine.rawValue,
        "quality": quality, "video_codec": videoCodec, "audio_codec": audioCodec,
        "convert_audio": Array(convertAudio), "autoplay_next": autoplayNext,
        "fill_screen": fillScreen,
        "picture_in_picture": pictureInPicture, "subtitle_system_style": subtitleSystemStyle,
        "swipe_levels": swipeLevels, "remember_brightness": rememberBrightness, "brightness_level": brightness,
        "swipe_seek": swipeSeek, "hold_speed": holdSpeed, "button_skip": skipButtons,
        "button_picture_in_picture": pictureInPictureButton, "button_lock": lockButton,
        "button_audio": audioButton, "button_subtitles": subtitlesButton,
        "subtitle_scale": subtitleScale, "subtitle_color": subtitleColor.rawValue,
        "subtitle_background": subtitleBackground.rawValue, "subtitle_edge": subtitleEdge.rawValue,
      ], forKey: "player")
  }
}
