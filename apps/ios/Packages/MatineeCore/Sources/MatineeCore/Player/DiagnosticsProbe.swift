import AVFoundation
import Darwin
import Foundation

public struct TrackDiagnostics: Codable, Sendable, Equatable {
  private var safeMediaType: Safe
  private var safeCodec: Safe
  public var mediaType: String {
    get { safeMediaType.text }
    set { safeMediaType = Safe.known(newValue, ["video", "audio", "text", "other"]) ?? .OTHER }
  }
  public var codec: String {
    get { safeCodec.text }
    set { safeCodec = Safe.token(newValue, max: 40) ?? .OTHER }
  }
  public var codecs: Safe? {
    get { safeCodec }
    set { safeCodec = newValue ?? .OTHER }
  }
  public init(
    mediaType: String, codec: String, width: Int32, height: Int32, channels: UInt32?,
    sampleRate: Double?
  ) {
    safeMediaType = Safe.known(mediaType, ["video", "audio", "text", "other"]) ?? .OTHER
    safeCodec = Safe.token(codec, max: 40) ?? .OTHER
    self.width = width
    self.height = height
    self.channels = channels
    self.sampleRate = sampleRate
  }
  public var width: Int32
  public var height: Int32
  public var channels: UInt32?
  public var sampleRate: Double?
  public var type: TrackKind = .other
  public var selected = false
  public var mime: Safe?
  public var bitrate: Int?
  public var support: Safe?
  public var profile: Safe?
  public var level: Safe?
  public var frameRate: Float?
  public var colorPrimaries: Safe?
  public var transferFunction: Safe?
  public var bitDepth: Int?
  public var hdr: Safe?
  public var dolbyVisionProfile: Int?
  public var dolbyVisionLevel: Int?
  public var channelLayout: UInt32?
}
public struct AccessLogDiagnostics: Sendable, Equatable {
  public var droppedFrames: Int
  public var stalls: Int
  public var indicatedBitrate: Double
  public var observedBitrate: Double
  public init(droppedFrames: Int, stalls: Int, indicatedBitrate: Double, observedBitrate: Double) {
    self.droppedFrames = droppedFrames
    self.stalls = stalls
    self.indicatedBitrate = indicatedBitrate
    self.observedBitrate = observedBitrate
  }
}
public struct ErrorLogDiagnostics: Sendable, Equatable {
  public var domain: String
  public var code: Int
  public init(domain: String, code: Int) {
    self.domain = domain
    self.code = code
  }
}
public struct DiagnosticsSnapshot: Sendable {
  public var playing = false
  public var status = "unknown"
  public var error: ErrorDiagnostics?
  public var access: [AccessLogDiagnostics] = []
  public var errors: [ErrorLogDiagnostics] = []
  public var bufferEmpty = false
  public var bufferFull = false
  public var likelyToKeepUp = false
  public var bufferedSeconds = 0.0
  public init() {}
}
/// Tests supply typed snapshots, without constructing an AVPlayer or a network request.
@MainActor public protocol DiagnosticsProbing {
  func snapshot(_ player: AVPlayer) -> DiagnosticsSnapshot
}
public struct AVPlayerDiagnosticsProbe: DiagnosticsProbing {
  public init() {}
  public func snapshot(_ player: AVPlayer) -> DiagnosticsSnapshot {
    DiagnosticsProbe.snapshot(player)
  }
}

public func deviceDiagnostics() -> DeviceDiagnostics {
  var info = utsname()
  uname(&info)
  var machine = withUnsafeBytes(of: &info.machine) { bytes in
    String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
  }
  #if os(macOS)
    // hw.model is shared by the model, unlike the computer's name or serial.
    var size = 0
    if sysctlbyname("hw.model", nil, &size, nil, 0) == 0, size > 0, size < 128 {
      var bytes = [UInt8](repeating: 0, count: size)
      let status = bytes.withUnsafeMutableBytes {
        sysctlbyname("hw.model", $0.baseAddress, &size, nil, 0)
      }
      if status == 0 { machine = String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self) }
    }
  #endif
  #if targetEnvironment(simulator)
    // A simulator's machine is the Mac's architecture; the model it plays is in its environment.
    machine = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? machine
  #endif
  let version = ProcessInfo.processInfo.operatingSystemVersion
  #if DEBUG
    let buildType = "debug"
  #else
    let buildType = "release"
  #endif
  #if arch(arm64)
    let abi = "arm64"
  #else
    let abi = "x86_64"
  #endif
  return .of(
    appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
    appBuild: Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0")
      ?? 0, buildType: buildType,
    osRelease: "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
    model: machine, abi: abi)
}
public func errorDiagnostics(_ error: NSError) -> ErrorDiagnostics {
  var result = ErrorDiagnostics(
    code: error.code, name: Safe.token(error.domain, max: 64), type: Safe.token("source"))
  var cause = error.userInfo[NSUnderlyingErrorKey] as? NSError
  var seen: Set<ObjectIdentifier> = [ObjectIdentifier(error)]
  while let current = cause, result.causes.count < MAX_CAUSES,
    seen.insert(ObjectIdentifier(current)).inserted
  {
    result.causes.append(Safe.token(current.domain, max: 64) ?? .OTHER)
    result.causeCodes.append(current.code)
    cause = current.userInfo[NSUnderlyingErrorKey] as? NSError
  }
  return result
}
public enum DiagnosticsProbe {
  @MainActor public static func snapshot(_ player: AVPlayer) -> DiagnosticsSnapshot {
    var result = DiagnosticsSnapshot()
    result.playing = player.timeControlStatus == .playing
    guard let item = player.currentItem else { return result }
    switch item.status {
    case .readyToPlay: result.status = "ready"
    case .failed: result.status = "failed"
    default: result.status = "unknown"
    }
    result.error = item.error.map { errorDiagnostics($0 as NSError) }
    // Do not read URI, serverAddress, playbackSessionID, errorComment or extendedLogData.
    result.errors = (item.errorLog()?.events ?? []).suffix(MAX_CAUSES).map {
      ErrorLogDiagnostics(domain: $0.errorDomain, code: $0.errorStatusCode)
    }
    result.access = (item.accessLog()?.events ?? []).suffix(1).map {
      AccessLogDiagnostics(
        droppedFrames: $0.numberOfDroppedVideoFrames, stalls: $0.numberOfStalls,
        indicatedBitrate: $0.indicatedBitrate, observedBitrate: $0.observedBitrate)
    }
    result.bufferEmpty = item.isPlaybackBufferEmpty
    result.bufferFull = item.isPlaybackBufferFull
    result.likelyToKeepUp = item.isPlaybackLikelyToKeepUp
    result.bufferedSeconds = item.loadedTimeRanges.reduce(0) {
      $0 + max(0, $1.timeRangeValue.duration.seconds)
    }
    return result
  }
  public static func formatDiagnostics(
    _ format: CMFormatDescription, selected: Bool, frameRate: Float? = nil, bitrate: Int? = nil
  ) -> TrackDiagnostics {
    let media = CMFormatDescriptionGetMediaType(format)
    let type: TrackKind =
      media == kCMMediaType_Video
      ? .video
      : media == kCMMediaType_Audio
        ? .audio : media == kCMMediaType_Subtitle || media == kCMMediaType_Text ? .text : .other
    let subtype = CMFormatDescriptionGetMediaSubType(format)
    let bytes: [UInt8] = [24, 16, 8, 0].map { UInt8((subtype >> $0) & 255) }
    let dimensions =
      type == .video
      ? CMVideoFormatDescriptionGetDimensions(format) : CMVideoDimensions(width: 0, height: 0)
    let audio =
      type == .audio ? CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee : nil
    let codec = Safe.token(String(bytes: bytes, encoding: .ascii), max: 40)?.text ?? "other"
    var result = TrackDiagnostics(
      mediaType: type.rawValue, codec: codec, width: dimensions.width, height: dimensions.height,
      channels: audio?.mChannelsPerFrame, sampleRate: audio?.mSampleRate)
    result.type = type
    result.selected = selected
    result.frameRate = frameRate.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
    result.bitrate = bitrate.flatMap { $0 > 0 ? $0 : nil }
    let mimes: [String: String] = [
      "avc1": "video/avc", "hvc1": "video/hevc", "hev1": "video/hevc", "dvh1": "video/hevc",
      "dvhe": "video/hevc", "av01": "video/av01", "vp09": "video/x-vnd.on2.vp9",
      "aac ": "audio/mp4a-latm", "ac-3": "audio/ac3", "ec-3": "audio/eac3", "alac": "audio/alac",
      "lpcm": "audio/raw",
    ]
    result.mime = Safe.mime(mimes[String(bytes: bytes, encoding: .ascii) ?? ""])
    let extensions = (CMFormatDescriptionGetExtensions(format) as NSDictionary?) ?? NSDictionary()
    // Read only named format extensions. Never dump the extension dictionary.
    result.colorPrimaries = Safe.token(
      extensions[kCMFormatDescriptionExtension_ColorPrimaries] as? String)
    result.transferFunction = Safe.token(
      extensions[kCMFormatDescriptionExtension_TransferFunction] as? String)
    result.bitDepth = (extensions["BitsPerComponent"] as? NSNumber)?.intValue
    result.profile = Safe.token(extensions["Profile"] as? String, max: 24)
    result.level = Safe.token(extensions["Level"] as? String, max: 24)
    if result.transferFunction?.text == "SMPTE_ST_2084_PQ" {
      result.hdr = Safe.known("hdr10", KNOWN_HDR)
    }
    if result.transferFunction?.text == "ITU_R_2100_HLG" {
      result.hdr = Safe.known("hlg", KNOWN_HDR)
    }
    let atoms =
      extensions[kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms] as? NSDictionary
    if let avc = atoms?["avcC"] as? Data, avc.count >= 4 {
      result.profile = Safe.token(String(avc[avc.startIndex + 1]))
      result.level = Safe.token(String(avc[avc.startIndex + 3]))
    }
    if let hevc = atoms?["hvcC"] as? Data, hevc.count >= 19 {
      result.profile = Safe.token(String(hevc[hevc.startIndex + 1] & 31))
      result.level = Safe.token(String(hevc[hevc.startIndex + 12]))
      result.bitDepth = 8 + Int(hevc[hevc.startIndex + 17] & 7)
    }
    if let dv = (atoms?["dvcC"] ?? atoms?["dvvC"]) as? Data, dv.count >= 4 {
      result.dolbyVisionProfile = Int(dv[dv.startIndex + 2] >> 1)
      result.dolbyVisionLevel =
        Int(dv[dv.startIndex + 2] & 1) << 5 | Int(dv[dv.startIndex + 3] >> 3)
      result.hdr = Safe.known("dolby-vision", KNOWN_HDR)
    }
    if type == .audio {
      var size = 0
      if let layout = CMAudioFormatDescriptionGetChannelLayout(format, sizeOut: &size),
        size >= 3 * MemoryLayout<UInt32>.size
      {
        result.channelLayout = layout.pointee.mChannelLayoutTag
      }
      result.bitDepth = audio.flatMap { $0.mBitsPerChannel > 0 ? Int($0.mBitsPerChannel) : nil }
    }
    return result
  }
  public static func trackDiagnostics(_ candidates: [TrackDiagnostics]) -> [TrackDiagnostics] {
    var result: [TrackDiagnostics] = []
    for kind in [TrackKind.video, .audio] {
      let tracks = candidates.filter { $0.type == kind }
      let selected = tracks.filter(\.selected)
      result += selected.isEmpty ? Array(tracks.prefix(1)) : Array(selected.prefix(2))
    }
    return Array(result.prefix(MAX_TRACKS))
  }
  @MainActor public static func tracks(_ item: AVPlayerItem) async throws -> [TrackDiagnostics] {
    var candidates: [TrackDiagnostics] = []
    for itemTrack in item.tracks {
      guard let track = itemTrack.assetTrack else { continue }
      let frameRate = try await track.load(.nominalFrameRate)
      let rate = try await track.load(.estimatedDataRate)
      for format in try await track.load(.formatDescriptions) {
        candidates.append(
          formatDiagnostics(
            format, selected: itemTrack.isEnabled, frameRate: frameRate,
            bitrate: rate.isFinite && rate > 0 && rate < Float(Int32.max) ? Int(rate) : nil))
      }
    }
    return trackDiagnostics(candidates)
  }
}
