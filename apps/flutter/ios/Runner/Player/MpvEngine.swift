// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import Foundation
import Libmpv
import MediaAccessibility
import OSLog

/// What an engine tells its session, on the main thread.
protocol PlaybackOutput: AnyObject {
  func emit(_ event: PlaybackEventMessage)
}

/// libmpv playing into a session's layer, as the Android `MpvEngine`. Calls
/// come on the main thread. mpv and the state it reads live on [queue]:
/// mpv's avfoundation output waits on the main thread at times, so the main
/// thread never waits on mpv, not even for a property.
final class MpvEngine {
  private static let log = Logger(subsystem: "io.github.zekurio.matinee", category: "mpv")
  private static let httpError = try! NSRegularExpression(pattern: #"\bHTTP error (\d{3})\b"#)
  private static let connectionError = try! NSRegularExpression(
    pattern: "Connection refused|Connection timed out|Network is unreachable|No route to host|Failed to resolve hostname",
    options: .caseInsensitive)

  private let queue = DispatchQueue(label: "io.github.zekurio.matinee.mpv", qos: .userInitiated)
  private let layer: AVSampleBufferDisplayLayer
  private weak var output: PlaybackOutput?
  private var observers: [NSObjectProtocol] = []

  // Main thread.
  private var closed = false
  /// The state last sent, for the interruption that has to know whether it played.
  private var shownState: StateMessage?
  /// Paused by an interruption, like a call, while it played.
  private var resumeAfterInterruption = false

  // The queue.
  private var mpv: OpaquePointer?
  private var wakeup: Unmanaged<Wakeup>?
  private var ticker: DispatchSourceTimer?
  private var loaded = false
  private var started = false
  private var ended = false
  private var failure: String?
  private var serverUnavailable = false
  /// The HTTP status FFmpeg last logged for this file, for the playback report.
  private var httpStatus: Int64?
  private var wantPause = true
  private var seekOnLoad: Int64?
  private var sidecarUrl: String?
  private var sourceTracks: SourceTracksMessage?
  /// The audio session's activation this engine last made.
  private var audioGeneration = 0
  private var lastState: StateMessage?
  private var lastTimeline: TimelineMessage?
  private var lastTracks: TracksMessage?
  private var lastVideo: VideoMessage?

  init(layer: AVSampleBufferDisplayLayer, output: PlaybackOutput) {
    self.layer = layer
    self.output = output
  }

  func open(_ request: OpenMessage) throws {
    guard request.headers.isEmpty else {
      throw PigeonError(code: "headers", message: "Authenticated mpv requests must use the playback relay.", details: nil)
    }
    observeAudioSession()
    let scale = request.systemSubtitleScale ? systemCaptionScale() : request.subtitleScale
    enqueue("initialize", fatal: true) { [self] in
      // Like Android's audio focus: without the session, nothing plays.
      let autoplay = request.autoplay && activateAudio()
      wantPause = !autoplay
      sourceTracks = request.tracks
      sidecarUrl = request.tracks?.subtitleUrl
      try create(request, autoplay: autoplay, subtitleScale: scale)
      try check(mpv_observe_property(mpv, 0, "track-list", MPV_FORMAT_NODE))
      try check(command(["loadfile", request.url, "replace"]))
      let ticker = DispatchSource.makeTimerSource(queue: queue)
      ticker.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(250))
      ticker.setEventHandler { [weak self] in self?.tick() }
      ticker.resume()
      self.ticker = ticker
    }
  }

  private func create(_ request: OpenMessage, autoplay: Bool, subtitleScale: Double) throws {
    guard let mpv = mpv_create() else { throw MpvFailure(code: MPV_ERROR_NOMEM.rawValue) }
    self.mpv = mpv
    var wid = Int64(Int(bitPattern: Unmanaged.passUnretained(layer).toOpaque()))
    try check(mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &wid))
    let software: Bool
    #if targetEnvironment(simulator)
      // The simulator has no VideoToolbox hardware.
      software = true
    #else
      software = request.softwareDecoders
    #endif
    var options: [(String, String)] = [
      ("vo", "avfoundation"),
      // Samples carry mpv's display time against a free-running timebase,
      // so audio drift never builds up in the output and a seek never moves
      // the layer's clock. Picture in picture maps that clock to the
      // position itself.
      ("avfoundation-presentation", "host"),
      // No per-frame Core Image composite of the subtitles inline; the
      // output draws them in a layer of their own.
      ("avfoundation-composite-osd", "no"),
      ("hwdec", software ? "no" : "videotoolbox"),
      ("hwdec-codecs", "all"),
      ("hwdec-software-fallback", "yes"),
      ("target-colorspace-hint", "auto"),
      // mpv re-expands its window title on every OSD update; nothing on iOS shows it.
      ("title", "mpv"),
      ("pause", autoplay ? "no" : "yes"),
      ("start", String(Double(max(request.startMs, 0)) / 1000)),
      // Tracks only as picked. Subtitles start off and nothing is found next to the file.
      ("sid", "no"),
      ("sub-auto", "no"),
      ("sub-delay", String(-(request.tracks?.subtitleOffset ?? 0))),
      ("sub-scale-with-window", "yes"),
      ("sub-scale", String(subtitleScale)),
      // Pause on the last frame at the end rather than unloading the file, so a seek still works.
      ("keep-open", "yes"),
      ("cache", "yes"),
      ("cache-pause-initial", "yes"),
      // Reads no config file. This libmpv has no Lua, so there are no
      // scripts or ytdl hook to turn off, as Android's does.
      ("config", "no"),
      // Only the loopback relay and saved files reach mpv here, and with no
      // CA bundle in this build a direct https address fails rather than
      // going unchecked.
      ("tls-verify", "yes"),
      ("demuxer-max-bytes", "64MiB"),
      ("demuxer-max-back-bytes", "32MiB"),
    ]
    #if os(tvOS)
      // An Apple TV keeps mpv's own order, AudioUnit first, which sends
      // multichannel PCM over HDMI. From tvOS 26 mpv-build's spatial output
      // goes ahead of it; the trailing comma keeps the rest after.
      if #available(tvOS 26, *) { options.append(("ao", "spatial,")) }
    #else
      // AVFoundation first: AudioUnit sizes its output from the route's
      // channels, which AirPods report as 2 even with Spatial Audio. From iOS
      // 26 mpv-build's spatial output takes TrueHD and DTS-HD first.
      if #available(iOS 26, *) {
        options.append(("ao", "spatial,avfoundation,audiounit"))
      } else {
        options.append(("ao", "avfoundation,audiounit"))
      }
    #endif
    for (name, value) in options {
      try check(mpv_set_option_string(mpv, name, value), name)
    }
    try check(mpv_request_log_messages(mpv, "warn"))
    try check(mpv_initialize(mpv))
    // mpv keeps the pointer without retaining it, so the box is released
    // only after mpv_terminate_destroy, on this queue.
    let box = Unmanaged.passRetained(Wakeup(engine: self))
    wakeup = box
    mpv_set_wakeup_callback(mpv, { context in
      guard let context else { return }
      Unmanaged<Wakeup>.fromOpaque(context).takeUnretainedValue().wake()
    }, box.toOpaque())
  }

  func play() {
    resumeAfterInterruption = false
    enqueue("play") { [self] in
      guard activateAudio() else { return }
      if ended || flag("eof-reached") == true {
        command(["seek", "0", "absolute+exact"])
        ended = false
        started = false
      }
      setPaused(false)
    }
  }

  func pause() {
    resumeAfterInterruption = false
    enqueue("pause") { [self] in setPaused(true) }
  }

  func seek(to positionMs: Int64) {
    enqueue("seek") { [self] in
      if loaded { seek(positionMs) } else { seekOnLoad = positionMs }
    }
  }

  func setRate(_ rate: Double) {
    enqueue("set playback rate") { [self] in
      mpv_set_property_string(mpv, "speed", String(rate))
      // AVFoundation's audio renderer holds about a second of sound and
      // plays it out at the old speed; a seek to where it is flushes it.
      if loaded, string("current-ao") == "avfoundation", let position = double("time-pos") {
        command(["seek", String(position), "absolute+exact"])
        mpv_set_property_string(mpv, "pause", wantPause ? "yes" : "no")
      }
    }
  }

  // The id is checked here so a bad one is an error for Dart, not a failed session.
  func selectAudioTrack(_ id: String?) throws {
    let selector = try trackSelector(id)
    enqueue("select audio") { [self] in mpv_set_property_string(mpv, "aid", selector) }
  }

  func selectSubtitleTrack(_ id: String?) throws {
    let selector = try trackSelector(id)
    enqueue("select subtitles") { [self] in mpv_set_property_string(mpv, "sid", selector) }
  }

  func setSourceTracks(_ tracks: SourceTracksMessage) {
    enqueue("set source tracks") { [self] in
      sourceTracks = tracks
      mpv_set_property_string(mpv, "sub-delay", String(-tracks.subtitleOffset))
      changeSidecar(tracks.subtitleUrl)
      publishTracks()
    }
  }

  func setSubtitleUrl(_ url: String?) {
    enqueue("set external subtitles") { [self] in changeSidecar(url) }
  }

  /// The small window shows only the display layer, so subtitles go into
  /// the frames while it's open.
  func compositeSubtitles(_ on: Bool) {
    enqueue("composite subtitles") { [self] in
      mpv_set_property_string(mpv, "avfoundation-pip-composite-osd", on ? "yes" : "no")
    }
  }

  /// With the app away and no small window, the output can't draw, and
  /// decoding for it stalls the sound, so the video track goes off until the
  /// app is back.
  func setVideoEnabled(_ on: Bool) {
    enqueue("set video output") { [self] in mpv_set_property_string(mpv, "vid", on ? "auto" : "no") }
  }

  func close() {
    guard !closed else { return }
    closed = true
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
    // The layer stays alive until mpv, which draws into it, is gone.
    let layer = self.layer
    queue.async { [self] in
      ticker?.cancel()
      ticker = nil
      if let mpv {
        mpv_set_wakeup_callback(mpv, nil, nil)
        mpv_terminate_destroy(mpv)
      }
      mpv = nil
      wakeup?.release()
      wakeup = nil
      withExtendedLifetime(layer) {}
      AudioSessionGate.release(audioGeneration)
    }
  }

  // MARK: The queue

  fileprivate func drain() {
    while let mpv, let event = mpv_wait_event(mpv, 0), event.pointee.event_id != MPV_EVENT_NONE {
      handle(event.pointee)
      if self.mpv == nil { return }
    }
  }

  private func handle(_ event: mpv_event) {
    switch event.event_id {
    case MPV_EVENT_START_FILE:
      loaded = false
      started = false
      ended = false
      serverUnavailable = false
      httpStatus = nil
    case MPV_EVENT_FILE_LOADED:
      loaded = true
      if let position = seekOnLoad { seek(position) }
      seekOnLoad = nil
      if let sidecarUrl { command(["sub-add", sidecarUrl, "select"]) }
      publishTracks()
    case MPV_EVENT_PLAYBACK_RESTART:
      started = true
      serverUnavailable = false
    case MPV_EVENT_END_FILE:
      guard let end = event.data?.assumingMemoryBound(to: mpv_event_end_file.self).pointee else { break }
      if end.reason == MPV_END_FILE_REASON_ERROR {
        let diagnostics = DiagnosticsMessage(error: diagnosticsOf(end.error))
        // Ahead of the error state, on the same queue, so the report has it first.
        deliver(diagnostics)
        fail(String(cString: mpv_error_string(end.error)), unreachable: serverUnavailable)
      } else if end.reason == MPV_END_FILE_REASON_EOF {
        ended = true
      }
    case MPV_EVENT_LOG_MESSAGE:
      guard let message = event.data?.assumingMemoryBound(to: mpv_event_log_message.self).pointee else { break }
      let prefix = message.prefix.map { String(cString: $0) } ?? ""
      let text = message.text.map { String(cString: $0) } ?? ""
      if message.log_level.rawValue <= MPV_LOG_LEVEL_ERROR.rawValue {
        Self.log.error("\(prefix, privacy: .public): \(text.trimmingCharacters(in: .newlines), privacy: .public)")
      }
      // libmpv gives a generic error at the end of the file. The HTTP error
      // or connection failure that led to it comes from FFmpeg's log.
      guard prefix.hasPrefix("ffmpeg") else { break }
      let range = NSRange(text.startIndex..., in: text)
      if let match = Self.httpError.firstMatch(in: text, range: range), let status = Range(match.range(at: 1), in: text) {
        httpStatus = Int64(text[status])
        serverUnavailable = text[status] == "502" || text[status] == "504"
      } else if Self.connectionError.firstMatch(in: text, range: range) != nil {
        serverUnavailable = true
      }
    case MPV_EVENT_PROPERTY_CHANGE:
      guard let property = event.data?.assumingMemoryBound(to: mpv_event_property.self).pointee else { break }
      if String(cString: property.name) == "track-list" { publishTracks() }
    default:
      break
    }
    publishPlayback()
  }

  private func tick() {
    guard mpv != nil, failure == nil else { return }
    publishPlayback()
  }

  private func changeSidecar(_ url: String?) {
    guard mpv != nil else { return }
    if loaded {
      let previous = sidecarId()
      if url != sidecarUrl {
        if let previous { command(["sub-remove", previous]) }
        if let url { command(["sub-add", url, "select"]) }
      } else if let previous {
        mpv_set_property_string(mpv, "sid", previous)
      }
    }
    sidecarUrl = url
  }

  private func setPaused(_ paused: Bool) {
    wantPause = paused
    mpv_set_property_string(mpv, "pause", paused ? "yes" : "no")
    publishPlayback()
  }

  private func seek(_ positionMs: Int64) {
    command(["seek", String(Double(positionMs) / 1000), "absolute+exact"])
    ended = false
    started = false
    // EOF pauses mpv internally. Seeking away from it should keep the viewer's intent.
    mpv_set_property_string(mpv, "pause", wantPause ? "yes" : "no")
  }

  private func publishPlayback() {
    guard mpv != nil, failure == nil else { return }
    let eof = ended || flag("eof-reached") == true
    let phase: PhaseMessage =
      if eof {
        .ended
      } else if !started || flag("seeking") == true || flag("paused-for-cache") == true {
        .buffering
      } else {
        .ready
      }
    // The viewer's pause, not mpv's own while it waits on the cache.
    publish(
      StateMessage(
        phase: phase, playing: phase == .ready && flag("pause") == false, wantsPlay: !wantPause,
        serverUnavailable: false), last: &lastState)
    guard loaded else { return }
    publish(
      TimelineMessage(
        positionMs: milliseconds(double("time-pos")) ?? 0, durationMs: milliseconds(double("duration")),
        bufferedMs: milliseconds(double("demuxer-cache-time"))), last: &lastTimeline)
    guard let width = int("width"), width > 0, let height = int("height"), height > 0 else { return }
    let fps = double("container-fps").flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
    publish(VideoMessage(width: width, height: height, frameRate: fps), last: &lastVideo)
  }

  private func publishTracks() {
    guard mpv != nil, let list = node("track-list") as? [Any] else { return }
    let tracks = list.compactMap { $0 as? [String: Any] }.filter {
      $0["id"] is Int64 && ["audio", "sub"].contains($0["type"] as? String)
    }
    let audio = tracks.filter { $0["type"] as? String == "audio" }
    let subtitles = tracks.filter { $0["type"] as? String == "sub" }
    if loaded, let plan = sourceTracks {
      func embedded(_ list: [[String: Any]], _ index: Int64?) -> [String: Any]? {
        guard let index else { return nil }
        return list.first { $0["external"] as? Bool != true && $0["ff-index"] as? Int64 == index }
      }
      if let sound = embedded(audio, plan.audioIndex), sound["selected"] as? Bool != true, let id = sound["id"] as? Int64 {
        mpv_set_property_string(mpv, "aid", String(id))
      }
      if plan.subtitleUrl == nil {
        let subtitle = embedded(subtitles, plan.subtitleIndex)
        if let subtitle, subtitle["selected"] as? Bool != true, let id = subtitle["id"] as? Int64 {
          mpv_set_property_string(mpv, "sid", String(id))
        } else if subtitle == nil && subtitles.contains(where: { $0["selected"] as? Bool == true }) {
          mpv_set_property_string(mpv, "sid", "no")
        }
      }
    }
    publish(TracksMessage(audio: audio.map(trackMessage), subtitles: subtitles.map(trackMessage)), last: &lastTracks)
  }

  private func sidecarId() -> String? {
    guard let list = node("track-list") as? [Any] else { return nil }
    let track = list.compactMap { $0 as? [String: Any] }.first {
      $0["type"] as? String == "sub" && $0["external"] as? Bool == true
        && $0["external-filename"] as? String == sidecarUrl
    }
    return (track?["id"] as? Int64).map { String($0) }
  }

  private func publish<Event: PlaybackEventMessage & Equatable>(_ event: Event, last: inout Event?) {
    guard event != last else { return }
    last = event
    deliver(event)
  }

  private func deliver(_ event: PlaybackEventMessage) {
    DispatchQueue.main.async { [weak self] in
      guard let self, !closed else { return }
      if let state = event as? StateMessage { shownState = state }
      output?.emit(event)
    }
  }

  private func enqueue(_ label: String, fatal: Bool = false, _ work: @escaping () throws -> Void) {
    guard !closed else { return }
    queue.async { [self] in
      guard fatal || mpv != nil else { return }
      do {
        try work()
      } catch {
        // A command the viewer sent failing is logged: mpv rejects some at
        // the wrong moment, and the next state it reports is the truth.
        Self.log.warning("Could not \(label, privacy: .public): \(String(describing: error), privacy: .public)")
        if fatal { fail("mpv could not \(label).") }
      }
    }
  }

  private func fail(_ message: String, unreachable: Bool = false) {
    guard failure == nil else { return }
    failure = message
    if let mpv { mpv_set_property_string(mpv, "pause", "yes") }
    publish(
      StateMessage(phase: .error, playing: false, wantsPlay: false, message: message, serverUnavailable: unreachable),
      last: &lastState)
  }

  /// mpv's error by its code and name, as `MPV_ERROR_LOADING_FAILED`, never its message.
  private func diagnosticsOf(_ code: Int32) -> ErrorDiagnosticsMessage {
    ErrorDiagnosticsMessage(
      code: Int64(code), name: mpvErrorNames[code].map { "MPV_ERROR_" + $0 }, type: "mpv", httpStatus: httpStatus,
      causes: [])
  }

  /// The audio session, as Android's audio focus. Activating it can wait
  /// on the audio server, so it happens here rather than on the main thread.
  private func activateAudio() -> Bool {
    guard let generation = AudioSessionGate.activate() else { return false }
    audioGeneration = generation
    return true
  }

  // MARK: Main thread

  private func observeAudioSession() {
    let center = NotificationCenter.default
    let session = AVAudioSession.sharedInstance()
    observers.append(
      center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) {
        [weak self] note in
        guard let self, !closed else { return }
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(
          AVAudioSession.InterruptionType.init)
        switch type {
        case .began:
          let resume = shownState?.wantsPlay ?? false
          pause()
          resumeAfterInterruption = resume
        case .ended:
          let options = AVAudioSession.InterruptionOptions(
            rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
          if resumeAfterInterruption && options.contains(.shouldResume) { play() }
          resumeAfterInterruption = false
        default:
          break
        }
      })
    // Headphones unplugged, as Android's becoming noisy.
    observers.append(
      center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) {
        [weak self] note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap(
          AVAudioSession.RouteChangeReason.init)
        if reason == .oldDeviceUnavailable { self?.pause() }
      })
  }

  // MARK: mpv's C API, on the queue

  @discardableResult
  private func command(_ args: [String]) -> Int32 {
    var pointers: [UnsafePointer<CChar>?] = args.map { UnsafePointer(strdup($0)) } + [nil]
    defer { for pointer in pointers { free(UnsafeMutablePointer(mutating: pointer)) } }
    return mpv_command(mpv, &pointers)
  }

  private func flag(_ name: String) -> Bool? {
    var value: Int32 = 0
    return mpv_get_property(mpv, name, MPV_FORMAT_FLAG, &value) >= 0 ? value != 0 : nil
  }

  private func double(_ name: String) -> Double? {
    var value = 0.0
    return mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &value) >= 0 ? value : nil
  }

  private func int(_ name: String) -> Int64? {
    var value: Int64 = 0
    return mpv_get_property(mpv, name, MPV_FORMAT_INT64, &value) >= 0 ? value : nil
  }

  private func string(_ name: String) -> String? {
    guard let value = mpv_get_property_string(mpv, name) else { return nil }
    defer { mpv_free(value) }
    return String(cString: value)
  }

  private func node(_ name: String) -> Any? {
    var value = mpv_node()
    guard mpv_get_property(mpv, name, MPV_FORMAT_NODE, &value) >= 0 else { return nil }
    defer { mpv_free_node_contents(&value) }
    return convert(value)
  }

  private func check(_ status: Int32, _ what: String? = nil) throws {
    if status < 0 { throw MpvFailure(code: status, option: what) }
  }
}

/// The app's one audio session, shared by the sessions one after another.
/// A closing engine lets it go only when no engine activated it since, so
/// the next video's sound isn't cut off by the last one's teardown.
private enum AudioSessionGate {
  private static let queue = DispatchQueue(label: "io.github.zekurio.matinee.audio-session")
  private static var generation = 0

  static func activate() -> Int? {
    queue.sync { () -> Int? in
      let session = AVAudioSession.sharedInstance()
      do {
        #if os(tvOS)
          // tvOS has no long-form policy for video; it plays to the TV.
          try session.setCategory(.playback, mode: .moviePlayback)
        #else
          // Long-form video lets the system offer AirPlay for the whole video.
          try session.setCategory(.playback, mode: .moviePlayback, policy: .longFormVideo)
        #endif
        try session.setActive(true)
        generation += 1
        return generation
      } catch {
        Logger(subsystem: "io.github.zekurio.matinee", category: "mpv").warning(
          "Could not activate the audio session: \(String(describing: error), privacy: .public)")
        return nil
      }
    }
  }

  /// Lets other apps' sound come back, unless a newer activation holds it.
  static func release(_ activation: Int) {
    queue.async {
      guard activation != 0, activation == generation else { return }
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
}

/// The caption size the system's accessibility settings ask for.
private func systemCaptionScale() -> Double {
  Double(MACaptionAppearanceGetRelativeCharacterSize(.user, nil))
}

private final class Wakeup {
  weak var engine: MpvEngine?
  init(engine: MpvEngine) { self.engine = engine }

  /// mpv calls this on a thread of its own and must not be kept waiting.
  func wake() {
    engine?.wakeQueue()
  }
}

extension MpvEngine {
  fileprivate func wakeQueue() {
    queue.async { [weak self] in self?.drain() }
  }
}

private struct MpvFailure: Error, CustomStringConvertible {
  let code: Int32
  var option: String?
  var description: String {
    "\(option.map { "\($0): " } ?? "")\(String(cString: mpv_error_string(code)))"
  }
}

/// mpv's error codes by the names client.h gives them.
private let mpvErrorNames: [Int32: String] = [
  -1: "EVENT_QUEUE_FULL", -2: "NOMEM", -3: "UNINITIALIZED", -4: "INVALID_PARAMETER", -5: "OPTION_NOT_FOUND",
  -6: "OPTION_FORMAT", -7: "OPTION_ERROR", -8: "PROPERTY_NOT_FOUND", -9: "PROPERTY_FORMAT",
  -10: "PROPERTY_UNAVAILABLE", -11: "PROPERTY_ERROR", -12: "COMMAND", -13: "LOADING_FAILED",
  -14: "AO_INIT_FAILED", -15: "VO_INIT_FAILED", -16: "NOTHING_TO_PLAY", -17: "UNKNOWN_FORMAT",
  -18: "UNSUPPORTED", -19: "NOT_IMPLEMENTED", -20: "GENERIC",
]

private func convert(_ node: mpv_node) -> Any? {
  switch node.format {
  case MPV_FORMAT_STRING: return node.u.string.map { String(cString: $0) }
  case MPV_FORMAT_FLAG: return node.u.flag != 0
  case MPV_FORMAT_INT64: return node.u.int64
  case MPV_FORMAT_DOUBLE: return node.u.double_
  case MPV_FORMAT_NODE_ARRAY:
    guard let list = node.u.list?.pointee else { return [Any]() }
    return (0..<Int(list.num)).compactMap { convert(list.values[$0]) }
  case MPV_FORMAT_NODE_MAP:
    guard let list = node.u.list?.pointee else { return [String: Any]() }
    var map: [String: Any] = [:]
    for index in 0..<Int(list.num) {
      if let key = list.keys[index], let value = convert(list.values[index]) { map[String(cString: key)] = value }
    }
    return map
  default: return nil
  }
}

private func milliseconds(_ seconds: Double?) -> Int64? {
  guard let seconds, seconds.isFinite, seconds >= 0 else { return nil }
  return Int64((seconds * 1000).rounded())
}

private func trackSelector(_ id: String?) throws -> String {
  guard let id else { return "no" }
  guard let number = Int(id) else { throw PigeonError(code: "track", message: "Unknown track \(id).", details: nil) }
  return String(number)
}

private func trackMessage(_ track: [String: Any]) -> TrackMessage {
  func text(_ key: String) -> String? {
    (track[key] as? String).flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
  }
  return TrackMessage(
    id: String(track["id"] as? Int64 ?? 0), language: text("lang"), title: text("title"), codec: text("codec"),
    isDefault: track["default"] as? Bool ?? false, isForced: track["forced"] as? Bool ?? false,
    selected: track["selected"] as? Bool ?? false)
}
