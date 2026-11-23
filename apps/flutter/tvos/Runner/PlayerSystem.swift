import Flutter
import Foundation

/// What the player asks of the device around the video, on an Apple TV:
/// the system's controls ([NowPlaying]) and the caption style. A TV has no
/// brightness or volume of the app's to set, and no small window.
final class PlayerSystem: PlayerSystemApi {
  private let events: PlayerSystemEventsApi
  private let player: PlayerBridge
  private lazy var media = NowPlaying { [weak self] command in self?.send(command) }
  /// When the last play or pause went to Dart, by the system's uptime.
  private var toggled: TimeInterval = 0

  init(messenger: FlutterBinaryMessenger, player: PlayerBridge) {
    events = PlayerSystemEventsApi(binaryMessenger: messenger)
    self.player = player
  }

  func levels() throws -> LevelsMessage { LevelsMessage(brightness: 1, volume: nil) }

  func setVolume(level: Double) throws -> Double { level }

  func setBrightness(brightness level: Double?) throws {}

  func hasPictureInPicture() throws -> Bool { false }

  func inPictureInPicture() throws -> Bool { false }

  func enterPictureInPicture() throws -> Bool { false }

  func setAutoPictureInPicture(enabled: Bool) throws {}

  func showMedia(info: MediaInfoMessage) throws { media.show(info) }

  func setMediaState(state: MediaStateMessage) throws { media.update(state) }

  func hideMedia() throws { media.hide() }

  /// The caption style in Settings > Accessibility > Subtitles and Captioning.
  func captionStyle() throws -> CaptionStyleMessage? { systemCaptionStyle() }

  /// tvOS has no way to open its Settings from an app.
  func openCaptionSettings() throws {}

  /// A session of the player opened. There is no small window to give it.
  func sessionOpened(_ session: PlayerBridge.Session) {}

  /// Play/Pause on the remote: a pause while the video plays or is about
  /// to, else a play.
  func playPausePressed() {
    guard let state = player.session?.state else { return }
    send(MediaCommandMessage(kind: state.wantsPlay ? .pause : .play))
  }

  /// One press can arrive twice: as a press to the view controller and as
  /// a command from the system's controls. The second would undo the first,
  /// so a play or pause within half a second of the last one is dropped.
  private func send(_ command: MediaCommandMessage) {
    if command.kind == .play || command.kind == .pause {
      let now = ProcessInfo.processInfo.systemUptime
      if now - toggled < 0.5 { return }
      toggled = now
    }
    if command.kind == .play { player.allowPlayInBackground() }
    Task { @MainActor [events] in
      // The player closed between the press and now.
      try? await events.mediaCommand(command: command)
    }
  }
}
