import AVFoundation
import Foundation
import Observation

/// A note over the picture about the last answer: its kind and, for some, the server's words.
public struct Notice: Sendable {
  public let kind: NoticeKind
  public let detail: String?
  public init(_ kind: NoticeKind, detail: String? = nil) {
    self.kind = kind
    self.detail = detail
  }
}

/// A `playback.start` with what changed since the last one.
struct Ask {
  /// Seconds into the file to start from; nil for where the viewer stopped,
  /// which only the opening asks for.
  var at: Double?
  /// What the report calls the source it loads; nil for a seek.
  var reason: PlayerController.AttemptReason?
  /// The viewer's picks that change.
  var picks: Picks?
  /// The method of the source that just failed.
  var failed: String?
  /// The answer whose source failed.
  var lost: PlaybackStart?
  var snap = PlaybackSnap.before
  /// Load the answer even when it's what plays, as a retry does.
  var reload = false
}

/// Plays one file as the server says: loads the source of each
/// `playback.start` answer into AVPlayer, asks again with the viewer's
/// picks and with the methods that failed, seeks in a copied stream with
/// `playback.seek`, draws the subtitles the answer gives the player, and
/// reports progress for Continue watching and the statistics. A download
/// plays from the device without asking.
///
/// Owns one sitting. Call `stop` before discarding it, including when
/// replacing it with the next episode. All positions are in the file's time.
/// The members follow `PlayerController.kt` in order; the extensions in
/// `PlayerController+Controls.swift` and `PlayerController+Background.swift`
/// carry on where this file stops, and `PlayerController+Screen.swift` has
/// what Android's player screen keeps itself.
@Observable @MainActor public final class PlayerController {
  /// Why a source loads, for the report. Kotlin's `AttemptReason` lives with
  /// the diagnostics, whose iOS report doesn't take one yet; until it does,
  /// only whether there is one counts: a seek within a stream records no attempt.
  enum AttemptReason { case start, fallback, retry, audioChange, subtitleChange, qualityChange }

  @ObservationIgnored let api: MatineeApi
  /// What this device plays, which every call to the server carries.
  @ObservationIgnored let device: PlaybackDevice
  /// This device's settings: the quality it starts at, autoplay, how subtitles look.
  @ObservationIgnored let prefs: PlayerPrefs
  @ObservationIgnored let token: @Sendable () async -> String?
  /// Where reports that don't reach the server wait, and where downloads come from.
  @ObservationIgnored let downloads: (any PlayerDownloads)?
  @ObservationIgnored let engine: any PlaybackEngine
  @ObservationIgnored let clock: @MainActor () -> Date
  /// Fetches subtitles; the tests' stubbed session in place of the shared one.
  @ObservationIgnored let session: URLSession
  /// The account's playback preferences, for a download's tracks and the skip steps.
  public let preferences: PlaybackPreferences

  /// The file this sitting plays; Kotlin has it from the opening.
  @ObservationIgnored var itemId: String?
  @ObservationIgnored var sessionId = UUID().uuidString
  /// Where the opening asked to start; nil resumes where the server says.
  @ObservationIgnored var openingAt: Double?
  /// When this sitting with the file began, for a play kept offline.
  @ObservationIgnored var startedAt = Date()

  /// Nil until the first answer or the download arrives.
  public internal(set) var item: MediaItem?

  /// The encodes the quality menu offers for this file, from the server's answer.
  public var qualities: [PlaybackQualityPreset] { plan?.qualities ?? [] }

  /// The quality menu offers the original: not for a file over the account's bit rate limit.
  public var offersOriginal: Bool { plan?.original ?? true }

  /// AVPlayer, for the view's `AVPlayerLayer`.
  public var player: AVPlayer { engine.player }

  /// Notices the picture freezing while playback runs on.
  @ObservationIgnored var freeze = FreezeWatch()

  /// A surface shows the video: not while the app is away and only the sound plays.
  public var surfaceShown = false

  /// Picture in picture shows the video, which counts as a surface.
  public var pictureInPictureActive = false

  /// A freeze of a download already got one seek in place to shake it loose.
  @ObservationIgnored var nudged = false

  /// The system's controls: Kotlin's media session and `PlaybackService`.
  @ObservationIgnored var nowPlaying: PlayerNowPlaying?

  /// The server's latest answer: the tracks, the subtitle, and the source it last loaded. Nil for a download.
  public internal(set) var plan: PlaybackStart?

  /// What the player loads now.
  public internal(set) var source: Source?

  /// The picks and failures every call carries.
  @ObservationIgnored var asking = Asking()

  /// The download that plays, when one does.
  @ObservationIgnored var local: LocalPlayback?

  /// A download's subtitle, which it picks itself.
  @ObservationIgnored var localSubtitle: SubtitleTrack?

  /// The audio in the menu: the viewer's pick, else the one that plays.
  public internal(set) var audio: AudioTrack?

  /// The subtitle in the menu: the viewer's pick, else the one that shows.
  public internal(set) var subtitle: SubtitleTrack?

  /// The quality in the menu: the one that plays, or the one on its way.
  public internal(set) var quality = ORIGINAL_QUALITY
  public internal(set) var cues: CueTrack?

  /// The track `cues` are for, or loading for.
  @ObservationIgnored var cuesFor: String?

  /// The video's shape, width over height, for placing subtitles on it.
  public internal(set) var videoAspect = 16.0 / 9.0
  public internal(set) var subtitleError = false
  public internal(set) var speed: Float = 1

  /// Seconds into the file.
  public internal(set) var position = 0.0

  /// How far the file is buffered, in its own time.
  public internal(set) var buffered = 0.0
  public internal(set) var playing = false
  public internal(set) var loading = true
  public internal(set) var ended = false

  /// Why nothing plays, once nothing is left to try.
  public internal(set) var error: String?

  /// The server found nothing this device plays. The view shows its own
  /// words for that in place of `error`, as Android's `player_unplayable`.
  public internal(set) var unplayable = false

  /// The server refused to play the file for this account, which `error` holds its words for. Trying again won't help.
  public internal(set) var refusal: Refusal?
  public internal(set) var notice: Notice?
  public internal(set) var trickplay: Trickplay?

  public var audioTracks: [AudioTrack] { plan?.audioTracks ?? local?.audio ?? [] }
  public var subtitles: [SubtitleTrack] { plan?.subtitleTracks ?? local?.subtitles ?? [] }

  /// The file after this one in its show, as the server answered, or as the downloads said for one.
  public var next: MediaItem? { plan?.next ?? localNext }

  public var duration: Double {
    item?.durationSeconds
      ?? player.currentItem.flatMap {
        let d = $0.duration.seconds
        return d.isFinite ? d + (source?.offset ?? 0) : nil
      } ?? 0
  }

  /// Where a switch or seek is headed, shown until the source for it loads.
  @ObservationIgnored var pendingAt: Double?

  /// The source failed, so nothing plays until another loads.
  @ObservationIgnored var sourceFailed = false
  @ObservationIgnored var playedSeconds = 0.0
  @ObservationIgnored var lastReport = Date.distantPast

  /// The `playback.start` on its way, which another replaces.
  @ObservationIgnored var askTask: Task<Result<PlaybackStart, any Error>, Never>?
  @ObservationIgnored var seekTask: Task<Result<PlaybackSeek, any Error>, Never>?

  /// Counts calls and loads, so an answer or a load that another replaced is dropped.
  @ObservationIgnored var asks = 0
  @ObservationIgnored var seeks = 0
  @ObservationIgnored var loads = 0

  /// The `playback.start` on its way, and the picks to put back if it fails.
  @ObservationIgnored var inFlight: (ask: Ask, undo: Asking)?

  /// Where the viewer sought while an answer was on its way, for when the source it answers is the one that plays.
  @ObservationIgnored var seekOnAnswer: Double?

  /// The report About shows of this sitting: codes and formats, never names or addresses.
  public internal(set) var diagnostics = PlaybackReport()

  // What Android's player screen keeps, and the iOS view reads here.
  public internal(set) var options = FALLBACK_PLAYBACK_OPTIONS
  public internal(set) var localNext: MediaItem?
  public internal(set) var nextCountdown: Int?
  public internal(set) var scrubPosition: Double?
  /// Stop this sitting and open the next item, as Android's `PlayerHost.playInstead`.
  public var onNext: (@MainActor (MediaItem) -> Void)?
  public var failedMethods: [String] { asking.failed }
  public var isLocal: Bool { local != nil }

  @ObservationIgnored var ticking: Task<Void, Never>?
  @ObservationIgnored var trickTask: Task<Void, Never>?
  @ObservationIgnored var nextTask: Task<Void, Never>?
  /// The last report and pick sent, which tests wait for.
  @ObservationIgnored var reporting: Task<Void, Never>?
  @ObservationIgnored var picking: Task<Void, Never>?
  @ObservationIgnored var stopped = false
  /// Kotlin's `playWhenReady`: the viewer wants it playing.
  @ObservationIgnored var wantPlay = true
  /// The viewer had it playing when an audio interruption began.
  @ObservationIgnored var resumeAfterInterruption = false
  @ObservationIgnored var stalledSince: Date?
  @ObservationIgnored var nextCancelled = false
  @ObservationIgnored var endedAt: Date?
  @ObservationIgnored var lastTick = Date()

  public init(
    api: MatineeApi, device: PlaybackDevice, prefs: PlayerPrefs,
    tokenProvider: @escaping @Sendable () async -> String? = { nil },
    downloads: (any PlayerDownloads)? = nil,
    preferences: PlaybackPreferences = DEFAULT_PLAYBACK_PREFERENCES
  ) {
    self.preferences = preferences
    self.api = api
    self.device = device
    self.prefs = prefs
    self.token = tokenProvider
    self.downloads = downloads
    self.clock = { Date() }
    session = .shared
    engine = AVPlayerEngine()
  }

  init(
    api: MatineeApi, device: PlaybackDevice, prefs: PlayerPrefs,
    engine: any PlaybackEngine, clock: @escaping @MainActor () -> Date,
    downloads: (any PlayerDownloads)? = nil,
    preferences: PlaybackPreferences = DEFAULT_PLAYBACK_PREFERENCES, session: URLSession = .shared
  ) {
    self.session = session
    self.api = api
    self.device = device
    self.prefs = prefs
    self.engine = engine
    self.clock = clock
    self.downloads = downloads
    self.preferences = preferences
    self.token = { nil }
  }

  deinit {
    ticking?.cancel()
    trickTask?.cancel()
    nextTask?.cancel()
  }

  /// Asks the server how the file plays, loads the answer's source, and
  /// plays. Android's screen asks for that first answer before it makes the
  /// controller; here the controller asks, so a refusal or a file nothing
  /// plays shows in `refusal` and `error`. `at` nil resumes where the server
  /// says the viewer stopped.
  public func start(itemId: String, at: Double? = nil, sessionId: String = UUID().uuidString) async
  {
    self.itemId = itemId
    self.sessionId = sessionId
    openingAt = at
    stopped = false
    wantPlay = true
    asking = Asking(picks: Picks(quality: prefs.quality))
    quality = prefs.quality
    lastTick = clock()
    startedAt = lastTick
    beginTick()
    loadTrickplay(itemId)
    if let available = try? await api.playback.options() { options = available }
    guard !stopped else { return }
    await request(Ask(at: at, reason: .start, reload: true), undo: asking)
  }

  /// Plays a download, from `at` seconds or where it stopped. Its audio
  /// and subtitle are picked here, as Android's screen picks them, since
  /// there's no server to ask.
  public func startLocal(itemId: String, at: Double? = nil) async {
    guard let downloads else { return }
    self.itemId = itemId
    stopped = false
    wantPlay = true
    lastTick = clock()
    startedAt = lastTick
    let local: LocalPlayback
    do {
      local = try await downloads.playback(itemId: itemId)
    } catch {
      self.error = error.localizedDescription
      return
    }
    guard !stopped else { return }
    self.local = local
    item = local.item
    audio = downloadAudio(
      local.audio, language: preferences.audioLanguage,
      originalLanguage: local.item.title?.originalLanguage,
      decodes: { [device] in device.audio.contains($0) || $0.hasPrefix("pcm_") })
    subtitle = downloadSubtitle(
      local.subtitles, audioLanguage: audio?.language, preferences: preferences)
    localSubtitle = subtitle
    beginTick()
    loadTrickplay(itemId)
    nextTask = Task { [weak self] in
      let next = await downloads.next(after: local.item)
      self?.localNext = next
    }
    await load(.local(url: local.file.absoluteString, at: at ?? local.at), reason: .start)
  }

  /// A path from an answer as an address on the server.
  func resolve(_ path: String) -> String { api.paths.server(path) }

  /// The session's header for the server's own addresses.
  func headers() async -> [String: String] {
    if let value = await token() { return ["Authorization": "Bearer \(value)"] }
    return [:]
  }

  /// Who draws the subtitle that shows: the answer's, or the download's.
  func shown() -> SubtitleShow {
    if let plan { return subtitleShow(plan) }
    guard let item, let track = localSubtitle else { return .off }
    return downloadSubtitleShow(track, url: api.paths.subtitle(item.id, trackId: track.id))
  }

  /// Whether `track` in the menu is burned into the picture: the one shown as the answer has it, else by its format alone.
  public func burnsIn(_ track: SubtitleTrack) -> Bool {
    let show = shown()
    if show.track?.id == track.id {
      if case .burned = show { return true }
      return false
    }
    return track.delivery == SubtitleDelivery.burn_in
  }

  /// Takes an answer: loads its source unless the one that plays is the
  /// same, and shows its tracks.
  func take(_ next: PlaybackStart, _ change: Ask) async {
    let previous = plan
    let sought = seekOnAnswer
    seekOnAnswer = nil
    let (settled, said) = asking.settle(lost: change.lost, plan: next)
    asking = settled
    plan = next
    item = next.item
    audio = next.audio
    subtitle = next.subtitle
    quality = next.quality
    if let said { notice = Notice(said) }
    if change.reload || source == nil || previous == nil || !sameSource(previous!, next) {
      await load(.of(next, resolve: resolve), reason: change.reason)
    } else {
      // The same source plays on, with the audio and subtitle answered.
      pendingAt = nil
      if source?.holdsTracks == true { await selectAudioInFile() }
      await showSubtitle()
      if let sought { await seekTo(sought) }
    }
  }

  /// Loads `next`; a `reason` records it as an attempt, which a seek within a stream isn't.
  func load(_ next: Source, reason: AttemptReason?) async {
    if reason != nil {
      diagnostics.attempt(method: next.method, offset: next.offset)
      diagnostics.settings = SettingsDiagnostics(prefs)
      diagnostics.capabilities = CapabilityDiagnostics(device)
      diagnostics.file = item.map(FileDiagnostics.init)
    }
    error = nil
    unplayable = false
    refusal = nil
    ended = false
    sourceFailed = false
    stalledSince = nil
    // A new source gets its own wait for frames.
    freeze.reset()
    pendingAt = nil
    source = next
    position = next.position
    loads += 1
    let request = loads
    if nowPlaying == nil, let item { enableNowPlaying(metadata(item)) }
    do {
      let headers = next.method == nil ? [:] : await headers()
      guard !stopped, request == loads else { return }
      try await engine.load(next, headers: headers)
      guard !stopped, request == loads else { return }
      // AVPlayer picks among the file's audio only once its tracks are known,
      // as ExoPlayer's pending override waits for `onTracksChanged`.
      if next.holdsTracks { await selectAudioInFile() }
      if wantPlay { engine.play(atRate: speed) }
      if let asset = player.currentItem?.asset,
        let tracks = try? await DiagnosticsProbe.tracks(asset), request == loads
      {
        diagnostics.tracks = tracks
      }
    } catch {
      if request == loads && !stopped { await sourceFailed(error) }
      return
    }
    guard !stopped, request == loads else { return }
    await showSubtitle()
  }

  /// Shows the subtitle the answer gives: the view draws WebVTT, the
  /// engine a stream of the file, and an encode brings a burned-in one along.
  func showSubtitle() async {
    let show = shown()
    var fetch: (SubtitleTrack, String)?
    if case .screen(let track, let url) = show {
      if cuesFor != track.id {
        cues = nil
        cuesFor = track.id
        fetch = (track, url)
      }
    } else {
      cues = nil
      cuesFor = nil
    }
    await applyTextOverride(show)
    if let (track, url) = fetch { await loadCues(track, url: url) }
  }

  /// Picks `audio` inside the file, for the file as it is.
  func selectAudioInFile() async {
    // AVFoundation's options carry no track id, so the audio goes by its
    // place among the file's audio tracks, ExoPlayer's fallback when ids don't match.
    guard let audio, let ordinal = audioTracks.firstIndex(of: audio) else { return }
    await engine.selectAudio(ordinal)
  }

  /// Lets AVPlayer draw the stream of the file the answer gives it, and
  /// keeps its own text output off otherwise: the view draws text tracks
  /// from the server's WebVTT, styled the viewer's way.
  func applyTextOverride(_ show: SubtitleShow) async {
    guard case .inFile(let track, _) = show else {
      await engine.selectSubtitle(nil)
      return
    }
    // The legible group lists the file's own subtitle streams in file order.
    let inFile = subtitles.compactMap { t in streamIndex(t).map { (t, $0) } }.sorted { $0.1 < $1.1 }
    await engine.selectSubtitle(inFile.firstIndex { $0.0.id == track.id })
  }

  /// Where the viewer is: where a switch or seek is headed, else where the video plays.
  func now() -> Double { pendingAt ?? position }

  /// What didn't play asks the server again with its method among the
  /// failed, and the server falls back: from the file to a stream, from a
  /// stream to an encode. A download has nothing to fall back to.
  func fallBack(_ cause: any Error) async {
    guard let current = source else { return }
    sourceFailed = true
    cancelSeek()
    // ExoPlayer stops on an error; AVPlayer can still be waiting on a stalled
    // item, so it pauses until the next source loads.
    engine.pause()
    guard let method = current.method else {
      error = cause.localizedDescription
      return
    }
    await ask(Ask(at: now(), reason: .fallback, failed: method, lost: plan))
  }

  /// What didn't play, as Kotlin's `onPlayerError`: the report notes it and
  /// the server falls back. The live test also calls it to exercise the
  /// chain without a client-side replacement source.
  public func sourceFailed(_ cause: any Error) async {
    diagnostics.failed(code: (cause as NSError).code)
    await fallBack(cause)
  }

  /// The picture froze while playback ran on. From the server, that source
  /// failed, and the server falls back as for an error. A download has
  /// nothing to fall back to, so it gets one seek in place first, which
  /// restarts the decoder; frozen again, it fails.
  func frozen() async {
    freeze.reset()
    guard let current = source else { return }
    if current.method == nil && !nudged {
      nudged = true
      await engine.seek(engine.positionSeconds)
      return
    }
    await sourceFailed(URLError(.cannotDecodeContentData))
  }

  /// Asks the server how the file plays with `change`, and takes its answer.
  func ask(_ change: Ask) async {
    guard local == nil, itemId != nil else { return }
    let undo = asking
    if let picks = change.picks { asking = asking.pick(picks, tracks: subtitles) }
    if let failed = change.failed { asking = asking.fail(failed) }
    await request(change, undo: undo)
  }

  /// Sends the call for `change`, in place of any still on its way. `undo` is what to put back if it fails.
  func request(_ change: Ask, undo: Asking) async {
    guard let itemId else { return }
    askTask?.cancel()
    cancelSeek()
    inFlight = (change, undo)
    pendingAt = change.at
    asks += 1
    let request = asks
    let input = asking.input(
      itemId: itemId, sessionId: sessionId, device: device, at: change.at, snap: change.snap)
    let task = Task { [api] () -> Result<PlaybackStart, any Error> in
      do { return .success(try await api.playback.start(playbackStartInput: input)) } catch {
        return .failure(error)
      }
    }
    askTask = task
    let result = await task.value
    // Another call took its place, or the player closed: this answer is stale.
    guard request == asks, !stopped else { return }
    askTask = nil
    switch result {
    case .success(let answer):
      inFlight = nil
      await take(answer, change)
    case .failure(let error):
      await refused(change, undo, error)
    }
  }

  /// A call that failed. When the source failed too, nothing plays, so the
  /// player says why, as when the server finds nothing this device plays.
  /// A switch that didn't go through leaves what plays, and says so. A
  /// refusal stops the player either way, with the server's words.
  func refused(_ change: Ask, _ undo: Asking, _ cause: any Error) async {
    inFlight = nil
    pendingAt = nil
    let unplayable = (cause as? ApiException)?.code == PLAYBACK_UNPLAYABLE
    let refusal = MatineeCore.refusal(cause)
    diagnostics.note(
      unplayable
        ? .unplayable
        : refusal == .restricted ? .restricted : refusal == .busy ? .tooManyStreams : .startFailed)
    let message = cause.localizedDescription
    let sought = seekOnAnswer
    seekOnAnswer = nil
    if let refusal {
      self.refusal = refusal
      error = message
      wantPlay = false
      engine.pause()
      return
    }
    // The opening has nothing playing to keep, as Android's screen fails
    // before its controller exists.
    if sourceFailed || change.failed != nil || plan == nil {
      self.unplayable = unplayable
      error = message
      return
    }
    asking = undo
    if let plan {
      audio = plan.audio
      subtitle = plan.subtitle
      quality = plan.quality
    }
    notice = Notice(.switchFailed, detail: message)
    // What plays stays, so a seek made meanwhile goes to it.
    if let sought { await seekTo(sought) }
  }

  /// Tries again from where it stopped, every method with it.
  public func retry() async {
    error = nil
    unplayable = false
    refusal = nil
    wantPlay = true
    if local != nil {
      if var current = source {
        current.start = position
        await load(current, reason: .retry)
      }
      return
    }
    asking = asking.forgetFailures()
    await ask(Ask(at: plan == nil ? openingAt : now(), reason: .retry, reload: true))
  }

  /// Stops a `playback.seek` on its way, whose answer no longer counts.
  func cancelSeek() {
    seekTask?.cancel()
    seekTask = nil
    seeks += 1
  }
}
