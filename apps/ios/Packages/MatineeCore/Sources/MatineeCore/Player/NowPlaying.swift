import AVFoundation
import MediaPlayer
import Foundation
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@MainActor public final class PlayerNowPlaying {
  private weak var controller: PlayerController?
  private let title: String
  private let subtitle: String?
  private var commands: [(MPRemoteCommand, Any)] = []
  private var observers: [NSObjectProtocol] = []
  private var artwork: MPMediaItemArtwork?
  private var artworkTask: Task<Void, Never>?
  public init(controller: PlayerController, title: String, subtitle: String? = nil) {
    self.controller = controller; self.title = title; self.subtitle = subtitle
    #if os(iOS)
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay])
    try? session.setActive(true)
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak controller] note in
      let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      Task { @MainActor in if type == AVAudioSession.InterruptionType.began.rawValue { controller?.pause() } }
    })
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak controller] note in
      let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
      Task { @MainActor in if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { controller?.pause() } }
    })
    #endif
    let center = MPRemoteCommandCenter.shared()
    bind(center.playCommand) { $0.play() }
    bind(center.pauseCommand) { $0.pause() }
    bind(center.togglePlayPauseCommand) { $0.togglePlay() }
    bind(center.nextTrackCommand) { $0.playNext() }
    center.skipBackwardCommand.preferredIntervals = [NSNumber(value: controller.preferences.skipBack)]
    center.skipForwardCommand.preferredIntervals = [NSNumber(value: controller.preferences.skipForward)]
    bind(center.skipBackwardCommand) { player in Task { await player.skip(-Double(player.preferences.skipBack)) } }
    bind(center.skipForwardCommand) { player in Task { await player.skip(Double(player.preferences.skipForward)) } }
    commands.append((center.changePlaybackPositionCommand, center.changePlaybackPositionCommand.addTarget { [weak controller] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      let at = event.positionTime
      Task { @MainActor in await controller?.seekTo(at) }
      return .success
    }))
    update()
  }
  public func loadArtwork(_ url: URL) {
    artworkTask?.cancel()
    artworkTask = Task { [weak self] in
      guard let self, let controller else { return }
      do {
        let request = await controller.mediaRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard !Task.isCancelled, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
        #if os(iOS)
        guard let image = UIImage(data: data) else { return }
        #else
        guard let image = NSImage(data: data) else { return }
        #endif
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        update()
      } catch { }
    }
  }
  private func bind(_ command: MPRemoteCommand, action: @escaping @MainActor @Sendable (PlayerController) -> Void) {
    command.isEnabled = true
    let target = command.addTarget { [weak controller] _ in
      Task { @MainActor in if let controller { action(controller) } }
      return .success
    }
    commands.append((command, target))
  }
  public func update() {
    guard let controller else { return }
    var info: [String: Any] = [MPMediaItemPropertyTitle: title, MPNowPlayingInfoPropertyElapsedPlaybackTime: controller.position,
      MPMediaItemPropertyPlaybackDuration: controller.duration, MPNowPlayingInfoPropertyPlaybackRate: controller.playing ? controller.speed : 0]
    info[MPMediaItemPropertyArtist] = subtitle
    info[MPMediaItemPropertyArtwork] = artwork
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
  public func stop() {
    artworkTask?.cancel(); artworkTask = nil
    for (command, target) in commands { command.removeTarget(target) }; commands = []
    for observer in observers { NotificationCenter.default.removeObserver(observer) }; observers = []
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    #if os(iOS)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    #endif
  }
}
