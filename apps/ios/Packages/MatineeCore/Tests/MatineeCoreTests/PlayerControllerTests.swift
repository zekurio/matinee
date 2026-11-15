import AVFoundation
import Foundation
import Testing

@testable import MatineeCore

/// What a stubbed server got and answers. Each harness has its own host,
/// so tests running at once don't share one.
final class StubServer: @unchecked Sendable {
  struct Call {
    let method: String
    let path: String
    let body: Data
    var start: PlaybackStartInput? {
      try? JSONDecoder().decode(PlaybackStartInput.self, from: body)
    }
    var json: [String: Any] {
      (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
    }
  }
  struct Reply {
    var status = 200
    var body = Data("{}".utf8)
    var delay: TimeInterval = 0
    var offline = false
  }
  private let lock = NSLock()
  private var _calls: [Call] = []
  private var _respond: @Sendable (Call) -> Reply? = { _ in nil }
  private var _reportsReach = false
  var calls: [Call] { lock.withLock { _calls } }
  var starts: [PlaybackStartInput] {
    calls.compactMap { $0.path.hasSuffix("/playback/start") ? $0.start : nil }
  }
  var picks: [[String: Any]] {
    calls.filter { $0.path.hasSuffix("/tracks") && $0.method == "PUT" }.map(\.json)
  }
  var progress: [[String: Any]] { calls.filter { $0.path.hasSuffix("/progress") }.map(\.json) }
  /// Answers a call in place of the default server, or nil to leave it to the default.
  var respond: @Sendable (Call) -> Reply? {
    get { lock.withLock { _respond } }
    set { lock.withLock { _respond = newValue } }
  }
  /// Progress reports reach the server; by default it's offline for them.
  var reportsReach: Bool {
    get { lock.withLock { _reportsReach } }
    set { lock.withLock { _reportsReach = newValue } }
  }
  func record(_ call: Call) { lock.withLock { _calls.append(call) } }

  static let lock = NSLock()
  nonisolated(unsafe) static var hosts: [String: StubServer] = [:]
  static func make() -> (String, StubServer) {
    let host = "stub-\(UUID().uuidString.lowercased())"
    let server = StubServer()
    lock.withLock { hosts[host] = server }
    return (host, server)
  }
  static func of(_ host: String) -> StubServer? { lock.withLock { hosts[host] } }

  /// The tracks the stubbed file has, beside the two audio tracks of `Answers`.
  static let subtitleTracks = [Answers.vtt, Answers.pgsInFile, Answers.vobsub]

  /// Answers `playback.start` as the server would for these fixtures: the
  /// first method not failed, an encode for a quality or a burn-in, the
  /// subtitle the way its delivery says.
  func answer(_ input: PlaybackStartInput, host: String) -> PlaybackStart {
    let failed = input.failed ?? []
    let at = input.position ?? 42
    let quality = input.quality ?? ORIGINAL_QUALITY
    var subtitle = Self.subtitleTracks.first { $0.id == input.subtitle?.trackId }
    var mode: String?
    var method = ["direct", "remux", "transcode"].first { !failed.contains($0) } ?? "transcode"
    if subtitle?.delivery == SubtitleDelivery.burn_in {
      if failed.contains("transcode") {
        // The encode that burned it in failed, so it plays on without it.
        subtitle = nil
      } else {
        method = "transcode"
        mode = PlaybackSubtitleMode.burn_in
      }
    } else if subtitle?.delivery == SubtitleDelivery.pgs {
      mode = PlaybackSubtitleMode.player
    } else if subtitle != nil {
      mode = PlaybackSubtitleMode.client
    }
    var played = quality
    if quality != ORIGINAL_QUALITY {
      if failed.contains("transcode") { played = ORIGINAL_QUALITY } else { method = "transcode" }
    }
    if method == "transcode" && played == ORIGINAL_QUALITY && mode != PlaybackSubtitleMode.burn_in {
      played = "1080p-20"
    }
    let hls = method == "transcode"
    return Answers.plan(
      method: method, url: "/api/media/item-1/\(method)", hls: hls,
      offset: method == "remux" ? at : 0, start: method == "remux" ? 0 : at,
      audio: input.audio ?? 1, quality: played, subtitle: subtitle, subtitleMode: mode,
      subtitleUrl: mode == PlaybackSubtitleMode.client
        ? "/api/media/item-1/subtitles/\(subtitle!.id)" : nil,
      subtitleTracks: Self.subtitleTracks,
      qualities: [
        PlaybackQualityPreset(id: "720p-4", width: 1280, height: 720, bitrate: 4_000_000)
      ],
      item: Answers.item(duration: 3000), next: Answers.item("item-2"))
  }
}

private final class PlayerProtocol: URLProtocol, @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() { lock.withLock { cancelled = true } }
  override func startLoading() {
    let url = request.url!
    guard let server = StubServer.of(url.host!) else {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
      return
    }
    var body = request.httpBody ?? Data()
    if body.isEmpty, let stream = request.httpBodyStream {
      stream.open()
      defer { stream.close() }
      var buffer = [UInt8](repeating: 0, count: 4096)
      while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count <= 0 { break }
        body.append(contentsOf: buffer.prefix(count))
      }
    }
    let call = StubServer.Call(method: request.httpMethod ?? "GET", path: url.path, body: body)
    server.record(call)
    let reply = server.respond(call) ?? defaultReply(call, server: server, host: url.host!)
    let deliver: @Sendable () -> Void = { [self] in
      guard !lock.withLock({ cancelled }) else { return }
      if reply.offline {
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
        return
      }
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: url, statusCode: reply.status, httpVersion: nil,
          headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: reply.body)
      client?.urlProtocolDidFinishLoading(self)
    }
    if reply.delay > 0 {
      DispatchQueue.global().asyncAfter(deadline: .now() + reply.delay, execute: deliver)
    } else {
      deliver()
    }
  }
  private func defaultReply(_ call: StubServer.Call, server: StubServer, host: String)
    -> StubServer.Reply
  {
    let path = call.path
    if path.hasSuffix("/playback/start"), let input = call.start {
      if ["restricted", "busy"].contains(where: { host.hasPrefix($0) }) {
        let code = host.hasPrefix("busy") ? PLAYBACK_BUSY : PLAYBACK_RESTRICTED
        return .init(status: 403, body: Data("{\"code\":\"\(code)\",\"message\":\"Refused\"}".utf8))
      }
      return .init(body: try! JSONEncoder().encode(server.answer(input, host: host)))
    }
    if path.hasSuffix("/playback/options") {
      return .init(body: try! JSONEncoder().encode(FALLBACK_PLAYBACK_OPTIONS))
    }
    if path.hasSuffix("/playback/seek") {
      let at = call.json["position"] as? Double ?? 0
      return .init(body: Data("{\"url\":\"/seeked\",\"offset\":\(at)}".utf8))
    }
    if path.hasSuffix("/progress") {
      return server.reportsReach ? .init(status: 204, body: Data()) : .init(offline: true)
    }
    if path.contains("/subtitles/") {
      return .init(body: Data("WEBVTT\n\n00:00.000 --> 50:00.000\nHello\n".utf8))
    }
    if path.hasSuffix("/tracks") { return .init(status: 204, body: Data()) }
    return .init(status: 404, body: Data("{\"message\":\"Not here\"}".utf8))
  }
}

@MainActor private final class FakeEngine: AVPlaybackEngine {
  let player = AVPlayer()
  var isPlaying = false
  var isLoading = false
  var positionSeconds = 0.0
  var bufferedSeconds: Double?
  var videoSize = CGSize.zero
  var failure: (any Error)?
  var isReady = false
  var sources: [Source] = []
  let loading = AsyncStream<Source>.makeStream()
  var seeks: [Double] = []
  var rates: [Float] = []
  var audioPicks: [Int] = []
  var subtitlePicks: [Int?] = []
  var cleared = false
  /// The next load holds until released, as AVPlayer reading a file's tracks.
  var holdLoad = false
  /// The next load fails as AVPlayer does with -11850: the item fails before
  /// it seeks to its start, so its clock reads 0.
  var failNextLoad = false
  func load(_ source: Source, headers: [String: String]) async throws {
    sources.append(source)
    loading.continuation.yield(source)
    failure = nil
    positionSeconds = 0
    while holdLoad { try? await Task.sleep(for: .milliseconds(5)) }
    if failNextLoad {
      failNextLoad = false
      failure = URLError(.cannotDecodeContentData)
      return
    }
    isReady = true
    positionSeconds = source.start
  }
  func play(atRate rate: Float) {
    isPlaying = true
    rates.append(rate)
  }
  func pause() { isPlaying = false }
  func seek(_ seconds: Double) async {
    seeks.append(seconds)
    positionSeconds = seconds
  }
  func selectAudio(_ ordinal: Int) async { audioPicks.append(ordinal) }
  func selectSubtitle(_ ordinal: Int?) async { subtitlePicks.append(ordinal) }
  func hasVideoFrame() -> Bool { false }
  /// The file holds both audio tracks, the one picked inside it selected; a
  /// stream or an encode holds only the one it plays.
  func tracks() async -> [TrackDiagnostics] {
    guard let source = sources.last else { return [] }
    func track(_ type: TrackKind, _ codec: String, selected: Bool) -> TrackDiagnostics {
      var track = TrackDiagnostics(
        mediaType: type.rawValue, codec: codec, width: type == .video ? 1920 : 0,
        height: type == .video ? 1080 : 0, channels: type == .audio ? 2 : nil,
        sampleRate: type == .audio ? 48000 : nil)
      track.type = type
      track.selected = selected
      return track
    }
    let audio =
      source.holdsTracks
      ? ["aac ", "ac-3"].enumerated().map {
        track(.audio, $0.element, selected: $0.offset == (audioPicks.last ?? 0))
      } : [track(.audio, "aac ", selected: true)]
    return DiagnosticsProbe.trackDiagnostics([track(.video, "avc1", selected: true)] + audio)
  }
  func clear() { cleared = true }
}

@MainActor private final class FakeDownloads: PlayerDownloads {
  var queued: [(itemId: String, report: PendingReport, play: PlaybackOfflineInput.Play?)] = []
  var dropped: [(itemId: String, sessionId: String)] = []
  var subtitles: [SubtitleTrack] = []
  var saved: [String: URL] = [:]
  func playback(itemId: String) async throws -> LocalPlayback {
    LocalPlayback(
      item: Answers.item(itemId, duration: 100), file: URL(fileURLWithPath: "/tmp/fixture.mp4"),
      audio: [Answers.aac, Answers.ac3], subtitles: subtitles, saved: saved, at: 23)
  }
  func next(after item: MediaItem) async -> MediaItem? { Answers.item("item-2") }
  func previous(before item: MediaItem) async -> MediaItem? { Answers.item("item-0") }
  func queueReport(itemId: String, report: PendingReport, play: PlaybackOfflineInput.Play?) async {
    queued.append((itemId, report, play))
  }
  func reported(itemId: String, sessionId: String) async { dropped.append((itemId, sessionId)) }
}

@MainActor private final class PlayerHarness {
  var now = Date(timeIntervalSince1970: 1000)
  let engine = FakeEngine()
  let downloads = FakeDownloads()
  let host: String
  let server: StubServer
  let prefs = PlayerPrefs(defaults: UserDefaults(suiteName: UUID().uuidString)!)
  init(prefix: String = "") {
    let (host, server) = StubServer.make()
    self.host = prefix + host
    self.server = server
    if !prefix.isEmpty { StubServer.lock.withLock { StubServer.hosts[self.host] = server } }
  }
  func controller(token: String? = nil, offline: Bool = false) -> PlayerController {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PlayerProtocol.self]
    let api = MatineeApi(
      transport: ApiTransport(base: URL(string: "http://\(host)")!, configuration: configuration))
    return PlayerController(
      api: api,
      device: playbackProfile(
        snapshot: CapabilitySnapshot(codecs: DeviceCodecs(video: [], audio: [], dolbyVision: false))
      ), prefs: prefs, engine: engine, clock: { self.now }, tokenProvider: { token },
      downloads: downloads, session: URLSession(configuration: configuration), offline: offline)
  }
}

/// Waits for what a task launched without waiting, as a pick sent beside the call.
@MainActor private func eventually(_ check: () -> Bool) async {
  for _ in 0..<200 where !check() { try? await Task.sleep(for: .milliseconds(10)) }
}

@MainActor struct PlayerControllerTests {
  @Test func resumeFallbackSeekAndRetry() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    // Nil asks the server where the viewer stopped, which it answers with.
    #expect(harness.server.starts.first?.position == nil)
    #expect(harness.server.starts.first?.quality == ORIGINAL_QUALITY)
    #expect(controller.position == 42)
    #expect(controller.diagnostics.attempts.count == 1)
    await controller.seekTo(10)
    #expect(harness.engine.seeks.last == 10)
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.source?.method == "remux")
    await controller.seekTo(20)
    #expect(controller.source?.offset == 20)
    #expect(controller.source?.url.hasSuffix("/seeked") == true)
    // A new stream from `playback.seek` isn't an attempt of its own.
    #expect(controller.diagnostics.attempts.count == 2)
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.failedMethods == ["direct", "remux"])
    #expect(controller.source?.method == "transcode")
    await controller.seekTo(30)
    #expect(harness.engine.seeks.last == 30)
    await controller.retry()
    #expect(controller.failedMethods.isEmpty)
    #expect(controller.source?.method == "direct")
    #expect(harness.server.starts.last?.failed == [])
    await controller.stop()
    // The retry played, so closing leaves it played.
    #expect(controller.diagnostics.attempts.last?.outcome == .playing)
    #expect(controller.diagnostics.closed)
  }

  @Test func aSourceThatFailsBeforeItSeeksFallsBackFromWhereItWasAsked() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    harness.engine.holdLoad = true
    harness.engine.failNextLoad = true
    var loading = harness.engine.loading.stream.makeAsyncIterator()
    let opening = Task { await controller.start(itemId: "item-1", at: 30) }
    #expect(await loading.next()?.method == "direct")
    // A tick while the engine still reads the file leaves the position be.
    await controller.tick()
    #expect(controller.position == 30)
    harness.engine.holdLoad = false
    await opening.value
    await controller.tick()
    // Receiving the request is not enough: wait until its answer reaches the engine.
    #expect(await loading.next()?.method == "remux")
    #expect(harness.server.starts.last?.failed == ["direct"])
    #expect(harness.server.starts.last?.position == 30)
    #expect(controller.source?.method == "remux")
    await controller.stop()
  }

  @Test func anOpeningFromTheStartAsksForIt() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1", at: 0)
    #expect(harness.server.starts.first?.position == 0)
    #expect(controller.position == 0)
    await controller.stop()
  }

  @Test(arguments: ["restricted", "busy"]) func refusals(kind: String) async {
    let harness = PlayerHarness(prefix: "\(kind)-")
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.refusal == (kind == "busy" ? .busy : .restricted))
    #expect(controller.error != nil)
    #expect(harness.engine.sources.isEmpty)
    #expect(!harness.engine.isPlaying)
    await controller.stop()
  }

  @Test func nothingThisDevicePlays() async {
    let harness = PlayerHarness()
    harness.server.respond = { call in
      call.path.hasSuffix("/playback/start")
        ? .init(status: 422, body: Data("{\"code\":\"UNPLAYABLE\",\"message\":\"Nothing\"}".utf8))
        : nil
    }
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.unplayable)
    #expect(controller.error == "Nothing")
    #expect(controller.refusal == nil)
    #expect(controller.diagnostics.notes[.unplayable] == 1)
    harness.server.respond = { _ in nil }
    await controller.retry()
    #expect(controller.error == nil)
    #expect(!controller.unplayable)
    #expect(controller.source?.method == "direct")
    #expect(harness.server.starts.last?.position == nil)
    await controller.stop()
  }

  @Test func aSecondCallReplacesOneStillOnItsWay() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    harness.server.respond = { call in
      call.start?.quality == "720p-4" && call.start?.snap == PlaybackSnap.before
        ? .init(body: Data("{}".utf8), delay: 0.4) : nil
    }
    let pick = Task { await controller.pickQuality("720p-4") }
    await eventually { harness.server.starts.count == 2 }
    #expect(controller.quality == "720p-4")
    // The seek asks again with the pick, from where the viewer went.
    await controller.seekTo(600)
    await pick.value
    try? await Task.sleep(for: .milliseconds(500))
    let starts = harness.server.starts
    #expect(starts.count == 3)
    #expect(starts[2].quality == "720p-4")
    #expect(starts[2].position == 600)
    #expect(starts[2].snap == PlaybackSnap.nearest)
    // The stale answer, which can't even be decoded, never reached the player.
    #expect(controller.error == nil)
    #expect(controller.notice == nil)
    #expect(harness.engine.sources.count == 2)
    #expect(controller.source?.mode == .hls)
    #expect(controller.source?.start == 600)
    #expect(controller.position == 600)
    await controller.stop()
  }

  @Test func aSwitchThatFailsKeepsWhatPlays() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    harness.server.respond = { call in
      call.start?.quality == "720p-4"
        ? .init(status: 500, body: Data("{\"message\":\"Encoder busy\"}".utf8), delay: 0.2) : nil
    }
    let pick = Task { await controller.pickQuality("720p-4") }
    await eventually { harness.server.starts.count == 2 }
    // A seek while it's on its way asks again, and when that fails too it
    // goes to the source that plays.
    await controller.seekTo(100)
    await pick.value
    #expect(controller.notice?.kind == .switchFailed)
    #expect(controller.notice?.detail == "Encoder busy")
    #expect(controller.quality == ORIGINAL_QUALITY)
    #expect(controller.error == nil)
    #expect(harness.engine.sources.count == 1)
    #expect(harness.engine.seeks.last == 100)
    harness.server.respond = { _ in nil }
    await controller.pickAudio(Answers.ac3)
    // The failed pick was put back, so the next call doesn't carry it.
    #expect(harness.server.starts.last?.quality == ORIGINAL_QUALITY)
    await controller.stop()
  }

  @Test func audioPicks() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.audio == Answers.aac)
    #expect(harness.engine.audioPicks == [0])
    await controller.pickAudio(Answers.ac3)
    await eventually { !harness.server.picks.isEmpty }
    #expect(harness.server.picks.first?["audio"] as? Int == 2)
    #expect(harness.server.starts.last?.audio == 2)
    #expect(harness.server.starts.last?.position == 42)
    // The file holds both, so it plays on with the other picked inside it.
    #expect(harness.engine.sources.count == 1)
    #expect(harness.engine.audioPicks.last == 1)
    #expect(controller.audio == Answers.ac3)
    // The report follows the audio picked inside the file, and the pick.
    #expect(controller.diagnostics.tracks.filter { $0.type == .audio }.map(\.codec) == ["ac-3"])
    #expect(controller.diagnostics.tracks.allSatisfy { $0.selected })
    #expect(controller.diagnostics.selection.audioIndex == 2)
    #expect(controller.diagnostics.attempts.count == 1)
    let calls = harness.server.starts.count
    await controller.pickAudio(Answers.ac3)
    #expect(harness.server.starts.count == calls)
    // A copied stream carries one audio track, so another loads a new one.
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.source?.mode == .stream)
    await controller.pickAudio(Answers.aac)
    #expect(harness.engine.sources.count == 3)
    #expect(harness.server.starts.last?.failed == ["direct"])
    await controller.stop()
  }

  @Test func subtitleModesAndSwitches() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.subtitles.count == 3)
    // Text the view draws: the file plays on, the view gets the cues.
    await controller.pickSubtitle(Answers.vtt)
    await eventually { !harness.server.picks.isEmpty }
    #expect(
      (harness.server.picks.last?["subtitle"] as? [String: Any])?["trackId"] as? String == "sub-1")
    #expect(harness.server.starts.last?.subtitle?.trackId == "sub-1")
    #expect(harness.engine.sources.count == 1)
    #expect(controller.cues?.at(1).first?.text == "Hello")
    #expect(harness.engine.subtitlePicks.last == .some(nil))
    #expect(!controller.burnsIn(Answers.vtt))
    #expect(controller.burnsIn(Answers.vobsub))
    #expect(!controller.burnsIn(Answers.pgsInFile))
    // A stream of the file the engine draws: cues go, the engine shows it.
    await controller.pickSubtitle(Answers.pgsInFile)
    #expect(controller.cues == nil)
    #expect(harness.engine.subtitlePicks.last == .some(0))
    #expect(harness.engine.sources.count == 1)
    // Burned in: an encode, with nothing for the view or the engine to draw.
    await controller.pickSubtitle(Answers.vobsub)
    #expect(controller.plan?.subtitleMode == PlaybackSubtitleMode.burn_in)
    #expect(controller.source?.mode == .hls)
    #expect(harness.engine.sources.count == 2)
    #expect(controller.cues == nil)
    #expect(harness.engine.subtitlePicks.last == .some(nil))
    #expect(controller.burnsIn(Answers.vobsub))
    // Back to text: the file again, and its cues.
    await controller.pickSubtitle(Answers.vtt)
    #expect(controller.source?.mode == .direct)
    #expect(controller.cues != nil)
    // Off.
    await controller.pickSubtitle(nil)
    #expect(harness.server.starts.last?.subtitle == SubtitlePick(trackId: nil))
    #expect(controller.subtitle == nil)
    #expect(controller.cues == nil)
    await controller.stop()
  }

  @Test func aBurnInThatFailsPlaysOnWithout() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    await controller.pickSubtitle(Answers.vobsub)
    #expect(controller.source?.mode == .hls)
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(harness.server.starts.last?.failed == ["transcode"])
    #expect(controller.notice?.kind == .burnInFailed)
    #expect(controller.subtitle == nil)
    #expect(controller.source?.mode == .direct)
    // The pick is off now, for every call after.
    await controller.pickAudio(Answers.ac3)
    #expect(harness.server.starts.last?.subtitle == SubtitlePick(trackId: nil))
    // Picking it again tries encodes again, since the viewer asked.
    await controller.pickSubtitle(Answers.vobsub)
    #expect(harness.server.starts.last?.failed == [])
    #expect(controller.source?.mode == .hls)
    await controller.stop()
  }

  @Test func qualityPicks() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.qualities.map(\.id) == ["720p-4"])
    #expect(controller.offersOriginal)
    await controller.pickQuality("720p-4")
    #expect(harness.server.starts.last?.quality == "720p-4")
    // A quality isn't a track pick, so the server isn't told to remember it.
    #expect(harness.server.picks.isEmpty)
    #expect(controller.quality == "720p-4")
    #expect(controller.source?.mode == .hls)
    let calls = harness.server.starts.count
    await controller.pickQuality("720p-4")
    #expect(harness.server.starts.count == calls)
    // The encode fails and the original plays, so that's the pick now.
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.notice?.kind == .qualityFailed)
    #expect(controller.quality == ORIGINAL_QUALITY)
    await controller.pickAudio(Answers.ac3)
    #expect(harness.server.starts.last?.quality == ORIGINAL_QUALITY)
    await controller.stop()
  }

  @Test func aSourceReplacedMidSittingKeepsPositionAndPicks() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    await controller.pickAudio(Answers.ac3)
    await controller.pickSubtitle(Answers.vtt)
    await controller.seekTo(100)
    harness.engine.failure = URLError(.cannotDecodeContentData)
    await controller.tick()
    let input = harness.server.starts.last
    #expect(input?.position == 100)
    #expect(input?.audio == 2)
    #expect(input?.subtitle?.trackId == "sub-1")
    #expect(input?.failed == ["direct"])
    #expect(controller.source?.mode == .stream)
    #expect(controller.source?.offset == 100)
    #expect(controller.position == 100)
    #expect(controller.audio == Answers.ac3)
    #expect(controller.subtitle == Answers.vtt)
    #expect(controller.cues != nil)
    #expect(controller.diagnostics.attempts.map(\.outcome).first == .failed)
    // One failure asks once, while the next answer is on its way or after.
    await controller.tick()
    #expect(controller.failedMethods == ["direct"])
    await controller.stop()
  }

  /// Offline mode leaves the server alone though it answers: the reports
  /// wait with the downloads, where offline Home reads the place from.
  @Test func offlineModeKeepsReportsForLater() async {
    let harness = PlayerHarness()
    harness.server.reportsReach = true
    let controller = harness.controller(offline: true)
    await controller.startLocal(itemId: "item-1")
    harness.now += 10
    harness.engine.positionSeconds = 33
    await controller.tick()
    await controller.reporting?.value
    #expect(harness.server.progress.isEmpty)
    #expect(harness.downloads.queued.last?.report.positionSeconds == 33)
    await controller.stop()
    #expect(harness.downloads.queued.count >= 2)
    #expect(harness.server.calls.allSatisfy { !$0.path.contains("/trickplay") })
  }

  @Test func aDownloadResumesWhereItStopped() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.startLocal(itemId: "item-1")
    #expect(harness.engine.sources.first?.start == 23)
    await controller.stop()
    let again = PlayerHarness().controller()
    await again.startLocal(itemId: "item-1", at: 5)
    #expect(again.position == 5)
    await again.stop()
  }

  @Test func theCountdownToTheNextEpisode() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    var opened: [String] = []
    controller.onNext = { opened.append($0.id) }
    await controller.start(itemId: "item-1")
    #expect(controller.next?.id == "item-2")
    harness.engine.positionSeconds = 3000
    harness.engine.isPlaying = false
    await controller.tick()
    #expect(controller.ended)
    #expect(controller.nextCountdown == 10)
    harness.now += 9
    await controller.tick()
    #expect(controller.nextCountdown == 1)
    harness.now += 1
    await controller.tick()
    #expect(opened == ["item-2"])
    await controller.stop()

    let off = PlayerHarness()
    off.prefs.autoplayNext = false
    let waits = off.controller()
    await waits.start(itemId: "item-1")
    off.engine.positionSeconds = 3000
    off.engine.isPlaying = false
    await waits.tick()
    #expect(waits.ended)
    #expect(waits.nextCountdown == nil)
    waits.playNext()
    await waits.stop()
  }

  @Test func speed() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    controller.pickSpeed(2)
    #expect(controller.speed == 2)
    #expect(harness.engine.rates.last == 2)
    controller.pause()
    controller.pickSpeed(1.5)
    #expect(!harness.engine.isPlaying)
    controller.play()
    #expect(harness.engine.rates.last == 1.5)
    controller.pickSpeed(.nan)
    #expect(controller.speed == 1.5)
    // Time played counts at the speed it plays.
    await controller.tick()
    harness.now += 4
    await controller.tick()
    await controller.report()
    #expect(harness.server.progress.contains { $0["playedSeconds"] as? Double == 6 })
    await controller.stop()
  }

  @Test func scrubbingWithTrickplay() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    #expect(controller.trickplayFrame(at: 10) == nil)
    controller.trickplay = Trickplay(
      key: "k", width: 160, height: 90, columns: 10, rows: 10, count: 300, intervalSeconds: 10)
    controller.beginScrub()
    #expect(controller.scrubPosition == 42)
    controller.scrub(to: 1234)
    let frame = controller.trickplayFrame(at: controller.scrubPosition!)
    #expect(frame?.url.hasSuffix("/api/media/item-1/trickplay/k/1.jpg") == true)
    #expect(frame?.x == 3 * 160)
    #expect(frame?.y == 2 * 90)
    controller.scrub(to: 99_999)
    #expect(controller.scrubPosition == 3000)
    await controller.endScrub(commit: false)
    #expect(controller.scrubPosition == nil)
    #expect(harness.engine.seeks.isEmpty)
    controller.beginScrub()
    controller.scrub(to: 1234)
    await controller.endScrub()
    #expect(harness.engine.seeks == [1234])
    await controller.skip(10)
    #expect(harness.engine.seeks.last == 1244)
    await controller.stop()
  }

  @Test func aStalledSourceFallsBack() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    harness.engine.isLoading = true
    await controller.tick()
    harness.now += 15
    await controller.tick()
    #expect(controller.failedMethods.isEmpty)
    // Paused, a wait doesn't count.
    controller.pause()
    harness.now += 30
    await controller.tick()
    #expect(controller.failedMethods.isEmpty)
    controller.play()
    await controller.tick()
    harness.now += stallLimit + 1
    await controller.tick()
    #expect(controller.failedMethods == ["direct"])
    #expect(controller.source?.mode == .stream)
    await controller.stop()
  }

  @Test func offlinePlaybackToTheQueuedReports() async {
    let harness = PlayerHarness()
    harness.downloads.subtitles = [Answers.vtt]
    let vtt = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).vtt")
    try? "WEBVTT\n\n00:00.000 --> 01:00.000\nSaved\n".write(
      to: vtt, atomically: true, encoding: .utf8)
    harness.downloads.saved = ["sub-1": vtt]
    harness.prefs.quality = "720p-4"
    let controller = harness.controller()
    await controller.startLocal(itemId: "item-1")
    #expect(controller.isLocal)
    #expect(controller.position == 23)
    #expect(controller.source?.mode == .local)
    #expect(controller.audio == Answers.aac)
    #expect(controller.qualities.isEmpty)
    #expect(harness.server.starts.isEmpty)
    // Its tracks are picked inside the file, without asking the server.
    await controller.pickSubtitle(Answers.vtt)
    #expect(controller.cues?.at(1).first?.text == "Saved")
    await controller.pickAudio(Answers.ac3)
    #expect(harness.engine.audioPicks.last == 1)
    await controller.pickQuality("720p-4")
    #expect(harness.server.starts.isEmpty)
    #expect(harness.server.picks.isEmpty)
    await controller.tick()
    await controller.reporting?.value
    #expect(harness.downloads.queued.count == 1)
    #expect(harness.downloads.queued.last?.play == nil)
    harness.now += 1
    harness.engine.positionSeconds = 24
    await controller.tick()
    #expect(harness.downloads.queued.count == 1)
    harness.now += 9
    await controller.tick()
    await controller.reporting?.value
    #expect(harness.downloads.queued.count == 2)
    let queued = harness.downloads.queued.last
    #expect(queued?.report == PendingReport(positionSeconds: 24, durationSeconds: 100))
    #expect(queued?.play?.playedSeconds == 10)
    #expect(queued?.play?.positionSeconds == 24)
    #expect(queued?.play?.startedAt == "1970-01-01T00:16:40.000Z")
    #expect(queued?.play?.endedAt == "1970-01-01T00:16:50.000Z")
    controller.pause()
    await controller.tick()
    await controller.reporting?.value
    let paused = harness.downloads.queued.count
    harness.now += 29
    await controller.tick()
    #expect(harness.downloads.queued.count == paused)
    harness.now += 1
    await controller.tick()
    await controller.reporting?.value
    #expect(harness.downloads.queued.count == paused + 1)
    // Back online, a report that arrives clears what waited.
    harness.server.reportsReach = true
    await controller.report()
    #expect(harness.downloads.dropped.last?.itemId == "item-1")
    harness.server.reportsReach = false
    harness.engine.positionSeconds = 100
    harness.engine.isPlaying = false
    await eventually { controller.next != nil }
    await controller.tick()
    #expect(controller.nextCountdown == 10)
    harness.now += 4
    await controller.tick()
    #expect(controller.nextCountdown == 6)
    controller.cancelNext()
    harness.now += 10
    await controller.tick()
    #expect(controller.nextCountdown == nil)
    await controller.stop()
    // Reports launched earlier may arrive after it; one says it closed.
    #expect(harness.server.progress.contains { $0["closed"] as? Bool == true })
    #expect(harness.downloads.queued.contains { $0.report.positionSeconds == 100 })
    let count = harness.downloads.queued.count
    await controller.stop()
    #expect(harness.downloads.queued.count == count)
    #expect(harness.engine.cleared)
  }

  @Test func theViewsLifecycle() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    controller.sceneDidBecomeActive()
    #expect(controller.surfaceShown)
    #expect(harness.engine.isPlaying)
    // Picture in picture keeps it playing in the background.
    controller.pictureInPictureChanged(true)
    controller.sceneDidEnterBackground()
    #expect(!controller.surfaceShown)
    #expect(harness.engine.isPlaying)
    controller.pictureInPictureChanged(false)
    controller.sceneDidEnterBackground()
    #expect(!harness.engine.isPlaying)
    controller.sceneDidBecomeActive()
    controller.play()
    controller.audioInterruptionBegan()
    #expect(!harness.engine.isPlaying)
    controller.audioInterruptionEnded(shouldResume: true)
    #expect(harness.engine.isPlaying)
    controller.pause()
    controller.audioInterruptionBegan()
    controller.audioInterruptionEnded(shouldResume: true)
    #expect(!harness.engine.isPlaying)
    await controller.stop()
    #expect(!controller.playing)
    #expect(harness.engine.cleared)
  }

  @Test func aSittingsReport() async throws {
    let harness = PlayerHarness()
    let secret = try JSONDecoder().decode(
      MediaItem.self,
      from: Data(
        """
        {"id":"item-1","libraryId":"library-1","fileTitle":"Secret Heist",
         "relativePath":"Movies/Secret Heist (2024)/secret.heist.mkv","container":"mkv",
         "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2024-01-01T00:00:00Z",
         "durationSeconds":3000,"favorite":false,
         "title":{"id":"title-1","libraryId":"library-1","kind":"movie","name":"Secret Heist",
          "year":2024,"images":{},"genres":[],"favorite":false,"watched":false},
         "label":{"show":"movie","showName":"Secret Heist","showKey":"k","untitled":false,
          "group":"g","groupLabel":[]},
         "probe":{"format":{"name":"matroska,webm"},"video":{"index":0,"codec":"hevc",
          "profile":"Main 10","width":3840,"height":2160,"bitDepth":10,"hdr":"hdr10",
          "interlaced":false,"hdr10Plus":false,"masteringDisplay":false,"format":"HEVC",
          "resolution":"4K"},
          "audio":[{"index":1,"codec":"aac","channels":2,"default":true,"format":"AAC"},
           {"index":2,"codec":"ac3","channels":6,"default":false,"format":"AC3"}],
          "subtitles":[]}}
        """.utf8))
    let server = harness.server
    let options = PlaybackOptions(
      qualities: [], maxBitrate: 20_000_000, downloads: false, downloadVideoPresets: [],
      skipSteps: [], videoCodecs: ["h264", "hevc"], audioCodecs: ["aac", "opus"],
      audioLanguages: [], subtitleLanguages: [])
    server.respond = { call in
      if call.path.hasSuffix("/playback/options") {
        return .init(body: try! JSONEncoder().encode(options))
      }
      guard call.path.hasSuffix("/playback/start"), var input = call.start else { return nil }
      // The file fails over straight to an encode, as one only an encode plays.
      if input.failed?.contains("direct") == true { input.failed = ["direct", "remux"] }
      var answer = server.answer(input, host: "")
      answer.item = secret
      if answer.method == "transcode" {
        answer.reasons = ["failed"]
        answer.convertedAudio = "aac"
      }
      return .init(body: try! JSONEncoder().encode(answer))
    }
    let token = "tok-\(UUID().uuidString)"
    let controller = harness.controller(token: token)
    await controller.start(itemId: "item-1")
    #expect(controller.source?.mode == .direct)
    // Ready, the file shows its own tracks, the picked audio selected.
    #expect(controller.diagnostics.attempts.map(\.outcome) == [.playing])
    #expect(controller.diagnostics.tracks.map(\.codec) == ["avc1", "aac"])
    #expect(controller.diagnostics.tracks.allSatisfy { $0.selected })
    // A subtitle the view draws plays on in the file, and the selection says so.
    await controller.pickSubtitle(Answers.vtt)
    #expect(controller.diagnostics.attempts.count == 1)
    #expect(controller.diagnostics.selection.subtitleRendering == .screen)
    let failure = NSError(
      domain: AVFoundationErrorDomain, code: -11850,
      userInfo: [
        NSLocalizedDescriptionKey: "Secret Heist at http://\(harness.host)/a?token=\(token)",
        NSURLErrorKey: URL(string: "http://\(harness.host)/secret.heist.mkv")!,
        NSUnderlyingErrorKey: NSError(
          domain: NSOSStatusErrorDomain, code: -12847,
          userInfo: [NSUnderlyingErrorKey: NSError(domain: NSURLErrorDomain, code: -1100)]),
      ])
    await controller.sourceFailed(failure)
    #expect(controller.source?.mode == .hls)
    await controller.pickAudio(Answers.ac3)
    #expect(harness.engine.sources.count == 3)
    // A seek within HLS isn't an attempt.
    await controller.seekTo(600)
    #expect(harness.engine.seeks.last == 600)
    await controller.stop()

    let report = controller.diagnostics
    #expect(report.closed)
    #expect(report.attempts.map(\.number) == [1, 2, 3])
    #expect(report.attempts.map(\.mode) == [.direct, .hls, .hls])
    #expect(report.attempts.map(\.reason) == [.start, .fallback, .audioChange])
    #expect(report.attempts.map(\.outcome) == [.failed, .playing, .playing])
    #expect(report.attempts.map(\.audioIndex) == [1, 1, 2])
    #expect(report.attempts.map(\.startAt) == [42, 42, 42])
    #expect(report.attempts.map { $0.quality?.text } == ["original", "1080p-20", "1080p-20"])
    #expect(report.attempts.map { $0.why.map(\.text) } == [[], ["failed"], ["failed"]])
    #expect(report.attempts.map { $0.audioTo?.text } == [nil, "aac", "aac"])
    let error = try #require(report.attempts[0].error)
    #expect(error.code == -11850)
    #expect(error.name?.text == AVFoundationErrorDomain)
    #expect(error.causes.map(\.text) == [NSOSStatusErrorDomain, NSURLErrorDomain])
    #expect(error.causeCodes == [-12847, -1100])
    #expect(report.attempts[1].error == nil)
    #expect(
      report.selection
        == SelectionDiagnostics.of(audio: Answers.ac3, subtitle: Answers.vtt, rendering: .screen))
    #expect(report.capabilities == .of(controller.device, options: options))
    #expect(report.capabilities?.serverVideoCodecs.map(\.text) == ["h264", "hevc"])
    #expect(report.settings == SettingsDiagnostics(harness.prefs))
    #expect(report.file == .of(secret))
    // The encode carries the one audio it plays.
    #expect(report.tracks.map(\.type) == [.video, .audio])
    #expect(report.tracks.allSatisfy { $0.selected })

    let text = formatReport(report)
    for line in [
      "file: container=mkv video=hevc (Main 10) 3840x2160 10bit hdr=hdr10",
      "audio picked: #2 ac3 6ch",
      "subtitle picked: srt sidecar delivery=webvtt drawn_by=screen",
      "server offers: video=h264,hevc audio=aac,opus max_bitrate=20000kbps",
      "  1. direct reason=start at=42s audio=#1 -> failed",
      "     error: AVFoundationErrorDomain (-11850) type=source causes=NSOSStatusErrorDomain(-12847)>NSURLErrorDomain(-1100)",
      "  2. hls reason=fallback at=42s audio=#1 quality=1080p-20 why=failed audio_to=aac -> playing",
      "  3. hls reason=audio_change at=42s audio=#2 quality=1080p-20 why=failed audio_to=aac -> playing",
      "  video selected codecs=avc1 1920x1080",
      "  audio selected codecs=aac 2ch 48000.0Hz",
    ] { #expect(text.contains(line), "\(line)") }
    let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
    for secret in [
      "Secret", "Heist", "secret.heist", "Movies/", "2024", harness.host, "stub-", token, "tok-",
      "Bearer", "://", "item-1", "title-1", "library-1", "English",
    ] {
      #expect(!text.localizedCaseInsensitiveContains(secret), "\(secret)")
      #expect(!json.localizedCaseInsensitiveContains(secret), "\(secret)")
    }
  }
}

/// An episode of a show, which gets the previous and next episode buttons.
private func episode(_ id: String, duration: Double = 3000) -> MediaItem {
  let json = """
    {"id":"\(id)","libraryId":"library-1","fileTitle":"File","relativePath":"a.mkv","container":"mkv",
     "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2024-01-01T00:00:00Z","durationSeconds":\(duration),
     "favorite":false,"seasonNumber":1,"episodeNumber":2,
     "title":{"id":"title-1","libraryId":"library-1","kind":"show","name":"Show","images":{},"genres":[],
      "favorite":false,"watched":false},
     "label":{"show":"File","showName":"Show","showKey":"k","untitled":false,"group":"g","groupLabel":[]}}
    """
  return try! JSONDecoder().decode(MediaItem.self, from: Data(json.utf8))
}

/// The episode answers: segments, where to offer the next episode, and
/// the episodes either side, on top of the stub server's usual answer.
@MainActor private func episodeHarness(
  segments: [MediaSegment] = [], upNextAt: Double? = nil, previous: MediaItem? = Answers.item("item-0"),
  next: MediaItem? = Answers.item("item-2")
) -> PlayerHarness {
  let harness = PlayerHarness()
  let server = harness.server
  server.respond = { call in
    guard call.path.hasSuffix("/playback/start"), let input = call.start else { return nil }
    var answer = server.answer(input, host: "")
    answer.item = episode("item-1")
    answer.segments = segments
    answer.upNextAt = upNextAt
    answer.previous = previous
    answer.next = next
    return .init(body: try! JSONEncoder().encode(answer))
  }
  return harness
}

/// What `playback.start` now answers beside the source: the intro and
/// credits to skip, where the credits start, and the episodes either side.
/// The controller shows them when the server says and works none out.
@MainActor struct PlayerEpisodeTests {
  @Test func theSkipButtonFollowsTheServersSegments() async {
    let intro = MediaSegment(kind: MediaSegmentKind.intro, start: 10, end: 40)
    let credits = MediaSegment(kind: MediaSegmentKind.credits, start: 2700, end: 2900)
    let harness = episodeHarness(segments: [intro, credits])
    let controller = harness.controller()
    await controller.start(itemId: "item-1", at: 0)
    await controller.tick()
    #expect(controller.segment == nil)
    #expect(controller.skippable(controls: true) == nil)
    harness.engine.positionSeconds = 12
    await controller.tick()
    #expect(controller.segment == intro)
    // Fresh, it shows by itself, controls or not.
    #expect(controller.skippable(controls: false) == intro)
    harness.now += SKIP_SHOWN_SECONDS - 1
    await controller.tick()
    #expect(controller.skippable(controls: false) == intro)
    harness.now += 1
    await controller.tick()
    // After that, only with the controls.
    #expect(controller.skippable(controls: false) == nil)
    #expect(controller.skippable(controls: true) == intro)
    // The last second has nothing left worth skipping.
    harness.engine.positionSeconds = 39.5
    await controller.tick()
    #expect(controller.segment == nil)
    harness.engine.positionSeconds = 20
    await controller.tick()
    // Coming back into it, it's fresh again.
    #expect(controller.skippable(controls: false) == intro)
    await controller.skipSegment()
    #expect(harness.engine.seeks.last == 40)
    // The credits are a segment of their own.
    harness.engine.positionSeconds = 2750
    await controller.tick()
    #expect(controller.segment == credits)
    #expect(controller.skippable(controls: false) == credits)
    await controller.stop()
  }

  @Test func aDownloadHasNoSegments() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.startLocal(itemId: "item-1")
    harness.engine.positionSeconds = 30
    await controller.tick()
    #expect(controller.segment == nil)
    #expect(controller.upNextAt == nil)
    await controller.stop()
  }

  @Test func theNextEpisodeOnceTheCreditsStart() async {
    let harness = episodeHarness(upNextAt: 2700)
    let controller = harness.controller()
    var opened: [String] = []
    controller.onNext = { opened.append($0.id) }
    await controller.start(itemId: "item-1", at: 0)
    harness.engine.positionSeconds = 2699
    await controller.tick()
    #expect(!controller.offersNext)
    #expect(controller.upNext == nil)
    #expect(!controller.showsUpNext)
    harness.engine.positionSeconds = 2700
    await controller.tick()
    #expect(controller.offersNext)
    #expect(controller.showsUpNext)
    #expect(controller.upNext?.item.id == "item-2")
    #expect(controller.upNext?.early == true)
    // It counts down what's left of the file.
    #expect(controller.nextCountdown == 300)
    harness.engine.positionSeconds = 2990.5
    await controller.tick()
    #expect(controller.nextCountdown == 10)
    // Back before the credits, it goes, and comes back afresh.
    await controller.seekTo(100)
    await controller.tick()
    #expect(!controller.offersNext)
    #expect(controller.upNext == nil)
    harness.engine.positionSeconds = 2800
    await controller.tick()
    #expect(controller.nextCountdown == 200)
    // The countdown ran while the credits rolled, so the end starts it.
    harness.engine.positionSeconds = 3000
    harness.engine.isPlaying = false
    await controller.tick()
    #expect(controller.ended)
    #expect(opened == ["item-2"])
    await controller.stop()
  }

  @Test func hiddenWhileTheCreditsRollItWaitsAtTheEnd() async {
    let harness = episodeHarness(upNextAt: 2700)
    let controller = harness.controller()
    var opened: [String] = []
    controller.onNext = { opened.append($0.id) }
    await controller.start(itemId: "item-1", at: 0)
    harness.engine.positionSeconds = 2750
    await controller.tick()
    controller.hideNext()
    #expect(!controller.showsUpNext)
    #expect(controller.nextCountdown == nil)
    harness.engine.positionSeconds = 2800
    await controller.tick()
    #expect(!controller.showsUpNext)
    harness.engine.positionSeconds = 3000
    harness.engine.isPlaying = false
    await controller.tick()
    // Back at the end, waiting for Play.
    #expect(controller.showsUpNext)
    #expect(controller.nextCountdown == nil)
    harness.now += 30
    await controller.tick()
    #expect(opened.isEmpty)
    controller.playNext()
    #expect(opened == ["item-2"])
    await controller.stop()
  }

  @Test func withAutoplayOffTheCreditsOfferPlayAlone() async {
    let harness = episodeHarness(upNextAt: 2700)
    harness.prefs.autoplayNext = false
    let controller = harness.controller()
    var opened: [String] = []
    controller.onNext = { opened.append($0.id) }
    await controller.start(itemId: "item-1", at: 0)
    harness.engine.positionSeconds = 2750
    await controller.tick()
    #expect(controller.showsUpNext)
    #expect(controller.upNext?.cancelled == true)
    #expect(controller.nextCountdown == nil)
    harness.engine.positionSeconds = 3000
    harness.engine.isPlaying = false
    await controller.tick()
    harness.now += 30
    await controller.tick()
    #expect(opened.isEmpty)
    await controller.stop()
  }

  @Test func theLastEpisodeOffersNothing() async {
    let harness = episodeHarness(upNextAt: nil, next: nil)
    let controller = harness.controller()
    await controller.start(itemId: "item-1", at: 0)
    harness.engine.positionSeconds = 3000
    harness.engine.isPlaying = false
    await controller.tick()
    #expect(controller.ended)
    #expect(!controller.offersNext)
    #expect(controller.upNext == nil)
    #expect(controller.nextCountdown == nil)
    #expect(controller.previous?.id == "item-0")
    await controller.stop()
  }

  @Test func theEpisodesEitherSide() async {
    let harness = episodeHarness()
    let controller = harness.controller()
    var opened: [String] = []
    controller.onNext = { opened.append($0.id) }
    await controller.start(itemId: "item-1")
    #expect(controller.isEpisode)
    #expect(controller.previous?.id == "item-0")
    #expect(controller.next?.id == "item-2")
    controller.playPrevious()
    controller.playInstead(controller.next!)
    #expect(opened == ["item-0", "item-2"])
    await controller.stop()

    // A movie has neither, and no buttons for them.
    let movie = PlayerHarness().controller()
    await movie.start(itemId: "item-1")
    #expect(!movie.isEpisode)
    #expect(movie.previous == nil)
    movie.playPrevious()
    await movie.stop()

    // A download asks the downloads for both.
    let local = PlayerHarness().controller()
    await local.startLocal(itemId: "item-1")
    await eventually { local.previous != nil }
    #expect(local.previous?.id == "item-0")
    #expect(local.next?.id == "item-2")
    await local.stop()
  }

  @Test func aHeldFingerPlaysFaster() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item-1")
    // Not before the tick has seen it play.
    #expect(!controller.startHold())
    await controller.tick()
    #expect(controller.startHold())
    #expect(controller.holding)
    #expect(harness.engine.rates.last == HOLD_SPEED)
    #expect(!controller.startHold())
    // Time played counts at the speed it plays.
    harness.now += 4
    await controller.tick()
    controller.endHold()
    #expect(!controller.holding)
    #expect(harness.engine.rates.last == 1)
    await controller.report()
    #expect(harness.server.progress.contains { $0["playedSeconds"] as? Double == 8 })
    // Already as fast, there's nothing to hold for.
    controller.pickSpeed(2)
    #expect(!controller.startHold())
    // A pick of speed while holding ends the hold.
    controller.pickSpeed(1.25)
    #expect(controller.startHold())
    controller.pickSpeed(1.5)
    #expect(!controller.holding)
    controller.endHold()
    #expect(harness.engine.rates.last == 1.5)
    // Paused, it doesn't hold, and a hold the pause ended doesn't play again.
    #expect(controller.startHold())
    controller.pause()
    #expect(!controller.holding)
    let rates = harness.engine.rates.count
    controller.endHold()
    #expect(harness.engine.rates.count == rates)
    await controller.tick()
    #expect(!controller.startHold())
    await controller.stop()
  }
}

/// Android's SwipeTest.
struct SwipeTests {
  @Test func upRaisesAndDownLowers() {
    // A swipe across the whole range goes from nothing to full.
    #expect(abs(swipeLevel(start: 0, dragY: -SWIPE_FULL_RANGE * 1000, height: 1000) - 1) < 1e-9)
    #expect(swipeLevel(start: 0.5, dragY: 0, height: 1000) == 0.5)
    #expect(abs(swipeLevel(start: 0.5, dragY: SWIPE_FULL_RANGE * 100, height: 1000) - 0.4) < 1e-9)
  }

  @Test func levelStaysWithinRange() {
    #expect(swipeLevel(start: 0.9, dragY: -5000, height: 1000) == 1)
    #expect(swipeLevel(start: 0.1, dragY: 5000, height: 1000) == 0)
    #expect(swipeLevel(start: 3, dragY: 0, height: 1000) == 1)
    #expect(swipeLevel(start: .nan, dragY: 0, height: 1000) == 0)
    #expect(swipeLevel(start: 0.3, dragY: 50, height: 0) == 0.3)
    #expect(swipeLevel(start: 0.3, dragY: .nan, height: 1000) == 0.3)
  }

  @Test func sidewaysMovesByDistance() {
    #expect(swipeSeek(from: 100, dragX: 200, duration: 3600) == 100 + 200 * SWIPE_SECONDS_PER_POINT)
    #expect(swipeSeek(from: 100, dragX: -200, duration: 3600) == 100 - 200 * SWIPE_SECONDS_PER_POINT)
  }

  @Test func seekStaysWithinTheVideo() {
    #expect(swipeSeek(from: 10, dragX: -1000, duration: 3600) == 0)
    #expect(swipeSeek(from: 50, dragX: 1000, duration: 60) == 60)
    #expect(swipeSeek(from: 50, dragX: 100, duration: 0) == 0)
    #expect(swipeSeek(from: 50, dragX: .nan, duration: 60) == 50)
  }
}
