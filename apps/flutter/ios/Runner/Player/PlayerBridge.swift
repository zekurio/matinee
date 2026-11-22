import Flutter
import UIKit

/// Pigeon's host side of the player, as Android's `PlayerBridge`. Every call
/// from Dart arrives on the main thread, and so does every call into an
/// engine and every event sent back; mpv runs on its own queue inside
/// [MpvEngine].
///
/// One session is live at a time: the player the Dart side opened, whose
/// commands, events, and video carry its id. Anything for an older id is dropped.
final class PlayerBridge: PlayerApi {
  private let messenger: FlutterBinaryMessenger
  private let controller: () -> MatineeViewController?
  private var current: Session?
  private var foreground = UIApplication.shared.applicationState != .background
  private var observers: [NSObjectProtocol] = []
  /// Picture in picture and the system's controls, which follow the session.
  weak var system: PlayerSystem?

  init(messenger: FlutterBinaryMessenger, controller: @escaping () -> MatineeViewController?) {
    self.messenger = messenger
    self.controller = controller
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) {
        [weak self] _ in self?.enterBackground()
      })
    observers.append(
      center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) {
        [weak self] _ in self?.enterForeground()
      })
  }

  var session: Session? { current }

  func codecs() throws -> CodecCapabilitiesMessage { Capabilities.codecs }

  func deviceDiagnostics() throws -> DeviceDiagnosticsMessage { Capabilities.deviceDiagnostics() }

  func setFullscreen(owner: Int64, enabled: Bool) throws {
    controller()?.setFullscreen(owner: owner, enabled: enabled)
  }

  func open(session: Int64, request: OpenMessage) throws {
    guard !request.url.isEmpty else {
      throw PigeonError(code: "url", message: "A media URL is required.", details: nil)
    }
    closeCurrent(notify: true)
    let next = Session(id: session, events: PlayerEventsApi(binaryMessenger: messenger, messageChannelSuffix: "\(session)"))
    current = next
    next.emit(ActiveEngineMessage(engine: .mpv))
    next.emit(StateMessage(phase: .buffering, playing: false, wantsPlay: request.autoplay, serverUnavailable: false))
    // Media3 is Android's: an iPhone has mpv alone, whatever the request says.
    guard let flutterView = controller()?.view else {
      next.failed()
      return
    }
    let host = VideoHost(flutterView: flutterView)
    next.host = host
    host.setFit(request.fit)
    host.setViewport(request.viewport)
    let engine = MpvEngine(layer: host.layer, output: next)
    next.engine = engine
    var opened = request
    opened.autoplay = foreground && request.autoplay
    do {
      try engine.open(opened)
    } catch {
      next.failed()
      return
    }
    system?.sessionOpened(next)
  }

  func play(session: Int64) throws { if foreground { live(session)?.engine?.play() } }

  func pause(session: Int64) throws { live(session)?.engine?.pause() }

  func seekTo(session: Int64, positionMs: Int64) throws {
    guard let live = live(session) else { return }
    live.engine?.seek(to: max(positionMs, 0))
    live.pip?.invalidate()
  }

  func setRate(session: Int64, rate: Double) throws {
    guard (0.25...4).contains(rate) else {
      throw PigeonError(code: "rate", message: "Playback rate must be between 0.25× and 4×.", details: nil)
    }
    live(session)?.engine?.setRate(rate)
  }

  func selectAudioTrack(session: Int64, id: String?) throws { try live(session)?.engine?.selectAudioTrack(id) }

  func selectSubtitleTrack(session: Int64, id: String?) throws { try live(session)?.engine?.selectSubtitleTrack(id) }

  func setSourceTracks(session: Int64, tracks: SourceTracksMessage) throws {
    live(session)?.engine?.setSourceTracks(tracks)
  }

  func setSubtitleUrl(session: Int64, url: String?) throws { live(session)?.engine?.setSubtitleUrl(url) }

  func setVideoFit(session: Int64, fit: FitMessage) throws { live(session)?.host?.setFit(fit) }

  func setViewport(session: Int64, viewport: ViewportMessage?) throws { live(session)?.host?.setViewport(viewport) }

  func dispose(session: Int64) throws {
    if current?.id == session { closeCurrent(notify: false) }
  }

  /// Play pressed on the system's controls while the app is away: the sound
  /// plays on, as on Android, until the app goes away again.
  func allowPlayInBackground() {
    foreground = true
  }

  /// Pause the active source and any replacement that arrives while away,
  /// unless it plays on in the small window.
  private func enterBackground() {
    guard let current else {
      foreground = false
      return
    }
    if current.pip?.active == true || current.pip?.starting == true { return }
    foreground = false
    current.engine?.pause()
    current.engine?.setVideoEnabled(false)
  }

  private func enterForeground() {
    foreground = true
    current?.engine?.setVideoEnabled(true)
  }

  private func closeCurrent(notify: Bool) {
    guard let previous = current else { return }
    if notify {
      previous.emit(StateMessage(phase: .idle, playing: false, wantsPlay: false, serverUnavailable: false))
    }
    current = nil
    previous.close()
    UIApplication.shared.isIdleTimerDisabled = false
  }

  private func live(_ session: Int64) -> Session? { current?.id == session ? current : nil }

  /// One opened player: its engine, its video, and its events, which go out
  /// in the order they're emitted.
  final class Session: PlaybackOutput, PictureInPictureSource {
    let id: Int64
    private let events: PlayerEventsApi
    var engine: MpvEngine?
    var host: VideoHost?
    var pip: PictureInPicture?
    private var closed = false
    private(set) var state: StateMessage?
    private(set) var timeline: TimelineMessage?
    /// When [timeline] came, so the position can move on between them.
    private var timelineAt: TimeInterval = 0

    init(id: Int64, events: PlayerEventsApi) {
      self.id = id
      self.events = events
    }

    func failed() {
      emit(
        StateMessage(
          phase: .error, playing: false, wantsPlay: false, message: "Could not start the player.",
          serverUnavailable: false))
    }

    func emit(_ event: PlaybackEventMessage) {
      guard !closed else { return }
      if let state = event as? StateMessage {
        self.state = state
        // The screen stays on while the video moves or is about to.
        UIApplication.shared.isIdleTimerDisabled = state.playing || state.phase == .buffering
        pip?.invalidate()
      } else if let timeline = event as? TimelineMessage {
        self.timeline = timeline
        timelineAt = ProcessInfo.processInfo.systemUptime
      }
      // Pigeon's Flutter calls are main-actor tasks, which start in the
      // order they were made, so events keep their order.
      Task { @MainActor [events] in
        // The Dart side stopped listening to this session: nothing to tell.
        try? await events.onEvent(event: event)
      }
    }

    func close() {
      closed = true
      pip?.close()
      pip = nil
      engine?.close()
      host?.close()
    }

    var pipPlaying: Bool { state?.playing ?? false }

    var pipDurationSeconds: Double { Double(timeline?.durationMs ?? 0) / 1000 }

    var pipPositionSeconds: Double {
      guard let timeline else { return 0 }
      let since = pipPlaying ? ProcessInfo.processInfo.systemUptime - timelineAt : 0
      return Double(timeline.positionMs) / 1000 + since
    }
  }
}
