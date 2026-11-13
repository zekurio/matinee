import AVFoundation
import VideoToolbox
import AudioToolbox
import Foundation

public struct CapabilitySnapshot: Sendable {
  public var codecs: DeviceCodecs
  public var hdr: [String]
  public var outputChannels: Int
  public init(codecs: DeviceCodecs, hdr: [String] = [], outputChannels: Int = 2) {
    self.codecs = codecs; self.hdr = hdr; self.outputChannels = outputChannels
  }
}
public struct ProfileSettings: Sendable {
  public var convertAudio: Set<String>
  public var audioCodec: String
  public var videoCodec: String
  public init(convertAudio: Set<String> = [], audioCodec: String = AUTOMATIC, videoCodec: String = AUTOMATIC) {
    self.convertAudio = convertAudio; self.audioCodec = audioCodec; self.videoCodec = videoCodec
  }
}
public enum Capabilities {
  public static func decodesAudio(_ codec: String, snapshot: CapabilitySnapshot) -> Bool {
    codec.hasPrefix("pcm_") || snapshot.codecs.audio.contains(codec)
  }
  public static func passthrough(_ snapshot: CapabilitySnapshot) -> [String] {
    OPTIONAL_PASSTHROUGH.filter { decodesAudio($0, snapshot: snapshot) }
  }
  public static func encodeVideoChoices(server: [String], snapshot: CapabilitySnapshot) -> [String] {
    ["h264", "hevc", "av1"].filter { codec in server.contains(codec) && snapshot.codecs.video.contains { $0.codec == codec } }
  }
  public static func convertAudioCodecs(server: [String], snapshot: CapabilitySnapshot) -> [String] {
    ["opus", "aac"].filter { server.contains($0) && ($0 == "aac" || decodesAudio($0, snapshot: snapshot)) }
  }
  public static func probe() -> CapabilitySnapshot {
    // VideoToolbox doesn't publish the decoder's maximum frame rectangle. A
    // conservative 4K landscape/portrait bound avoids claiming 8K on older phones.
    let size = FrameSize(width: 3840, height: 2160)
    let portrait = FrameSize(width: 2160, height: 3840)
    let candidates: [(String, CMVideoCodecType)] = [("h264", kCMVideoCodecType_H264), ("hevc", kCMVideoCodecType_HEVC), ("av1", kCMVideoCodecType_AV1)]
    let video = candidates.filter { VTIsHardwareDecodeSupported($0.1) }.map {
      VideoDecoder(codec: $0.0, widest: size, tallest: portrait, tenBit: $0.0 != "h264")
    }
    var hdr: [String] = []
    #if os(iOS)
    let modes = AVPlayer.availableHDRModes
    if modes.contains(.hdr10) { hdr.append(HdrFormat.hdr10) }
    if modes.contains(.hlg) { hdr.append(HdrFormat.hlg) }
    if modes.contains(.dolbyVision) { hdr.append(HdrFormat.dolby_vision) }
    #endif
    // macOS has no availableHDRModes API; don't claim HDR on a headless Mac.
    // AudioFormat reports installed decoders, rather than assuming an OS's
    // support for Opus or Dolby codecs. Container compatibility stays server-side.
    var bytes: UInt32 = 0
    var formats: [AudioFormatID] = []
    if AudioFormatGetPropertyInfo(kAudioFormatProperty_DecodeFormatIDs, 0, nil, &bytes) == noErr {
      formats = Array(repeating: 0, count: Int(bytes) / MemoryLayout<AudioFormatID>.size)
      _ = formats.withUnsafeMutableBytes { AudioFormatGetProperty(kAudioFormatProperty_DecodeFormatIDs, 0, nil, &bytes, $0.baseAddress!) }
    }
    let audio: [(String, AudioFormatID)] = [("aac", kAudioFormatMPEG4AAC), ("mp3", kAudioFormatMPEGLayer3), ("ac3", kAudioFormatAC3), ("eac3", kAudioFormatEnhancedAC3), ("flac", kAudioFormatFLAC), ("alac", kAudioFormatAppleLossless), ("opus", kAudioFormatOpus)]
    var channels = 2
    #if os(iOS)
    channels = max(1, AVAudioSession.sharedInstance().outputNumberOfChannels)
    #endif
    return CapabilitySnapshot(codecs: DeviceCodecs(video: video, audio: Set(audio.filter { formats.contains($0.1) }.map(\.0)), dolbyVision: hdr.contains(HdrFormat.dolby_vision)), hdr: hdr, outputChannels: channels)
  }
}
public func playbackProfile(settings: ProfileSettings = ProfileSettings(), snapshot: CapabilitySnapshot, locale: Locale = .current) -> PlaybackDevice {
  let codecs = snapshot.codecs
  let converted = settings.convertAudio.intersection(OPTIONAL_PASSTHROUGH)
  let audio = ["aac", "mp3", "opus", "flac", "alac", "ac3", "eac3"].filter { codecs.audio.contains($0) && !converted.contains($0) }
  var stream = ["opus", "aac", "mp3", "flac", "alac", "ac3", "eac3"].filter { $0 == "aac" || audio.contains($0) }
  if let index = stream.firstIndex(of: settings.audioCodec) { stream.insert(stream.remove(at: index), at: 0) }
  var encode = ["h264"] + ["hevc", "av1"].filter { codec in codecs.video.contains { $0.codec == codec } }
  if let index = encode.firstIndex(of: settings.videoCodec) { encode.insert(encode.remove(at: index), at: 0) }
  let video = codecs.video.flatMap { decoder in profileDecoders(decoder, dolbyVision: codecs.dolbyVision).map { value in
    var value = value; value.hdr = decoder.tenBit ? snapshot.hdr : []
    // Apple's native path supports single-layer Dolby Vision 5 and 8, not
    // every dual-layer disc profile an Android Dolby decoder may advertise.
    if codecs.dolbyVision { value.dolbyVisionProfiles = decoder.codec == "hevc" ? [5, 8] : [] }
    return value
  } }
  // The contract has no fields for channel count, max bitrate or passthrough.
  // Don't invent a server decision by filtering tracks according to the route.
  return PlaybackDevice(containers: ["mp4", "m4v", "mov"], video: video, audio: audio + ["pcm_*"], streamAudio: stream, encodeVideo: encode, hls: true, selectAudio: true, subtitles: [PlaybackSubtitleDelivery.webvtt], sidecarSubtitles: [], embeddedSubtitles: [], language: profileLanguage(locale))
}
@MainActor public func downloadDevice(_ prefs: PlayerPrefs, probe: () -> CapabilitySnapshot = Capabilities.probe) -> PlaybackDevice {
  playbackProfile(settings: ProfileSettings(convertAudio: prefs.convertAudio), snapshot: probe())
}
@MainActor public func playbackDevice(_ prefs: PlayerPrefs, probe: () -> CapabilitySnapshot = Capabilities.probe) -> PlaybackDevice {
  playbackProfile(settings: ProfileSettings(convertAudio: prefs.convertAudio, audioCodec: prefs.audioCodec, videoCodec: prefs.videoCodec), snapshot: probe())
}
