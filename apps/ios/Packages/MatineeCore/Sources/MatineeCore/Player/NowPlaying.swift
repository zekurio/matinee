import AVFoundation
import Foundation
import ImageIO
import MediaPlayer

#if os(iOS) || os(tvOS)
  import UIKit
#else
  import AppKit
#endif

@MainActor protocol NowPlayingPlayer: AnyObject {
  var position: Double { get }
  var duration: Double { get }
  var speed: Float { get }
  var playing: Bool { get }
  var canPlay: Bool { get }
  var canSeek: Bool { get }
  var canNext: Bool { get }
  var skipBack: Double { get }
  var skipForward: Double { get }
  var nowPlayingItemID: String? { get }
  var nowPlayingTitle: String? { get }
  var nowPlayingSubtitle: String? { get }
  func play()
  func pause()
  func togglePlay()
  func playNext()
  /// An audio interruption began or ended. The player keeps whether it
  /// played, so it alone decides to resume, as ExoPlayer's audio focus does.
  func audioInterruptionBegan()
  func audioInterruptionEnded(shouldResume: Bool)
  func skip(_ seconds: Double) async
  func seekTo(_ seconds: Double) async
  func mediaRequest(url: URL) async -> URLRequest
}

extension PlayerController: NowPlayingPlayer {
  var canPlay: Bool { source != nil && error == nil && refusal == nil }
  var canSeek: Bool { canPlay && duration > 0 }
  var canNext: Bool { next != nil && onNext != nil }
  var skipBack: Double { Double(preferences.skipBack) }
  var skipForward: Double { Double(preferences.skipForward) }
  var nowPlayingItemID: String? { item?.id }
  var nowPlayingTitle: String? { item.map { $0.label.title ?? $0.fileTitle } }
  var nowPlayingSubtitle: String? {
    guard let item else { return nil }
    return nowPlayingDetail(
      show: item.title?.kind == TitleKind.show,
      showName: item.label.showName, code: item.label.code, year: item.label.year)
  }
}

func nowPlayingDetail(show: Bool, showName: String, code: String?, year: String?) -> String? {
  show ? [showName, code].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") : year
}

enum NowPlayingCommand: CaseIterable, Sendable {
  case play, pause, toggle, backward, forward, position, next
}

@MainActor protocol NowPlayingInfo: AnyObject {
  var nowPlayingInfo: [String: Any]? { get set }
}
extension MPNowPlayingInfoCenter: NowPlayingInfo {}

@MainActor protocol NowPlayingCommands: AnyObject {
  func install(_ handler: @escaping @MainActor (NowPlayingCommand, Double?) -> Bool)
  func enable(_ command: NowPlayingCommand, _ enabled: Bool, interval: Double?)
  func remove()
}

@MainActor protocol NowPlayingAudioSession: AnyObject {
  func start(_ event: @escaping @MainActor (NowPlayingAudioEvent) -> Void)
  func activate() throws
  func stop()
}
enum NowPlayingAudioEvent {
  case interruption
  case interruptionEnded(resume: Bool)
  case unplugged
}

@MainActor private final class SystemCommands: NowPlayingCommands {
  private let center = MPRemoteCommandCenter.shared()
  private var targets: [(MPRemoteCommand, Any)] = []
  private func command(_ value: NowPlayingCommand) -> MPRemoteCommand {
    switch value {
    case .play: center.playCommand
    case .pause: center.pauseCommand
    case .toggle: center.togglePlayPauseCommand
    case .backward: center.skipBackwardCommand
    case .forward: center.skipForwardCommand
    case .position: center.changePlaybackPositionCommand
    case .next: center.nextTrackCommand
    }
  }
  func install(_ handler: @escaping @MainActor (NowPlayingCommand, Double?) -> Bool) {
    for value in NowPlayingCommand.allCases {
      let command = command(value)
      // MediaPlayer invokes handlers on an arbitrary queue, so the closure is
      // @Sendable: without it, it would be the main actor's like the method it's
      // made in, and Swift stops the app when such a closure runs elsewhere.
      // State and actions belong to the player actor; disabled commands are
      // checked there again.
      let target = command.addTarget { @Sendable event in
        let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime
        Task { @MainActor in _ = handler(value, position) }
        return .success
      }
      targets.append((command, target))
    }
  }
  func enable(_ value: NowPlayingCommand, _ enabled: Bool, interval: Double?) {
    let command = command(value)
    command.isEnabled = enabled
    if let interval, let skip = command as? MPSkipIntervalCommand {
      skip.preferredIntervals = [NSNumber(value: interval)]
    }
  }
  func remove() {
    for (command, target) in targets {
      command.removeTarget(target)
      command.isEnabled = false
    }
    targets.removeAll()
  }
}

@MainActor private final class SystemAudioSession: NowPlayingAudioSession {
  private var observers: [NSObjectProtocol] = []
  func start(_ event: @escaping @MainActor (NowPlayingAudioEvent) -> Void) {
    #if os(iOS) || os(tvOS)
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .moviePlayback)
      observers.append(
        NotificationCenter.default.addObserver(
          forName: AVAudioSession.interruptionNotification, object: session, queue: .main
        ) { note in
          let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
          let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
          Task { @MainActor in
            if type == AVAudioSession.InterruptionType.began.rawValue {
              event(.interruption)
            } else if type == AVAudioSession.InterruptionType.ended.rawValue {
              event(
                .interruptionEnded(
                  resume: AVAudioSession.InterruptionOptions(rawValue: options).contains(
                    .shouldResume)))
            }
          }
        })
      observers.append(
        NotificationCenter.default.addObserver(
          forName: AVAudioSession.routeChangeNotification, object: session, queue: .main
        ) { note in
          let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
          if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
            Task { @MainActor in event(.unplugged) }
          }
        })
    #endif
  }
  func activate() throws {
    #if os(iOS) || os(tvOS)
      try AVAudioSession.sharedInstance().setActive(true)
    #endif
  }
  func stop() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
    #if os(iOS) || os(tvOS)
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    #endif
  }
}

@MainActor protocol NowPlayingArtworkLoader {
  func data(for request: URLRequest) async throws -> (Data, URLResponse)
}
private struct SystemArtworkLoader: NowPlayingArtworkLoader {
  func data(for request: URLRequest) async throws -> (Data, URLResponse) {
    try await URLSession.shared.data(for: request)
  }
}

@MainActor public final class PlayerNowPlaying {
  private weak var controller: (any NowPlayingPlayer)?
  private var title: String
  private var subtitle: String?
  private var itemID: String?
  private let infoCenter: any NowPlayingInfo
  private let commands: any NowPlayingCommands
  private let audioSession: any NowPlayingAudioSession
  private let artworkLoader: any NowPlayingArtworkLoader
  private var active = false
  private var stopped = false
  private var artwork: MPMediaItemArtwork?
  private var artworkTask: Task<Void, Never>?
  private var artworkGeneration = 0

  public convenience init(controller: PlayerController, title: String, subtitle: String? = nil) {
    self.init(
      player: controller, title: title,
      subtitle: subtitle == controller.item?.title?.name
        ? controller.nowPlayingSubtitle : (subtitle ?? controller.nowPlayingSubtitle),
      info: MPNowPlayingInfoCenter.default(), commands: SystemCommands(),
      audio: SystemAudioSession())
  }
  init(
    player: any NowPlayingPlayer, title: String, subtitle: String? = nil,
    info: any NowPlayingInfo, commands: any NowPlayingCommands, audio: any NowPlayingAudioSession,
    artworkLoader: any NowPlayingArtworkLoader = SystemArtworkLoader()
  ) {
    controller = player
    itemID = player.nowPlayingItemID
    self.title = title
    self.subtitle = subtitle
    infoCenter = info
    self.commands = commands
    audioSession = audio
    self.artworkLoader = artworkLoader
    audio.start { [weak self] event in self?.audioEvent(event) }
    commands.install { [weak self] command, position in
      self?.perform(command, position: position) ?? false
    }
    update()
  }
  private func enabled(_ command: NowPlayingCommand) -> Bool {
    guard !stopped, let controller else { return false }
    switch command {
    case .play: return controller.canPlay && !controller.playing
    case .pause: return controller.playing
    case .toggle: return controller.canPlay
    case .backward, .forward, .position: return controller.canSeek
    case .next: return controller.canNext
    }
  }
  private func perform(_ command: NowPlayingCommand, position: Double?) -> Bool {
    guard enabled(command), let controller else { return false }
    switch command {
    case .play: controller.play()
    case .pause: controller.pause()
    case .toggle: controller.togglePlay()
    case .next: controller.playNext()
    case .backward:
      Task {
        await controller.skip(-controller.skipBack)
        update()
      }
    case .forward:
      Task {
        await controller.skip(controller.skipForward)
        update()
      }
    case .position:
      guard let position, position.isFinite else { return false }
      Task {
        await controller.seekTo(position)
        update()
      }
    }
    update()
    return true
  }
  private func audioEvent(_ event: NowPlayingAudioEvent) {
    guard !stopped, let controller else { return }
    switch event {
    // The controller handles interruptions; this only routes them, so the
    // two don't both pause and resume.
    case .interruption:
      active = false
      controller.audioInterruptionBegan()
    case .interruptionEnded(let resume):
      controller.audioInterruptionEnded(shouldResume: resume)
    case .unplugged:
      controller.pause()
    }
    update()
  }
  public func loadArtwork(_ url: URL) {
    artworkTask?.cancel()
    artworkGeneration += 1
    let generation = artworkGeneration
    artwork = nil
    update()
    artworkTask = Task { [weak self] in
      guard let self, let controller else { return }
      do {
        let request = await controller.mediaRequest(url: url)
        let (data, response) = try await artworkLoader.data(for: request)
        guard !Task.isCancelled, !stopped, generation == artworkGeneration,
          let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let thumbnail = CGImageSourceCreateThumbnailAtIndex(
            source, 0,
            [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceThumbnailMaxPixelSize: 600,
              kCGImageSourceCreateThumbnailWithTransform: true,
            ] as CFDictionary)
        else { return }
        #if os(iOS) || os(tvOS)
          let image = UIImage(cgImage: thumbnail)
        #else
          let image = NSImage(
            cgImage: thumbnail, size: NSSize(width: thumbnail.width, height: thumbnail.height))
        #endif
        artwork = nowPlayingArtwork(image)
        update()
      } catch {}
    }
  }
  public func update() {
    guard !stopped, let controller else { return }
    if itemID != controller.nowPlayingItemID {
      itemID = controller.nowPlayingItemID
      title = controller.nowPlayingTitle ?? title
      subtitle = controller.nowPlayingSubtitle
      artworkTask?.cancel()
      artworkGeneration += 1
      artwork = nil
    }
    if controller.playing && !active {
      do {
        try audioSession.activate()
        active = true
      } catch { controller.pause() }
    }
    for command in NowPlayingCommand.allCases {
      let interval =
        command == .backward
        ? controller.skipBack : command == .forward ? controller.skipForward : nil
      commands.enable(command, enabled(command), interval: interval)
    }
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: title,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: controller.position,
      MPMediaItemPropertyPlaybackDuration: controller.duration,
      MPNowPlayingInfoPropertyPlaybackRate: controller.playing ? controller.speed : Float(0),
      MPNowPlayingInfoPropertyDefaultPlaybackRate: controller.speed,
      // Video, so Apple TV's Now Playing and Control Center show it as a
      // film rather than a song; iOS reads it the same way.
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
    ]
    info[MPMediaItemPropertyArtist] = subtitle
    info[MPMediaItemPropertyArtwork] = artwork
    infoCenter.nowPlayingInfo = info
  }
  public func stop() {
    guard !stopped else { return }
    stopped = true
    artworkTask?.cancel()
    artworkTask = nil
    artwork = nil
    commands.remove()
    infoCenter.nowPlayingInfo = nil
    audioSession.stop()
    active = false
  }
}

#if os(iOS) || os(tvOS)
  private typealias NowPlayingImage = UIImage
#else
  private typealias NowPlayingImage = NSImage
#endif

/// The artwork for `image`. MediaPlayer asks for the picture on a queue of its
/// own, so the closure must not be the main actor's: made inside a main-actor
/// method it would be, and Swift stops the app when it's called from elsewhere.
nonisolated private func nowPlayingArtwork(_ image: NowPlayingImage) -> MPMediaItemArtwork {
  nonisolated(unsafe) let image = image
  return MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
}
