import AVFoundation
import Foundation
import Observation

public enum AttemptReason: String, Codable, Sendable {
  case start, fallback, retry
  case audioChange = "audio_change"
  case subtitleChange = "subtitle_change"
  case qualityChange = "quality_change"
}
public enum AttemptOutcome: String, Codable, Sendable {
  case loading, playing, failed, replaced, closed
}
public enum TrackKind: String, Codable, Sendable { case video, audio, text, other }
public enum DiagnosticsNote: String, Codable, Sendable {
  case subtitleLoadFailed = "subtitle_load_failed"
  case startFailed = "start_failed"
  case seekFailed = "seek_failed"
  case unplayable, restricted
  case tooManyStreams = "too_many_streams"
}
public struct DecoderDiagnostics: Codable, Sendable, Equatable {
  public var type: TrackKind
  public var name: Safe?
}
/// Never reads localizedDescription, userInfo URLs, or error-log comments.
public struct ErrorDiagnostics: Codable, Sendable, Equatable {
  public var code: Int
  public var name: Safe?
  public var type: Safe?
  public var renderer: Safe?
  public var format: TrackDiagnostics?
  public var formatSupport: Safe?
  public var httpStatus: Int?
  public var decoder: Safe?
  public var secureDecoder: Bool?
  public var causes: [Safe] = []
  public var causeCodes: [Int] = []
}
public struct AttemptDiagnostics: Codable, Sendable, Equatable {
  public var number = 0
  public var mode: SourceMode = .direct
  public var reason: AttemptReason = .start
  public var startAt: Int64 = 0
  public var audioIndex: Int?
  public var quality: Safe?
  public var burnIn = false
  public var why: [Safe] = []
  public var videoTo: Safe?
  public var audioTo: Safe?
  public var outcome: AttemptOutcome = .loading
  public var error: ErrorDiagnostics?
}

/// In memory until cleared or the app closes. Nothing here sends a report anywhere.
/// Every string is an allowlisted value or a typed short code, never free text.
public struct PlaybackReport: Codable, Sendable, Equatable {
  public var device: DeviceDiagnostics? = deviceDiagnostics()
  public var settings: SettingsDiagnostics?
  public var file: FileDiagnostics?
  public var selection = SelectionDiagnostics.of(audio: nil, subtitle: nil, rendering: nil)
  public var capabilities: CapabilityDiagnostics?
  public var attempts: [AttemptDiagnostics] = []
  public var droppedAttempts = 0
  public var mpvStatistics: MPVStatistics?
  public var tracks: [TrackDiagnostics] = []
  public var decoders: [DecoderDiagnostics] = []
  public var notes: [DiagnosticsNote: Int] = [:]
  public var errorLogCodes: [Int] = []
  public var errorLogDomains: [Safe] = []
  public var droppedFrames = 0
  public var indicatedBitrate = 0.0
  public var observedBitrate = 0.0
  public var stalls = 0
  public var firstFrameSeconds: Double?
  public var itemStatus: Safe?
  public var bufferEmpty = false
  public var bufferFull = false
  public var likelyToKeepUp = false
  public var bufferedSeconds = 0.0
  public var closed = false
  public var latest: AttemptDiagnostics? { attempts.last }
  public var failed: Bool { latest?.outcome == .failed }
  public init() {}

  public mutating func attempt(
    mode: SourceMode, reason: AttemptReason, at: Double, audioIndex: Int?, quality: String?,
    burnIn: Bool, why: [String] = [], videoTo: String? = nil, audioTo: String? = nil
  ) {
    for index in attempts.indices where attempts[index].outcome == .loading {
      attempts[index].outcome = .replaced
    }
    let seconds = at.isFinite ? max(0, min(at, Double(Int64.max / 2))) : 0
    var next = AttemptDiagnostics()
    next.number = (attempts.last?.number ?? droppedAttempts) + 1
    next.mode = mode
    next.reason = reason
    next.startAt = Int64(seconds)
    next.audioIndex = audioIndex
    next.quality = safeQuality(quality)
    next.burnIn = burnIn
    next.why = why.prefix(PlaybackReason.knownValues.count).compactMap {
      Safe.known($0, Set(PlaybackReason.knownValues))
    }
    next.videoTo = safeVideoCodec(videoTo)
    next.audioTo = safeAudioCodec(audioTo)
    attempts.append(next)
    if attempts.count > MAX_ATTEMPTS {
      let count = attempts.count - MAX_ATTEMPTS
      attempts.removeFirst(count)
      droppedAttempts += count
    }
    tracks = []
  }
  public mutating func attempt(
    _ source: Source, plan: PlaybackStart?, reason: AttemptReason, audioIndex: Int?
  ) {
    attempt(
      mode: source.mode, reason: reason, at: source.position,
      audioIndex: plan?.audio?.index ?? audioIndex,
      quality: plan?.quality, burnIn: plan?.subtitleMode == PlaybackSubtitleMode.burn_in,
      why: plan?.reasons ?? [], videoTo: plan?.convertedVideo, audioTo: plan?.convertedAudio)
  }
  public mutating func playing() {
    guard let index = attempts.indices.last, attempts[index].outcome == .loading else { return }
    attempts[index].outcome = .playing
  }
  public mutating func failed(_ error: ErrorDiagnostics) {
    guard let index = attempts.indices.last else { return }
    var bounded = error
    bounded.causes = Array(error.causes.prefix(MAX_CAUSES))
    bounded.causeCodes = Array(error.causeCodes.prefix(MAX_CAUSES))
    attempts[index].error = bounded
    attempts[index].outcome = .failed
  }
  public mutating func close() {
    closed = true
    guard let index = attempts.indices.last, attempts[index].outcome == .loading else { return }
    attempts[index].outcome = .closed
  }
  public mutating func select(_ selection: SelectionDiagnostics) { self.selection = selection }
  public mutating func capabilities(_ capabilities: CapabilityDiagnostics) {
    self.capabilities = capabilities
  }
  public mutating func tracks(_ tracks: [TrackDiagnostics]) {
    self.tracks = Array(tracks.prefix(MAX_TRACKS))
  }
  public mutating func decoder(_ decoder: DecoderDiagnostics) {
    decoders.removeAll { $0 == decoder }
    decoders = Array((decoders + [decoder]).suffix(MAX_DECODERS))
  }
  public mutating func note(_ note: DiagnosticsNote) { notes[note, default: 0] += 1 }
  @MainActor mutating func sample(
    _ player: AVPlayer, probe: any DiagnosticsProbing = AVPlayerDiagnosticsProbe()
  ) { sample(probe.snapshot(player)) }
  public mutating func sample(_ snapshot: DiagnosticsSnapshot) {
    if snapshot.playing { playing() }
    itemStatus = Safe.known(snapshot.status, ["unknown", "ready", "failed"])
    if let error = snapshot.error { failed(error) }
    errorLogCodes = Array(snapshot.errors.suffix(MAX_CAUSES).map(\.code))
    errorLogDomains = snapshot.errors.suffix(MAX_CAUSES).compactMap {
      Safe.token($0.domain, max: 64)
    }
    if let event = snapshot.access.last {
      droppedFrames = max(0, event.droppedFrames)
      indicatedBitrate = event.indicatedBitrate.isFinite ? max(0, event.indicatedBitrate) : 0
      observedBitrate = event.observedBitrate.isFinite ? max(0, event.observedBitrate) : 0
      stalls = max(0, event.stalls)
    }
    bufferEmpty = snapshot.bufferEmpty
    bufferFull = snapshot.bufferFull
    likelyToKeepUp = snapshot.likelyToKeepUp
    bufferedSeconds = snapshot.bufferedSeconds.isFinite ? max(0, snapshot.bufferedSeconds) : 0
  }
}

/// Publishes each change, starting with the report before any attempt.
@MainActor public final class DiagnosticsRecorder {
  public private(set) var report: PlaybackReport
  private let publish: @MainActor (PlaybackReport) -> Void
  public init(
    _ initial: PlaybackReport,
    publish: @escaping @MainActor (PlaybackReport) -> Void = PlaybackDiagnostics.publish
  ) {
    report = initial
    self.publish = publish
    publish(report)
  }
  private func update(_ change: (inout PlaybackReport) -> Void) {
    change(&report)
    publish(report)
  }
  public func attempt(
    mode: SourceMode, reason: AttemptReason, at: Double, audioIndex: Int?, quality: String?,
    burnIn: Bool, why: [String] = [], videoTo: String? = nil, audioTo: String? = nil
  ) {
    update {
      $0.attempt(
        mode: mode, reason: reason, at: at, audioIndex: audioIndex, quality: quality,
        burnIn: burnIn, why: why, videoTo: videoTo, audioTo: audioTo)
    }
  }
  public func attempt(
    _ source: Source, plan: PlaybackStart?, reason: AttemptReason, audioIndex: Int?
  ) { update { $0.attempt(source, plan: plan, reason: reason, audioIndex: audioIndex) } }
  public func playing() { update { $0.playing() } }
  public func failed(_ error: ErrorDiagnostics) { update { $0.failed(error) } }
  public func closed() { update { $0.close() } }
  public func select(_ selection: SelectionDiagnostics) { update { $0.select(selection) } }
  public func capabilities(_ capabilities: CapabilityDiagnostics) {
    update { $0.capabilities(capabilities) }
  }
  public func tracks(_ tracks: [TrackDiagnostics]) { update { $0.tracks(tracks) } }
  public func decoder(_ decoder: DecoderDiagnostics) { update { $0.decoder(decoder) } }
  public func note(_ note: DiagnosticsNote) { update { $0.note(note) } }
}
@Observable @MainActor public final class PlaybackDiagnostics {
  public static let shared = PlaybackDiagnostics()
  public private(set) var report: PlaybackReport?
  private init() {}
  public static var latest: PlaybackReport? {
    get { shared.report }
    set { shared.report = newValue }
  }
  public static func publish(_ report: PlaybackReport) { latest = report }
  public static func clear() { shared.report = nil }
}

/// English keys stay stable so a report can be pasted into an issue.
public func formatReport(_ report: PlaybackReport) -> String {
  func opt<T>(_ value: T?) -> String { value.map { String(describing: $0) } ?? "unknown" }
  func list(_ values: [Safe]) -> String {
    values.isEmpty ? "none" : values.map(\.text).joined(separator: ",")
  }
  func yesNo(_ value: Bool) -> String { value ? "yes" : "no" }
  var lines = [
    "Matinee playback report v1",
    "privacy: codes and formats only; no titles, file names, addresses, accounts, or tokens",
  ]
  if let d = report.device {
    lines.append("app: \(opt(d.appVersion)) (\(d.appBuild), \(opt(d.buildType)))")
    lines.append("os: \(opt(d.osRelease)), \(opt(d.abi))")
    lines.append("device: \(opt(d.manufacturer)) \(opt(d.model))")
  }
  lines.append(
    report.mpvStatistics != nil || report.settings?.engine.text == "mpv"
      ? "player: mpv" : "player: AVPlayer; renderer and decoder names unavailable")
  if let s = report.settings {
    lines.append("engine: \(s.engine), decoders: \(s.decoders)")
    lines.append(
      "settings: quality=\(opt(s.quality)) video_codec=\(opt(s.videoCodec)) audio_codec=\(opt(s.audioCodec)) convert_audio=\(list(s.convertAudio))"
    )
  }
  if let f = report.file {
    if !f.probed {
      lines.append("file: container=\(opt(f.container)), not probed")
    } else {
      let size = f.width.flatMap { w in f.height.map { " \(w)x\($0)" } } ?? ""
      let depth = f.bitDepth.map { " \($0)bit" } ?? ""
      let dv = f.dolbyVisionProfile.map { " dv_profile=\($0)" } ?? ""
      lines.append(
        "file: container=\(opt(f.container)) video=\(f.videoCodec?.text ?? "none")\(f.videoProfile.map { " (\($0))" } ?? "")\(size)\(depth) hdr=\(f.hdr?.text ?? "none")\(dv)"
      )
      lines.append("file tracks: audio=\(list(f.audioCodecs)) subtitles=\(f.subtitleCount)")
    }
  }
  let sel = report.selection
  lines.append(
    "audio picked: "
      + (sel.audioIndex.map {
        "#\($0) \(opt(sel.audioCodec))\(sel.audioChannels.map { " \($0)ch" } ?? "")"
      } ?? "default"))
  lines.append(
    "subtitle picked: "
      + (sel.subtitleRendering.map {
        "\(opt(sel.subtitleFormat)) \(opt(sel.subtitleSource)) delivery=\(opt(sel.subtitleDelivery)) drawn_by=\($0.rawValue)"
      } ?? "off"))
  if let c = report.capabilities {
    lines.append(
      "device plays: video=\(list(c.videoCodecs)) audio=\(list(c.audioCodecs)) embedded_subtitles=\(list(c.embeddedSubtitles))"
    )
    lines.append(
      "asks for: stream_audio=\(list(c.streamAudioCodecs)) encode_video=\(list(c.encodeVideoCodecs))"
    )
    lines.append(
      "server offers: video=\(list(c.serverVideoCodecs)) audio=\(list(c.serverAudioCodecs))"
        + (c.maxBitrate.map { " max_bitrate=\($0 / 1000)kbps" } ?? ""))
  }
  lines.append(
    "attempts:"
      + (report.droppedAttempts > 0 ? " (\(report.droppedAttempts) earlier left out)" : ""))
  if report.attempts.isEmpty { lines.append("  none") }
  for a in report.attempts {
    var parts = [
      "\(a.number). \(a.mode.rawValue)", "reason=\(a.reason.rawValue)", "at=\(a.startAt)s",
    ]
    if let index = a.audioIndex { parts.append("audio=#\(index)") }
    if a.mode == .hls || a.mode == .encode { parts.append("quality=\(opt(a.quality))") }
    if a.burnIn { parts.append("burn_in=yes") }
    if !a.why.isEmpty { parts.append("why=\(list(a.why))") }
    if let to = a.videoTo { parts.append("video_to=\(to)") }
    if let to = a.audioTo { parts.append("audio_to=\(to)") }
    parts.append("-> \(a.outcome.rawValue)")
    lines.append("  " + parts.joined(separator: " "))
    if let error = a.error { lines.append("     error: " + formatError(error)) }
  }
  lines.append("tracks:")
  if report.tracks.isEmpty { lines.append("  none reported") }
  for track in report.tracks.prefix(MAX_TRACKS) { lines.append("  " + formatTrack(track)) }
  if !report.decoders.isEmpty {
    lines.append(
      "decoders: "
        + report.decoders.map { "\($0.type.rawValue)=\(opt($0.name))" }.joined(separator: ", "))
  }
  if !report.notes.isEmpty {
    lines.append(
      "notes: "
        + report.notes.keys.sorted { $0.rawValue < $1.rawValue }.map {
          "\($0.rawValue) x\(report.notes[$0] ?? 0)"
        }.joined(separator: ", "))
  }
  if let m = report.mpvStatistics {
    lines.append(
      "mpv: decoder=\(opt(m.decoder)) decode=\(opt(m.decode)) video_output=\(opt(m.videoOutput)) decoder_dropped_frames=\(opt(m.decoderDroppedFrames)) output_dropped_frames=\(opt(m.outputDroppedFrames)) samples=\(opt(m.samples)) active_audio=\(opt(m.activeAudioOrdinal)) audio_codec=\(opt(m.audioCodec))"
    )
  } else if report.settings?.engine.text != "mpv" {
    lines.append(
      "avplayer: status=\(opt(report.itemStatus)) dropped_frames=\(report.droppedFrames) stalls=\(report.stalls) indicated_bitrate=\(report.indicatedBitrate) observed_bitrate=\(report.observedBitrate)"
    )
    lines.append(
      "buffer: empty=\(yesNo(report.bufferEmpty)) full=\(yesNo(report.bufferFull)) likely_to_keep_up=\(yesNo(report.likelyToKeepUp)) seconds=\(report.bufferedSeconds)"
    )
  }
  if let seconds = report.firstFrameSeconds { lines.append("first_decoded_frame: \(seconds)s") }
  if !report.errorLogCodes.isEmpty {
    lines.append(
      "error log: "
        + zip(report.errorLogDomains, report.errorLogCodes).map { "\($0.0) (\($0.1))" }.joined(
          separator: ", "))
  }
  return lines.joined(separator: "\n") + "\n"
}
func formatTrack(_ t: TrackDiagnostics, selection: Bool = true) -> String {
  var parts = [t.type.rawValue]
  if selection { parts.append(t.selected ? "selected" : "not_selected") }
  if let mime = t.mime { parts.append(mime.text) }
  if !t.codec.isEmpty { parts.append("codecs=\(t.codec)") }
  if t.width > 0 && t.height > 0 { parts.append("\(t.width)x\(t.height)") }
  if let channels = t.channels, channels > 0 { parts.append("\(channels)ch") }
  if let rate = t.sampleRate, rate > 0 { parts.append("\(rate)Hz") }
  if let bitrate = t.bitrate, bitrate > 0 { parts.append("\(bitrate / 1000)kbps") }
  if let support = t.support { parts.append("support=\(support)") }
  for (key, value) in [
    ("profile", t.profile), ("level", t.level), ("primaries", t.colorPrimaries),
    ("transfer", t.transferFunction), ("hdr", t.hdr),
  ] {
    if let value { parts.append("\(key)=\(value)") }
  }
  if let depth = t.bitDepth { parts.append("\(depth)bit") }
  if let profile = t.dolbyVisionProfile { parts.append("dv_profile=\(profile)") }
  if let level = t.dolbyVisionLevel { parts.append("dv_level=\(level)") }
  if let layout = t.channelLayout { parts.append("channel_layout=\(layout)") }
  if let fps = t.frameRate { parts.append("fps=\(fps)") }
  return parts.joined(separator: " ")
}
func formatError(_ e: ErrorDiagnostics) -> String {
  var parts = ["\(e.name?.text ?? "unknown") (\(e.code))"]
  for (key, value) in [
    ("type", e.type), ("renderer", e.renderer), ("decoder", e.decoder),
    ("format_support", e.formatSupport),
  ] {
    if let value { parts.append("\(key)=\(value)") }
  }
  if let status = e.httpStatus { parts.append("http=\(status)") }
  if e.secureDecoder == true { parts.append("secure_decoder=yes") }
  if let format = e.format { parts.append("format=[\(formatTrack(format, selection: false))]") }
  if !e.causes.isEmpty {
    parts.append(
      "causes="
        + e.causes.prefix(MAX_CAUSES).enumerated().map { index, domain in
          domain.text + (index < e.causeCodes.count ? "(\(e.causeCodes[index]))" : "")
        }.joined(separator: ">"))
  }
  return parts.joined(separator: " ")
}
