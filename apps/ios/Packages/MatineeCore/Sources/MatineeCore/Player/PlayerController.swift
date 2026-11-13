import AVFoundation
import Foundation
import Observation

public struct Notice: Sendable {
  public let kind: NoticeKind
  public let detail: String?
  public init(_ kind: NoticeKind, detail: String? = nil) { self.kind = kind; self.detail = detail }
}
public struct LocalPlayback: Sendable {
  public var item: MediaItem
  public var file: URL
  public var audio: [AudioTrack]
  public var subtitles: [SubtitleTrack]
  public var saved: [String: URL]
  public var at: Double
  public init(item: MediaItem, file: URL, audio: [AudioTrack], subtitles: [SubtitleTrack], saved: [String: URL], at: Double) {
    self.item = item; self.file = file; self.audio = audio; self.subtitles = subtitles; self.saved = saved; self.at = at
  }
}
@MainActor public protocol PlayerDownloads {
  func playback(itemId: String) async throws -> LocalPlayback
  func next(after item: MediaItem) async -> MediaItem?
  func queueReport(itemId: String, sessionId: String, position: Double, duration: Double?, played: Double, closed: Bool) async
}

extension PlayerDownloads {
  public func next(after item: MediaItem) async -> MediaItem? { nil }
}

/// Owns one sitting. Call stop before discarding it, including when replacing
/// it with the next episode. All positions exposed here use the file timeline.
@Observable @MainActor public final class PlayerController {
  public private(set) var plan: PlaybackStart?
  public private(set) var options = FALLBACK_PLAYBACK_OPTIONS
  public private(set) var localNext: MediaItem?
  public private(set) var source: Source?
  public private(set) var item: MediaItem?
  public private(set) var audio: AudioTrack?
  public private(set) var subtitle: SubtitleTrack?
  public private(set) var quality = ORIGINAL_QUALITY
  public private(set) var cues: CueTrack?
  public private(set) var subtitleError = false
  public private(set) var speed: Float = 1
  public private(set) var position = 0.0
  public private(set) var buffered = 0.0
  public private(set) var playing = false
  public private(set) var loading = true
  public private(set) var ended = false
  public private(set) var error: String?
  public private(set) var refusal: Refusal?
  public private(set) var notice: Notice?
  public private(set) var trickplay: Trickplay?
  public private(set) var nextCountdown: Int?
  public private(set) var scrubPosition: Double?
  public private(set) var diagnostics = PlaybackReport()
  public var onNext: (@MainActor (MediaItem) -> Void)?
  public var surfaceShown = false
  public var pictureInPictureActive = false
  public let preferences: PlaybackPreferences
  public var player: AVPlayer { engine.player }
  public var duration: Double { item?.durationSeconds ?? player.currentItem.flatMap { let d = $0.duration.seconds; return d.isFinite ? d + (source?.offset ?? 0) : nil } ?? 0 }
  public var audioTracks: [AudioTrack] { plan?.audioTracks ?? local?.audio ?? [] }
  public var subtitles: [SubtitleTrack] { plan?.subtitleTracks ?? local?.subtitles ?? [] }
  public var qualities: [PlaybackQualityPreset] { plan?.qualities ?? [] }
  public var offersOriginal: Bool { plan?.original ?? true }
  public var next: MediaItem? { plan?.next ?? localNext }
  public var isLocal: Bool { local != nil }
  public var videoAspect: Double { let size = player.currentItem?.presentationSize ?? .zero; return size.height > 0 ? size.width / size.height : 16 / 9 }
  public var failedMethods: [String] { asking.failed }
  @ObservationIgnored private let api: MatineeApi
  @ObservationIgnored private let device: PlaybackDevice
  @ObservationIgnored private let prefs: PlayerPrefs
  @ObservationIgnored private let token: @Sendable () async -> String?
  @ObservationIgnored private let downloads: (any PlayerDownloads)?
  @ObservationIgnored private let engine: any PlaybackEngine
  @ObservationIgnored private var ticking: Task<Void, Never>?
  @ObservationIgnored private var trickTask: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var askingNow = false
  @ObservationIgnored private var stopped = false
  @ObservationIgnored private var wantPlay = true
  @ObservationIgnored private var local: LocalPlayback?
  @ObservationIgnored private var asking = Asking()
  @ObservationIgnored private var sessionId = UUID().uuidString
  @ObservationIgnored private var playedSeconds = 0.0
  @ObservationIgnored private var lastReport = Date.distantPast
  @ObservationIgnored private var lastPosition = 0.0
  @ObservationIgnored private var stalledSince: Date?
  @ObservationIgnored private var nextCancelled = false
  @ObservationIgnored private var endedAt: Date?
  @ObservationIgnored private var nowPlaying: PlayerNowPlaying?
  @ObservationIgnored private var freeze = FreezeWatch()
  @ObservationIgnored private var lastTick = Date()
  @ObservationIgnored private var nudged = false

  public init(api: MatineeApi, device: PlaybackDevice, prefs: PlayerPrefs,
    tokenProvider: @escaping @Sendable () async -> String? = { nil }, downloads: (any PlayerDownloads)? = nil,
    preferences: PlaybackPreferences = DEFAULT_PLAYBACK_PREFERENCES) {
    self.preferences = preferences
    self.api = api; self.device = device; self.prefs = prefs; self.token = tokenProvider; self.downloads = downloads
    engine = AVPlayerEngine()
  }
  deinit { ticking?.cancel(); trickTask?.cancel() }

  public func start(itemId: String, at: Double? = nil, sessionId: String = UUID().uuidString) async {
    self.sessionId = sessionId; stopped = false; asking = Asking(picks: Picks(quality: prefs.quality))
    if let available = try? await api.playback.options() { options = available }
    await ask(itemId: itemId, at: at, reload: true)
    guard !stopped else { return }
    beginTick()
    trickTask?.cancel()
    trickTask = Task { [weak self, api] in
      do { for try await status in api.trickplayUntilSettled(itemId) { if case .ready(let ready) = status { self?.trickplay = ready.images } } } catch { }
    }
  }
  public func startLocal(itemId: String) async {
    guard let downloads else { return }
    do {
      let local = try await downloads.playback(itemId: itemId)
      self.local = local; item = local.item; stopped = false
      audio = downloadAudio(local.audio, language: preferences.audioLanguage, originalLanguage: local.item.title?.originalLanguage, decodes: { device.audio.contains($0) || $0.hasPrefix("pcm_") })
      localNext = await downloads.next(after: local.item)
      subtitle = downloadSubtitle(local.subtitles, audioLanguage: audio?.language, preferences: preferences)
      await load(.local(url: local.file.absoluteString, at: local.at))
      await showSubtitle(); beginTick()
    } catch { self.error = error.localizedDescription }
  }
  private func headers() async -> [String: String] { if let value = await token() { return ["Authorization": "Bearer \(value)"] }; return [:] }
  private func ask(itemId: String, at: Double?, reload: Bool = false, lost: PlaybackStart? = nil, undo: Asking? = nil, snap: String = PlaybackSnap.before) async {
    generation += 1; let request = generation
    askingNow = true
    defer { if request == generation { askingNow = false } }
    loading = true
    do {
      let answer = try await api.playback.start(playbackStartInput: asking.input(itemId: itemId, sessionId: sessionId, device: device, at: at, snap: snap))
      guard request == generation, !stopped else { return }
      let previous = plan
      let settled = asking.settle(lost: lost, plan: answer); asking = settled.0
      if let kind = settled.1 { notice = Notice(kind) }
      plan = answer; item = answer.item; audio = answer.audio; subtitle = answer.subtitle; quality = answer.quality
      if reload || previous == nil || !sameSource(previous!, answer) { await load(.of(answer, resolve: api.paths.server)) }
      else { await selectAudio() }
      guard request == generation else { return }
      await showSubtitle()
    } catch {
      guard request == generation, !stopped else { return }
      if let refused = MatineeCore.refusal(error) { refusal = refused; self.error = error.localizedDescription; pause() }
      else if let undo, lost == nil { asking = undo; notice = Notice(.switchFailed, detail: error.localizedDescription) }
      else { self.error = error.localizedDescription; pause() }
      loading = false
    }
  }
  private func load(_ next: Source) async {
    source = next; position = next.position; error = nil; refusal = nil; ended = false; stalledSince = nil; freeze.reset()
    let request = generation
    diagnostics.attempt(method: next.method, offset: next.offset)
    if nowPlaying == nil, let item { enableNowPlaying(title: item.label.title ?? item.fileTitle, subtitle: item.title?.name) }
    do {
      let headers = await headers()
      guard !stopped, request == generation else { return }
      try await engine.load(next, headers: headers)
      guard !stopped, request == generation else { return }
      await selectAudio()
      if let asset = player.currentItem?.asset, let tracks = try? await DiagnosticsProbe.tracks(asset), request == generation { diagnostics.tracks = tracks }
      if wantPlay { player.playImmediately(atRate: speed) }
    } catch { if request == generation && !stopped { await sourceFailed(error) } }
  }
  private func selectAudio() async {
    guard source?.holdsTracks == true, let audio, let ordinal = audioTracks.firstIndex(of: audio) else { return }
    await engine.selectAudio(ordinal)
  }
  private func showSubtitle() async {
    cues = nil; subtitleError = false
    let id = subtitle?.id
    let url: URL?
    if let local { url = id.flatMap { local.saved[$0] } }
    else if let plan, case .screen(_, let path) = subtitleShow(plan) { url = URL(string: api.paths.server(path)) }
    else { url = nil }
    guard let url else { return }
    do {
      let data: Data
      if url.isFileURL { data = try Data(contentsOf: url) }
      else {
        var request = URLRequest(url: url)
        for (key, value) in await headers() { request.setValue(value, forHTTPHeaderField: key) }
        let (body, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
        data = body
      }
      if subtitle?.id == id { cues = CueTrack.parse(String(decoding: data, as: UTF8.self)) }
    } catch { if subtitle?.id == id { subtitleError = true } }
  }
  public func play() { wantPlay = true; player.playImmediately(atRate: speed) }
  public func pause() { wantPlay = false; player.pause() }
  public func togglePlay() { playing ? pause() : play() }
  public func pickSpeed(_ rate: Float) { guard rate.isFinite, rate > 0 else { return }; speed = rate; if wantPlay { player.rate = rate } }
  public func seekTo(_ seconds: Double) async {
    guard let source, let item else { return }
    let at = seekClamp(seconds, duration: max(0, duration - 1)); ended = false; position = at; stalledSince = nil
    if askingNow { await ask(itemId: item.id, at: at, reload: true, snap: PlaybackSnap.nearest); return }
    switch source.seek {
    case .inSource: await engine.seek(max(0, at - source.offset))
    case .newStream:
      generation += 1; let request = generation
      do {
        let answer = try await api.playback.seek(playbackSeekInput: PlaybackSeekInput(itemId: item.id, sessionId: sessionId, audio: audio?.index ?? 0, position: at, snap: PlaybackSnap.nearest, audioCodecs: device.streamAudio))
        guard generation == request, !stopped else { return }
        var next = source; next.url = api.paths.server(answer.url); next.offset = answer.offset; next.start = 0
        await load(next)
      } catch { notice = Notice(.switchFailed, detail: error.localizedDescription) }
    case .newStart: await ask(itemId: item.id, at: at, reload: true, snap: PlaybackSnap.nearest)
    }
    await report()
  }
  public func skip(_ seconds: Double) async { await seekTo(position + seconds) }
  public func pickAudio(_ track: AudioTrack) async {
    guard let item else { return }
    if isLocal { audio = track; await selectAudio(); return }
    try? await api.playback.pickTracks(itemId: item.id, audio: track.index)
    await pick(Picks(audio: track.index))
  }
  public func pickSubtitle(_ track: SubtitleTrack?) async {
    guard let item else { return }
    if isLocal { subtitle = track; await showSubtitle(); return }
    let pick = SubtitlePick(trackId: track?.id)
    try? await api.playback.pickTracks(itemId: item.id, subtitle: pick)
    await self.pick(Picks(subtitle: pick))
  }
  public func pickQuality(_ id: String) async { if !isLocal { await pick(Picks(quality: id)) } }
  private func pick(_ change: Picks) async {
    guard let item else { return }; let undo = asking
    asking = asking.pick(change, tracks: subtitles)
    await ask(itemId: item.id, at: position, undo: undo)
  }
  public func retry() async {
    asking = asking.forgetFailures(); wantPlay = true
    if let item, !isLocal { await ask(itemId: item.id, at: position, reload: true) }
    else if var source { source.start = position; await load(source) }
  }
  /// Also used by the integration check to exercise fallback without inventing
  /// a client-side replacement source. Only the server chooses the next method.
  public func sourceFailed(_ cause: any Error) async {
    guard let source else { return }
    diagnostics.failed(code: (cause as NSError).code)
    guard let method = source.method, let item else { error = cause.localizedDescription; pause(); return }
    if asking.failed.contains(method) { error = cause.localizedDescription; pause(); return }
    player.pause(); asking = asking.fail(method)
    await ask(itemId: item.id, at: position, reload: true, lost: plan)
  }
  public func report(closed: Bool = false) async {
    guard let item, source != nil else { return }
    lastReport = Date()
    do { try await api.playback.report(itemId: item.id, positionSeconds: max(0, position), durationSeconds: duration > 0 ? duration : nil, sessionId: sessionId, playedSeconds: playedSeconds, paused: !playing, closed: closed ? true : nil) }
    catch { await downloads?.queueReport(itemId: item.id, sessionId: sessionId, position: position, duration: duration > 0 ? duration : nil, played: playedSeconds, closed: closed) }
  }
  public func burnsIn(_ track: SubtitleTrack) -> Bool {
    if subtitle?.id == track.id { return plan?.subtitleMode == PlaybackSubtitleMode.burn_in }
    return track.delivery != SubtitleDelivery.webvtt
  }
  public func dismissNotice() { notice = nil }
  public func beginScrub() { scrubPosition = position }
  public func scrub(to seconds: Double) { scrubPosition = seekClamp(seconds, duration: duration) }
  public func endScrub(commit: Bool = true) async {
    let target = scrubPosition; scrubPosition = nil
    if commit, let target { await seekTo(target) }
  }
  public func trickplayFrame(at seconds: Double) -> TrickplayFrame? {
    guard let images = trickplay, let item, images.intervalSeconds > 0,
      images.count > 0, images.columns > 0, images.rows > 0 else { return nil }
    let index = min(images.count - 1, max(0, Int(seekClamp(seconds, duration: duration) / images.intervalSeconds)))
    let perTile = images.columns * images.rows
    return TrickplayFrame(url: api.paths.trickplayTile(item.id, key: images.key, tile: index / perTile), x: index % images.columns * images.width, y: index % perTile / images.columns * images.height, width: images.width, height: images.height)
  }
  /// Use for artwork and trickplay image loading as well as media requests.
  public func mediaRequest(url: URL) async -> URLRequest {
    var request = URLRequest(url: url)
    guard url.scheme == api.base.scheme, url.host == api.base.host, url.port == api.base.port else { return request }
    for (key, value) in await headers() { request.setValue(value, forHTTPHeaderField: key) }
    return request
  }
  public func cancelNext() { nextCancelled = true; nextCountdown = nil }
  public func playNext() { guard let next else { return }; nextCancelled = true; nextCountdown = nil; onNext?(next) }
  public func enableNowPlaying(title: String, subtitle: String? = nil) {
    nowPlaying?.stop()
    nowPlaying = PlayerNowPlaying(controller: self, title: title, subtitle: subtitle)
    if let picture = item?.episode?.still ?? item?.title?.images.backdrop ?? item?.title?.images.poster,
      let url = URL(string: api.paths.artwork(picture.id)) { nowPlaying?.loadArtwork(url) }
  }
  public func stop() async {
    stopped = true; generation += 1; ticking?.cancel(); ticking = nil; trickTask?.cancel(); trickTask = nil
    engine.player.pause(); playing = false
    await report(closed: true); diagnostics.closed = true
    PlaybackDiagnostics.latest = diagnostics; nowPlaying?.stop(); nowPlaying = nil; engine.clear(); playing = false
  }
  private func beginTick() {
    ticking?.cancel()
    ticking = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled, let self else { return }
        await self.tick()
      }
    }
  }
  private func tick() async {
    guard !stopped, let source else { return }
    let wasPlaying = playing
    let now = Date(); let elapsed = now.timeIntervalSince(lastTick); lastTick = now
    playing = player.timeControlStatus == .playing
    loading = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    let clock = player.currentTime().seconds
    if clock.isFinite { position = source.offset + clock }
    if let range = player.currentItem?.loadedTimeRanges.last?.timeRangeValue { buffered = source.offset + range.start.seconds + range.duration.seconds }
    if playing && wasPlaying { playedSeconds += min(1, elapsed) * Double(speed) }
    if let failure = player.currentItem?.error { await sourceFailed(failure); return }
    let nowMs = Int64(ProcessInfo.processInfo.systemUptime * 1000)
    if surfaceShown || pictureInPictureActive, engine.hasVideoFrame() { freeze.frame(atMs: nowMs) }
    if freeze.check(nowMs: nowMs, playing: playing, shown: (surfaceShown || pictureInPictureActive) && (player.currentItem?.presentationSize.height ?? 0) > 0) {
      freeze.reset()
      if isLocal && !nudged { nudged = true; await engine.seek(clock) }
      else { await sourceFailed(URLError(.cannotDecodeContentData)); return }
    }
    if wantPlay && !ended && abs(position - lastPosition) < 0.01 {
      if stalledSince == nil { stalledSince = Date() }
      if Date().timeIntervalSince(stalledSince!) > 20 { await sourceFailed(URLError(.timedOut)); return }
    } else { stalledSince = nil }
    lastPosition = position
    ended = duration > 0 && position >= duration - 0.3 && !playing
    if ended, next != nil, prefs.autoplayNext, !nextCancelled {
      if endedAt == nil { endedAt = now }
      nextCountdown = max(0, 10 - Int(now.timeIntervalSince(endedAt!)))
      if nextCountdown == 0 { playNext() }
    } else if !ended { endedAt = nil; nextCountdown = nil }
    if wasPlaying != playing || Date().timeIntervalSince(lastReport) >= (playing ? 10 : 30) { await report() }
    diagnostics.sample(player)
    PlaybackDiagnostics.latest = diagnostics
    nowPlaying?.update()
  }
}
