// Copyright (C) edde746 and Plezy contributors.
// SPDX-License-Identifier: GPL-3.0-only
// The volume slider and the brightness kept per screen are adapted from
// Plezy's AppDelegate.swift.
import AVFoundation
import Flutter
import MediaPlayer
import UIKit

/// What the player asks of the device around the video, as Android's
/// `PlayerSystem`: the screen's brightness, which a swipe sets and the
/// player puts back, the media volume, picture in picture, and the system's
/// controls ([NowPlaying]). Pigeon calls these on the main thread.
final class PlayerSystem: PlayerSystemApi {
  private let events: PlayerSystemEventsApi
  private let player: PlayerBridge
  private let window: () -> UIWindow?
  private lazy var media = NowPlaying { [weak self] command in self?.send(command) }
  /// The player wants the small window when the app is left, as while a video plays.
  private var automatic = false
  /// The screen whose brightness the player changed, and what it was.
  private var brightness: (screen: UIScreen, original: CGFloat, level: CGFloat)?
  private var volumeView: MPVolumeView?
  private var observers: [NSObjectProtocol] = []

  init(messenger: FlutterBinaryMessenger, player: PlayerBridge, window: @escaping () -> UIWindow?) {
    events = PlayerSystemEventsApi(binaryMessenger: messenger)
    self.player = player
    self.window = window
    // iOS keeps a brightness the app set after the app is left, so it goes
    // back while away and comes again on return.
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) {
        [weak self] _ in
        guard let brightness = self?.brightness else { return }
        brightness.screen.brightness = brightness.original
      })
    observers.append(
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) {
        [weak self] _ in
        guard let self, let brightness = self.brightness else { return }
        self.brightness = (brightness.screen, brightness.screen.brightness, brightness.level)
        brightness.screen.brightness = brightness.level
      })
  }

  private var screen: UIScreen? { window()?.windowScene?.screen }

  func levels() throws -> LevelsMessage {
    LevelsMessage(
      brightness: Double(screen?.brightness ?? 0.5), volume: Double(AVAudioSession.sharedInstance().outputVolume))
  }

  /// iOS has no API to set the volume. The slider of an MPVolumeView does it,
  /// and one in the window also keeps the system's own volume overlay away
  /// while the player shows its own.
  func setVolume(level: Double) throws -> Double {
    let level = min(max(level, 0), 1)
    guard let slider = volumeSlider() else { return Double(AVAudioSession.sharedInstance().outputVolume) }
    slider.setValue(Float(level), animated: false)
    slider.sendActions(for: .valueChanged)
    slider.sendActions(for: .touchUpInside)
    // The session reports the new volume only once the system has applied it.
    return level
  }

  func setBrightness(brightness level: Double?) throws {
    guard let level else {
      if let brightness { brightness.screen.brightness = brightness.original }
      brightness = nil
      return
    }
    guard let screen else { return }
    if let brightness, brightness.screen !== screen {
      brightness.screen.brightness = brightness.original
      self.brightness = nil
    }
    let value = CGFloat(min(max(level, 0), 1))
    brightness = (screen, brightness?.original ?? screen.brightness, value)
    screen.brightness = value
  }

  func hasPictureInPicture() throws -> Bool { PictureInPicture.supported }

  func inPictureInPicture() throws -> Bool { player.session?.pip?.active ?? false }

  func enterPictureInPicture() throws -> Bool { player.session?.pip?.start() ?? false }

  func setAutoPictureInPicture(enabled: Bool) throws {
    automatic = enabled
    player.session?.pip?.setAutomatic(enabled)
  }

  func showMedia(info: MediaInfoMessage) throws { media.show(info) }

  func setMediaState(state: MediaStateMessage) throws { media.update(state) }

  func hideMedia() throws { media.hide() }

  /// The caption style in Settings > Accessibility > Subtitles & Captioning.
  func captionStyle() throws -> CaptionStyleMessage? { systemCaptionStyle() }

  /// Apps may only open their own page in Settings; the caption style is
  /// under Accessibility, a step away from there.
  func openCaptionSettings() throws {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }

  /// A new session gets its own small window, over its own layer.
  func sessionOpened(_ session: PlayerBridge.Session) {
    guard PictureInPicture.supported, let host = session.host, let engine = session.engine else { return }
    session.pip = PictureInPicture(
      layer: host.layer, source: session, automatic: automatic,
      changed: { [weak self] active in self?.pictureInPictureChanged(active) },
      command: { [weak self] command in self?.send(command) },
      compositeSubtitles: { [weak engine] on in engine?.compositeSubtitles(on) })
  }

  private func pictureInPictureChanged(_ active: Bool) {
    Task { @MainActor [events] in
      // Nothing in Dart listens before the player opens.
      try? await events.pictureInPictureChanged(active: active)
    }
  }

  private func send(_ command: MediaCommandMessage) {
    if command.kind == .play { player.allowPlayInBackground() }
    Task { @MainActor [events] in
      // The player closed between the press and now.
      try? await events.mediaCommand(command: command)
    }
  }

  private func volumeSlider() -> UISlider? {
    let view = volumeView ?? MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 1, height: 1))
    view.alpha = 0.01
    view.isUserInteractionEnabled = false
    if view.superview == nil { window()?.addSubview(view) }
    view.layoutIfNeeded()
    volumeView = view
    func find(_ view: UIView) -> UISlider? {
      if let slider = view as? UISlider { return slider }
      return view.subviews.lazy.compactMap(find).first
    }
    return find(view)
  }
}
