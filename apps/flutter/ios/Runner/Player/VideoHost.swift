// Copyright (C) edde746 and Plezy contributors.
// SPDX-License-Identifier: GPL-3.0-only
// The layer beneath the Flutter view and the picture in picture over it are
// adapted from Plezy's MpvPlayerCore.swift and MpvPipController.swift.
import AVFoundation
import AVKit
import UIKit

/// The video's layer for one session, in a view beneath the Flutter view, at
/// the rectangle Dart's `VideoView` leaves transparent. Main thread only.
final class VideoHost {
  /// mpv's avfoundation output draws into it, found by its address as `wid`.
  let layer = AVSampleBufferDisplayLayer()
  private let container = UIView()
  private weak var flutterView: UIView?
  private var viewport: ViewportMessage?

  init(flutterView: UIView) {
    self.flutterView = flutterView
    container.backgroundColor = .black
    container.isUserInteractionEnabled = false
    container.accessibilityElementsHidden = true
    container.isHidden = true
    layer.backgroundColor = UIColor.black.cgColor
    layer.videoGravity = .resizeAspect
    container.layer.addSublayer(layer)
    if let parent = flutterView.superview {
      parent.insertSubview(container, belowSubview: flutterView)
    } else {
      flutterView.window?.insertSubview(container, at: 0)
    }
  }

  /// [bounds] is in physical pixels from the Flutter view's top left.
  func setViewport(_ bounds: ViewportMessage?) {
    guard viewport != bounds else { return }
    viewport = bounds
    guard let bounds, bounds.width > 0, bounds.height > 0, let flutterView, let parent = container.superview
    else {
      container.isHidden = true
      return
    }
    let scale = flutterView.traitCollection.displayScale
    let rect = CGRect(
      x: CGFloat(bounds.left) / scale, y: CGFloat(bounds.top) / scale, width: CGFloat(bounds.width) / scale,
      height: CGFloat(bounds.height) / scale)
    // Without implicit animations, the picture follows the widget at once.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    container.frame = flutterView.convert(rect, to: parent)
    layer.frame = container.bounds
    CATransaction.commit()
    container.isHidden = false
  }

  func setFit(_ fit: FitMessage) {
    layer.videoGravity =
      switch fit {
      case .contain: .resizeAspect
      case .cover: .resizeAspectFill
      case .fill: .resize
      }
    container.clipsToBounds = fit == .cover
  }

  func close() {
    container.removeFromSuperview()
  }
}

/// Where the video is, for picture in picture's own controls.
protocol PictureInPictureSource: AnyObject {
  var pipPositionSeconds: Double { get }
  var pipDurationSeconds: Double { get }
  var pipPlaying: Bool { get }
}

/// The system's small window over the session's layer. Its play, pause and
/// skip buttons go to Dart as media commands, as Android's do.
final class PictureInPicture {
  private static let liveRange = CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)

  private let layer: AVSampleBufferDisplayLayer
  private let controller: AVPictureInPictureController
  private let helper: PictureInPictureHelper
  private weak var source: PictureInPictureSource?
  private let changed: (Bool) -> Void
  private let command: (MediaCommandMessage) -> Void
  /// While it shows, subtitles go into the video's own frames, since the
  /// small window shows only the display layer.
  private let compositeSubtitles: (Bool) -> Void
  private(set) var active = false
  /// From the moment it begins to open, which can be before the app's
  /// background notification arrives.
  private(set) var starting = false
  private var timer: Timer?
  private var rangeStart: CMTime?
  private var rangeDuration = 0.0
  private var rangePosition = 0.0

  init(
    layer: AVSampleBufferDisplayLayer, source: PictureInPictureSource, automatic: Bool,
    changed: @escaping (Bool) -> Void, command: @escaping (MediaCommandMessage) -> Void,
    compositeSubtitles: @escaping (Bool) -> Void
  ) {
    self.layer = layer
    self.source = source
    self.changed = changed
    self.command = command
    self.compositeSubtitles = compositeSubtitles
    helper = PictureInPictureHelper()
    controller = AVPictureInPictureController(
      contentSource: .init(sampleBufferDisplayLayer: layer, playbackDelegate: helper))
    helper.owner = self
    controller.delegate = helper
    controller.canStartPictureInPictureAutomaticallyFromInline = automatic
  }

  static var supported: Bool { AVPictureInPictureController.isPictureInPictureSupported() }

  func setAutomatic(_ enabled: Bool) {
    controller.canStartPictureInPictureAutomaticallyFromInline = enabled
  }

  /// Opens the small window when it can open now: mpv has to have given the
  /// layer its timebase and a frame.
  func start() -> Bool {
    let frame: Bool
    if #available(iOS 17.4, *) { frame = layer.isReadyForDisplay } else { frame = true }
    guard controller.isPictureInPicturePossible, layer.controlTimebase != nil, frame else { return false }
    controller.startPictureInPicture()
    return true
  }

  /// The play state or the position moved in a way the small window can't
  /// see, as after a seek.
  func invalidate() {
    if active { controller.invalidatePlaybackState() }
  }

  func close() {
    helper.owner = nil
    controller.delegate = nil
    controller.canStartPictureInPictureAutomaticallyFromInline = false
    if active || starting { controller.stopPictureInPicture() }
    stopTracking()
    if active { changed(false) }
    active = false
    starting = false
  }

  fileprivate func willStart() {
    starting = true
    compositeSubtitles(true)
    startTracking()
  }

  fileprivate func didStart() {
    starting = false
    active = true
    changed(true)
  }

  fileprivate func failedToStart() {
    starting = false
    stopTracking()
    compositeSubtitles(false)
  }

  fileprivate func didStop() {
    starting = false
    stopTracking()
    compositeSubtitles(false)
    guard active else { return }
    active = false
    changed(false)
  }

  fileprivate func setPlaying(_ playing: Bool) {
    command(MediaCommandMessage(kind: playing ? .play : .pause))
  }

  fileprivate func skip(_ seconds: Double) {
    guard let source else { return }
    let target = min(max(source.pipPositionSeconds + seconds, 0), source.pipDurationSeconds)
    command(MediaCommandMessage(kind: .seekTo, positionMs: Int64(target * 1000)))
  }

  fileprivate var paused: Bool { !(source?.pipPlaying ?? false) }

  /// The playback range on the layer's timeline. The small window shows the
  /// timebase's time less the range's start as the time played, and host
  /// presentation runs that timebase on mpv's clock rather than the
  /// position, so the range starts at the timebase's now less the position.
  fileprivate func playbackRange() -> CMTimeRange {
    guard let timebase = layer.controlTimebase, let source, source.pipDurationSeconds > 0 else {
      rangeStart = nil
      return Self.liveRange
    }
    let duration = source.pipDurationSeconds
    let position = min(max(source.pipPositionSeconds, 0), duration)
    let start = CMTimeSubtract(
      CMTimebaseGetTime(timebase), CMTime(seconds: position, preferredTimescale: 1_000_000_000))
    rangeStart = start
    rangeDuration = duration
    rangePosition = position
    return CMTimeRange(start: start, duration: CMTime(seconds: duration, preferredTimescale: 1_000_000_000))
  }

  /// A seek, a speed other than 1x, or a stall moves the timebase and the
  /// position apart, and a seek while paused moves the position alone, so
  /// the range is sent again when they drift.
  private func startTracking() {
    timer?.invalidate()
    let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.checkRange() }
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
  }

  private func stopTracking() {
    timer?.invalidate()
    timer = nil
    rangeStart = nil
  }

  private func checkRange() {
    guard let source, let timebase = layer.controlTimebase else { return }
    guard let start = rangeStart else {
      if source.pipDurationSeconds > 0 { controller.invalidatePlaybackState() }
      return
    }
    let duration = source.pipDurationSeconds
    guard duration == rangeDuration else { return controller.invalidatePlaybackState() }
    let shown = source.pipPlaying ? CMTimeGetSeconds(CMTimeSubtract(CMTimebaseGetTime(timebase), start)) : rangePosition
    if abs(shown - min(max(source.pipPositionSeconds, 0), duration)) > 0.25 {
      controller.invalidatePlaybackState()
    }
  }
}

/// AVKit's delegates, kept apart so the controller holds no strong
/// reference back to its owner.
private final class PictureInPictureHelper: NSObject, AVPictureInPictureControllerDelegate,
  AVPictureInPictureSampleBufferPlaybackDelegate
{
  weak var owner: PictureInPicture?

  func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
    owner?.willStart()
  }

  func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
    owner?.didStart()
  }

  func pictureInPictureController(
    _ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error
  ) {
    owner?.failedToStart()
  }

  func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
    owner?.didStop()
  }

  /// The app is the player, so coming back to it is always possible.
  func pictureInPictureController(
    _ controller: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(owner != nil)
  }

  func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {
    owner?.setPlaying(playing)
  }

  func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
    owner?.playbackRange() ?? CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
  }

  func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool {
    owner?.paused ?? true
  }

  func pictureInPictureController(
    _ controller: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions
  ) {}

  func pictureInPictureController(
    _ controller: AVPictureInPictureController, skipByInterval skipInterval: CMTime,
    completion completionHandler: @escaping () -> Void
  ) {
    owner?.skip(CMTimeGetSeconds(skipInterval))
    completionHandler()
  }
}
