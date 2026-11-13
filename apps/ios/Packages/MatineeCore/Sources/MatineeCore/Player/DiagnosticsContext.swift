import Foundation

// Diagnostics leave out titles, paths, track labels and arbitrary server strings.
// Even codec names are allowlisted because the probe reads untrusted media.
private let diagnosticCodecs: Set<String> = [
  "h264", "hevc", "av1", "vp8", "vp9", "mpeg1video", "mpeg2video", "mpeg4",
  "vc1", "theora", "aac", "ac3", "eac3", "truehd", "dts", "flac", "alac",
  "mp3", "mp2", "opus", "vorbis", "auto", "*", "pcm_*",
]

private func knownCodec(_ value: String?) -> String? {
  guard let value = value?.lowercased() else { return nil }
  return diagnosticCodecs.contains(value) ? value : "other"
}

private func codecList(_ values: [String]) -> [String] {
  values.prefix(8).compactMap(knownCodec)
}

public struct SettingsDiagnostics: Codable, Sendable, Equatable {
  public let engine: String
  public let decoders: String
  public let quality: String?
  public let videoCodec: String?
  public let audioCodec: String?
  public let convertAudio: [String]

  @MainActor init(_ prefs: PlayerPrefs) {
    engine = prefs.engine.rawValue
    decoders = prefs.decoders.rawValue
    quality = PlaybackQuality.knownValues.contains(prefs.quality) ? prefs.quality : nil
    videoCodec = knownCodec(prefs.videoCodec)
    audioCodec = knownCodec(prefs.audioCodec)
    convertAudio = codecList(prefs.convertAudio.sorted())
  }
}

public struct FileDiagnostics: Codable, Sendable, Equatable {
  public let container: String
  public let videoCodec: String?
  public let width: Int?
  public let height: Int?
  public let bitDepth: Int?
  public let dolbyVisionProfile: Int?
  public let audioCodecs: [String]
  public let subtitleCount: Int
  public let probed: Bool

  init(_ item: MediaItem) {
    let containers: Set<String> = [
      "mp4", "m4v", "mov", "webm", "mkv", "avi", "ts", "m2ts", "mts", "mpg", "mpeg", "ogv", "wmv",
      "flv",
    ]
    container = containers.contains(item.container) ? item.container : "other"
    let video = item.probe?.video
    videoCodec = knownCodec(video?.codec)
    width = video?.width
    height = video?.height
    bitDepth = video?.bitDepth
    dolbyVisionProfile = video?.dolbyVisionProfile
    audioCodecs = codecList(item.probe?.audio.map(\.codec) ?? [])
    subtitleCount = item.probe?.subtitles.count ?? 0
    probed = item.probe != nil
  }
}

public struct CapabilityDiagnostics: Codable, Sendable, Equatable {
  public let videoCodecs: [String]
  public let audioCodecs: [String]
  public let streamAudioCodecs: [String]
  public let encodeVideoCodecs: [String]
  public let hls: Bool
  public let selectAudio: Bool

  init(_ device: PlaybackDevice) {
    videoCodecs = codecList(device.video.map(\.codec))
    audioCodecs = codecList(device.audio)
    streamAudioCodecs = codecList(device.streamAudio)
    encodeVideoCodecs = codecList(device.encodeVideo)
    hls = device.hls
    selectAudio = device.selectAudio
  }
}
