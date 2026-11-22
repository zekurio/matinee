import Foundation
import ImageIO
import MediaPlayer
import UIKit

/// The video on the lock screen, in Control Center, and to headsets and
/// AirPlay, as Android's `MediaControls` and the SwiftUI app's
/// `PlayerNowPlaying`: Dart says what plays and where it is, and gets each
/// press back to do its own way. Main thread only.
final class NowPlaying {
  private let send: (MediaCommandMessage) -> Void
  private let center = MPRemoteCommandCenter.shared()
  private var targets: [(MPRemoteCommand, Any)] = []
  private var info: MediaInfoMessage?
  private var state: MediaStateMessage?
  private var artwork: MPMediaItemArtwork?
  private var artworkTask: Task<Void, Never>?

  init(send: @escaping (MediaCommandMessage) -> Void) {
    self.send = send
  }

  func show(_ info: MediaInfoMessage) {
    if targets.isEmpty { install() }
    if info.artworkUrl != self.info?.artworkUrl { loadArtwork(info) }
    self.info = info
    center.skipBackwardCommand.isEnabled = info.backMs != nil
    center.skipForwardCommand.isEnabled = info.aheadMs != nil
    if let back = info.backMs { center.skipBackwardCommand.preferredIntervals = [NSNumber(value: Double(back) / 1000)] }
    if let ahead = info.aheadMs { center.skipForwardCommand.preferredIntervals = [NSNumber(value: Double(ahead) / 1000)] }
    publish()
  }

  func update(_ state: MediaStateMessage) {
    self.state = state
    publish()
  }

  func hide() {
    for (command, target) in targets {
      command.removeTarget(target)
      command.isEnabled = false
    }
    targets.removeAll()
    artworkTask?.cancel()
    artworkTask = nil
    artwork = nil
    info = nil
    state = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }

  private func install() {
    add(center.playCommand) { _ in MediaCommandMessage(kind: .play) }
    add(center.pauseCommand) { _ in MediaCommandMessage(kind: .pause) }
    add(center.togglePlayPauseCommand) { [weak self] _ in
      MediaCommandMessage(kind: self?.state?.playing == true ? .pause : .play)
    }
    add(center.skipBackwardCommand) { _ in MediaCommandMessage(kind: .back) }
    add(center.skipForwardCommand) { _ in MediaCommandMessage(kind: .ahead) }
    add(center.changePlaybackPositionCommand) { event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent, event.positionTime.isFinite else { return nil }
      return MediaCommandMessage(kind: .seekTo, positionMs: Int64(max(event.positionTime, 0) * 1000))
    }
  }

  /// MediaPlayer can call a handler on a queue of its own, so the press
  /// is read and sent on the main thread.
  private func add(_ command: MPRemoteCommand, _ message: @escaping (MPRemoteCommandEvent) -> MediaCommandMessage?) {
    command.isEnabled = true
    let target = command.addTarget { [weak self] event in
      DispatchQueue.main.async {
        guard let self, info != nil, let message = message(event) else { return }
        send(message)
      }
      return .success
    }
    targets.append((command, target))
  }

  private func publish() {
    guard let info else { return }
    let rate = state?.rate ?? 1
    var now: [String: Any] = [
      MPMediaItemPropertyTitle: info.title,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: Double(state?.positionMs ?? 0) / 1000,
      // The system moves the position on at this rate, so it's 0 while not moving.
      MPNowPlayingInfoPropertyPlaybackRate: state?.playing == true && state?.phase == .ready ? rate : 0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: rate,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
    ]
    if let duration = state?.durationMs { now[MPMediaItemPropertyPlaybackDuration] = Double(duration) / 1000 }
    now[MPMediaItemPropertyArtist] = info.subtitle
    now[MPMediaItemPropertyArtwork] = artwork
    MPNowPlayingInfoCenter.default().nowPlayingInfo = now
  }

  /// The picture from the active server, with the session's headers, made
  /// small enough for the lock screen.
  private func loadArtwork(_ info: MediaInfoMessage) {
    artworkTask?.cancel()
    artwork = nil
    guard let address = info.artworkUrl, let url = URL(string: address) else { return }
    var request = URLRequest(url: url)
    for (name, value) in info.headers { request.setValue(value, forHTTPHeaderField: name) }
    artworkTask = Task { @MainActor [weak self] in
      guard let fetched = try? await URLSession.shared.data(for: request) else { return }
      let (data, response) = fetched
      guard !Task.isCancelled, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
        let image = thumbnail(data)
      else { return }
      self?.artwork = artworkOf(image)
      self?.publish()
    }
  }
}

private func thumbnail(_ data: Data) -> UIImage? {
  guard let source = CGImageSourceCreateWithData(data as CFData, nil),
    let image = CGImageSourceCreateThumbnailAtIndex(
      source, 0,
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 600,
        kCGImageSourceCreateThumbnailWithTransform: true,
      ] as CFDictionary)
  else { return nil }
  return UIImage(cgImage: image)
}

/// MediaPlayer asks for the picture on a queue of its own, so the closure
/// is made outside the main actor's code.
private func artworkOf(_ image: UIImage) -> MPMediaItemArtwork {
  MPMediaItemArtwork(boundsSize: image.size) { _ in image }
}
