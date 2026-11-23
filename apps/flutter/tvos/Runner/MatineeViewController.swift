// Copyright (C) edde746 and Plezy contributors.
// SPDX-License-Identifier: GPL-3.0-only
// Taking the remote's Play/Pause before the engine does is adapted from
// Plezy's tvos/Runner/AppDelegate.swift.
import Flutter
import UIKit

/// The storyboard's Flutter view controller on an Apple TV: a view the video
/// shows through, and the remote's Play/Pause.
///
/// The engine sends the remote's ring, Select, and Menu to Dart as keys. It
/// has no key for Play/Pause that Dart reliably gets, and tvOS delivers the
/// press in more than one way, so it's taken here, each way, and goes to the
/// player as one media command.
final class MatineeViewController: FlutterViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    // Flutter's view is opaque by default, which would hide the video the
    // player puts beneath it.
    isViewOpaque = false
    view.backgroundColor = .clear
  }

  override var canBecomeFirstResponder: Bool { true }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    // Unpainted pixels show the window, so it has the app's background for
    // the moment before Flutter's first frame.
    view.window?.backgroundColor = UIColor(red: 0x0E / 255.0, green: 0x0E / 255.0, blue: 0x10 / 255.0, alpha: 1)
    becomeFirstResponder()
  }

  override func viewWillDisappear(_ animated: Bool) {
    resignFirstResponder()
    super.viewWillDisappear(animated)
  }

  /// The player asks a phone for fullscreen. A TV shows nothing else.
  func setFullscreen(owner: Int64, enabled: Bool) {}

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    if isPlayPause(presses) {
      playPause()
      return
    }
    super.pressesBegan(presses, with: event)
  }

  override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    if isPlayPause(presses) { return }
    super.pressesEnded(presses, with: event)
  }

  override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    if isPlayPause(presses) { return }
    super.pressesCancelled(presses, with: event)
  }

  override func remoteControlReceived(with event: UIEvent?) {
    switch event?.subtype {
    case .remoteControlPlay, .remoteControlPause, .remoteControlTogglePlayPause:
      playPause()
    default:
      super.remoteControlReceived(with: event)
    }
  }

  private func isPlayPause(_ presses: Set<UIPress>) -> Bool {
    presses.contains { $0.type == .playPause }
  }

  private func playPause() {
    (UIApplication.shared.delegate as? AppDelegate)?.playPausePressed()
  }
}
