import Foundation

public let MAX_ATTEMPTS = 12
public let MAX_TRACKS = 4
public let MAX_DECODERS = 4
public let MAX_CAUSES = 3

/// Codes only. Never use this to clean up free text such as an error message.
public struct Safe: Codable, Sendable, Equatable, Hashable, CustomStringConvertible {
  public let text: String
  private init(_ text: String) { self.text = text }
  public var description: String { text }
  public static let OTHER = Safe("other")
  public static func token(_ value: String?, max: Int = 48) -> Safe? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
      return nil
    }
    let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-+ ".utf8)
    return value.utf8.count <= max && value.utf8.allSatisfy(allowed.contains) ? Safe(value) : OTHER
  }
  /// An Apple model identifier, `iPhone17,1` or `Mac16,12`: letters, digits, and a comma.
  public static func model(_ value: String?, max: Int = 40) -> Safe? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
      return nil
    }
    return value.utf8.count <= max && isModel(value) ? Safe(value) : OTHER
  }
  private static func isModel(_ value: String) -> Bool {
    let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,".utf8)
    return value.utf8.allSatisfy(allowed.contains)
  }
  public static func known(_ value: String?, _ known: Set<String>) -> Safe? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      !value.isEmpty
    else { return nil }
    return known.contains(value) ? Safe(value) : OTHER
  }
  public static func mime(_ value: String?) -> Safe? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      !value.isEmpty
    else { return nil }
    let parts = value.split(separator: "/", omittingEmptySubsequences: false)
    let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789.-+_".utf8)
    guard parts.count == 2,
      ["video", "audio", "text", "application", "image"].contains(String(parts[0])),
      (1...32).contains(parts[1].utf8.count), parts[1].utf8.allSatisfy(allowed.contains)
    else { return OTHER }
    return Safe(value)
  }
  public static func of<T: RawRepresentable>(_ value: T) -> Safe where T.RawValue == String {
    token(value.rawValue.lowercased()) ?? OTHER
  }
  public static func constant(_ value: String?) -> Safe? { token(value, max: 64) }
  public init(from decoder: any Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    // Decoding cannot bypass the same checks as a live probe.
    let token = Safe.token(value, max: 64)
    if token != .OTHER {
      self = token ?? .OTHER
    } else if value == "*" || value == "pcm_*" {
      self = Safe(value)
    } else if value.utf8.count <= 40, Safe.isModel(value) {
      self = Safe(value)
    } else {
      self = Safe.mime(value) ?? .OTHER
    }
  }
  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(text)
  }
}
public let KNOWN_VIDEO_CODECS: Set<String> = [
  "h264", "hevc", "av1", "vp9", "vp8", "mpeg2video", "mpeg1video", "mpeg4", "msmpeg4v3", "vc1",
  "wmv3", "h263", "theora", "prores", "mjpeg",
]
public let KNOWN_AUDIO_CODECS: Set<String> = [
  "aac", "mp3", "mp2", "opus", "vorbis", "flac", "alac", "ac3", "eac3", "ac4", "dts", "truehd",
  "mlp", "wmav2", "wmapro", "amr_nb",
]
public let KNOWN_CONTAINERS: Set<String> = [
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "ts", "m2ts", "mts", "mpg", "mpeg", "ogv", "wmv",
  "flv",
]
/// ffmpeg's codec names and the server's display names for them alike: a
/// `SubtitleTrack.format` is the server's (`FORMAT_NAMES` in its
/// subtitles.ts), which calls an MP4's `mov_text` "TX3G".
public let KNOWN_SUBTITLE_FORMATS: Set<String> = [
  "srt", "subrip", "ass", "ssa", "vtt", "webvtt", "pgs", "vobsub", "dvdsub", "dvb", "mov_text",
  "tx3g", "ttml", "teletext",
]
let KNOWN_HDR: Set<String> = ["hdr10", "hdr10+", "hlg", "dolby-vision", "dolby vision", "sdr"]
let KNOWN_SETTING_CODECS = KNOWN_VIDEO_CODECS.union(KNOWN_AUDIO_CODECS).union(["auto"])
public func safeVideoCodec(_ value: String?) -> Safe? { Safe.known(value, KNOWN_VIDEO_CODECS) }
public func safeAudioCodec(_ value: String?) -> Safe? {
  if let value, value.lowercased().hasPrefix("pcm_") {
    return Safe.token(value.lowercased(), max: 16)
  }
  return Safe.known(value, KNOWN_AUDIO_CODECS)
}
public func safeCodecs(_ values: [String], max: Int = 8) -> [Safe] {
  values.prefix(max).compactMap { Safe.known($0, KNOWN_SETTING_CODECS.union(["*", "pcm_*"])) }
}
public func safeQuality(_ value: String?) -> Safe? {
  Safe.known(value, Set(PlaybackQuality.knownValues))
}

/// No serial number, device name, account, or server address.
public struct DeviceDiagnostics: Codable, Sendable, Equatable {
  public var appVersion: Safe?
  public var appBuild: Int
  public var buildType: Safe?
  public var osRelease: Safe?
  public var manufacturer: Safe?
  public var model: Safe?
  public var abi: Safe?
  public static func of(
    appVersion: String?, appBuild: Int, buildType: String?, osRelease: String?, model: String?,
    abi: String?
  ) -> Self {
    Self(
      appVersion: Safe.token(appVersion, max: 32), appBuild: appBuild,
      buildType: Safe.token(buildType, max: 16), osRelease: Safe.token(osRelease, max: 16),
      manufacturer: Safe.token("Apple"), model: Safe.model(model),
      abi: Safe.token(abi, max: 16))
  }
}
public struct SettingsDiagnostics: Codable, Sendable, Equatable {
  public let engine: Safe
  public let decoders: Safe
  public let quality: Safe?
  public let videoCodec: Safe?
  public let audioCodec: Safe?
  public let convertAudio: [Safe]
  private init(
    engine: Safe, decoders: Safe, quality: Safe?, videoCodec: Safe?, audioCodec: Safe?,
    convertAudio: [Safe]
  ) {
    self.engine = engine
    self.decoders = decoders
    self.quality = quality
    self.videoCodec = videoCodec
    self.audioCodec = audioCodec
    self.convertAudio = convertAudio
  }
  @MainActor init(_ prefs: PlayerPrefs) {
    self = Self.of(
      engine: prefs.engine.rawValue, decoders: prefs.decoders.rawValue, quality: prefs.quality,
      videoCodec: prefs.videoCodec, audioCodec: prefs.audioCodec, convertAudio: prefs.convertAudio)
  }
  public static func of(
    engine: String, decoders: String, quality: String, videoCodec: String, audioCodec: String,
    convertAudio: Set<String>
  ) -> Self {
    Self(
      engine: Safe.known(engine, ["avplayer", "mpv"]) ?? .OTHER,
      decoders: Safe.known(decoders, ["hardware", "software", "auto"]) ?? .OTHER,
      quality: safeQuality(quality), videoCodec: Safe.known(videoCodec, KNOWN_SETTING_CODECS),
      audioCodec: Safe.known(audioCodec, KNOWN_SETTING_CODECS),
      convertAudio: safeCodecs(convertAudio.sorted()))
  }
}
/// Formats, not the file name or where it is.
public struct FileDiagnostics: Codable, Sendable, Equatable {
  public let container: Safe?
  public let videoCodec: Safe?
  public let videoProfile: Safe?
  public let width: Int?
  public let height: Int?
  public let bitDepth: Int?
  public let hdr: Safe?
  public let dolbyVisionProfile: Int?
  public let audioCodecs: [Safe]
  public let subtitleCount: Int
  public let probed: Bool
  init(_ item: MediaItem) {
    container = Safe.known(item.container, KNOWN_CONTAINERS)
    let video = item.probe?.video
    videoCodec = safeVideoCodec(video?.codec)
    videoProfile = Safe.token(video?.profile, max: 24)
    width = video?.width
    height = video?.height
    bitDepth = video?.bitDepth
    hdr = Safe.known(video?.hdr, KNOWN_HDR)
    dolbyVisionProfile = video?.dolbyVisionProfile
    audioCodecs = (item.probe?.audio ?? []).prefix(MAX_TRACKS * 2).compactMap {
      safeAudioCodec($0.codec)
    }
    subtitleCount = item.probe?.subtitles.count ?? 0
    probed = item.probe != nil
  }
  public static func of(_ item: MediaItem) -> Self { Self(item) }
}
public enum SubtitleRendering: String, Codable, Sendable {
  case screen, player
  case burnIn = "burn_in"
}
public struct SelectionDiagnostics: Codable, Sendable, Equatable {
  public var audioIndex: Int?
  public var audioCodec: Safe?
  public var audioChannels: Int?
  public var subtitleFormat: Safe?
  public var subtitleSource: Safe?
  public var subtitleDelivery: Safe?
  public var subtitleRendering: SubtitleRendering?
  public static func of(audio: AudioTrack?, subtitle: SubtitleTrack?, rendering: SubtitleRendering?)
    -> Self
  {
    Self(
      audioIndex: audio?.index, audioCodec: safeAudioCodec(audio?.codec),
      audioChannels: audio?.channels,
      subtitleFormat: Safe.known(subtitle?.format, KNOWN_SUBTITLE_FORMATS),
      subtitleSource: Safe.known(subtitle?.source, ["sidecar", "embedded"]),
      subtitleDelivery: subtitle.flatMap {
        Safe.known($0.delivery ?? "none", ["webvtt", "pgs", "burn-in", "none"])
      }, subtitleRendering: subtitle == nil ? nil : rendering)
  }
}
public struct CapabilityDiagnostics: Codable, Sendable, Equatable {
  public let videoCodecs: [Safe]
  public let audioCodecs: [Safe]
  public let embeddedSubtitles: [Safe]
  public let streamAudioCodecs: [Safe]
  public let encodeVideoCodecs: [Safe]
  public var serverVideoCodecs: [Safe] = []
  public var serverAudioCodecs: [Safe] = []
  public var maxBitrate: Int?
  public let hls: Bool
  public let selectAudio: Bool
  private init(_ device: PlaybackDevice) {
    var seen: Set<String> = []
    videoCodecs = safeCodecs(device.video.map(\.codec).filter { seen.insert($0).inserted })
    audioCodecs = safeCodecs(device.audio, max: 16)
    embeddedSubtitles = device.embeddedSubtitles.prefix(8).compactMap {
      Safe.known($0, KNOWN_SUBTITLE_FORMATS.union(["*"]))
    }
    streamAudioCodecs = safeCodecs(device.streamAudio)
    encodeVideoCodecs = safeCodecs(device.encodeVideo)
    hls = device.hls
    selectAudio = device.selectAudio
  }
  public static func of(_ device: PlaybackDevice, options: PlaybackOptions) -> Self {
    var result = Self(device)
    result.serverVideoCodecs = safeCodecs(options.videoCodecs)
    result.serverAudioCodecs = safeCodecs(options.audioCodecs)
    result.maxBitrate = options.maxBitrate
    return result
  }
}
