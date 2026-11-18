import AVFoundation
import AVKit
import CoreMedia
import MatineeCore
import SwiftUI
import UIKit
import os

/*
 * DisplayMode.kt: the TV's display follows the video, its frame rate and
 * its dynamic range, while the player shows, and goes back as it closes.
 *
 * On Apple TV the system picks the mode; an app says what it plays through
 * the window's `AVDisplayManager.preferredDisplayCriteria`, which tvOS
 * honours only when Settings › Video and Audio › Match Content allows it.
 * So there's no mode list to search, as Android's `matchingRefreshRate`
 * does: the content's rate and format go in, and tvOS finds the mode.
 *
 * - mpv: MPVUI's surface does this itself (MPVUI's Build/RENDERING.md,
 *   "Display matching"; `MPVPlayerConfiguration.displayMatching` is
 *   `.automatic` unless set, which MatineeMPV leaves it), from the frames it
 *   decodes, suspending its clock through a switch and putting the
 *   default back when its surface goes. Nothing here touches the display
 *   while mpv plays, so the two never fight over it.
 * - AVPlayer: only `AVPlayerViewController` applies criteria by itself
 *   (`appliesPreferredDisplayCriteriaAutomatically`), and it brings the
 *   system's controls, which this app doesn't use. An `AVPlayerLayer`
 *   doesn't, so this sets them from what plays once each source is ready,
 *   pauses through the switch, and sets nil, the default for the rest of
 *   the app, when the player closes.
 */

private let log = Logger(subsystem: "io.github.zekurio.matinee", category: "DisplayMode")

/// Asks the display for the mode that suits what AVPlayer plays; nothing while mpv plays, which asks itself.
struct TVDisplayMode: View {
  let controller: PlayerController
  @State private var matcher = TVDisplayMatcher()

  var body: some View {
    TVWindowReader { matcher.window = $0 }
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
      .task(id: controller.source?.url) {
        guard controller.playbackEngine.avPlayer != nil else {
          log.info("mpv plays: its surface asks for the display mode itself")
          return
        }
        await matcher.match(controller)
      }
      .onDisappear { matcher.release() }
  }
}

/// Hands over the window a view is in, once it has one.
private struct TVWindowReader: UIViewRepresentable {
  let found: (UIWindow) -> Void

  func makeUIView(context: Context) -> WindowView {
    let view = WindowView()
    view.found = found
    return view
  }

  func updateUIView(_ view: WindowView, context: Context) { view.found = found }

  final class WindowView: UIView {
    var found: ((UIWindow) -> Void)?
    override var canBecomeFocused: Bool { false }
    override func didMoveToWindow() {
      super.didMoveToWindow()
      if let window { found?(window) }
    }
  }
}

/// The criteria this player asked the window's display manager for, and the pause through a switch.
@MainActor final class TVDisplayMatcher {
  weak var window: UIWindow?
  private var applied = false
  private weak var pausedController: PlayerController?
  private var observers: [NSObjectProtocol] = []

  /// Waits for the item AVPlayer has to be ready, then asks for the mode its video wants.
  func match(_ controller: PlayerController) async {
    guard let player = controller.player else { return }
    var waited = 0
    while player.currentItem?.status != .readyToPlay {
      if Task.isCancelled || waited > 200 { return }
      try? await Task.sleep(for: .milliseconds(100))
      waited += 1
    }
    guard let item = player.currentItem, !Task.isCancelled else { return }
    let probeRate = controller.item?.probe?.video?.frameRate
    let (criteria, said) = await Self.criteria(item, probeRate: probeRate)
    guard !Task.isCancelled, let manager = window?.avDisplayManager else {
      log.info("no window to ask for a display mode")
      return
    }
    let matching = manager.isDisplayCriteriaMatchingEnabled ? "on" : "off"
    log.info("\(said, privacy: .public); Match Content \(matching, privacy: .public)")
    guard let criteria else { return }
    watchSwitches(controller)
    manager.preferredDisplayCriteria = criteria
    applied = true
    // The screen may go blank for a few seconds; the video waits for it.
    if manager.isDisplayModeSwitchInProgress { pauseForSwitch(controller) }
  }

  /// The criteria for `item`'s video: its frame rate and its format, which
  /// says its dynamic range, as the track that plays has them. The server's
  /// probe gives the rate when the track doesn't, as for HLS. Without a
  /// track to read, the asset's own criteria.
  static func criteria(_ item: AVPlayerItem, probeRate: Double?) async -> (AVDisplayCriteria?, String) {
    var tracks = item.tracks.compactMap(\.assetTrack).filter { $0.mediaType == .video }
    if tracks.isEmpty { tracks = (try? await item.asset.loadTracks(withMediaType: .video)) ?? [] }
    if let track = tracks.first,
      let (formats, nominal) = try? await track.load(.formatDescriptions, .nominalFrameRate),
      let format = formats.first
    {
      let rate = nominal > 0 ? Double(nominal) : probeRate ?? 0
      let source = nominal > 0 ? "the track" : "the server's probe"
      let range = dynamicRange(format)
      guard rate > 0 else { return (nil, "video \(range), no frame rate known: leaving the display as it is") }
      let shown = (rate * 1000).rounded() / 1000
      return (
        AVDisplayCriteria(refreshRate: Float(rate), formatDescription: format),
        "video \(shown) fps (from \(source)), \(range): asking for a mode to match"
      )
    }
    guard let criteria = try? await item.asset.load(.preferredDisplayCriteria) else {
      return (nil, "no video track or criteria: leaving the display as it is")
    }
    return (criteria, "no video track to read: asking for the asset's own criteria")
  }

  /// What a format's transfer function says of its range, for the log.
  private static func dynamicRange(_ format: CMFormatDescription) -> String {
    let transfer = CMFormatDescriptionGetExtension(format, extensionKey: kCMFormatDescriptionExtension_TransferFunction)
    guard let transfer, CFGetTypeID(transfer) == CFStringGetTypeID() else { return "SDR" }
    // SAFETY: checked to be a CFString on the line above.
    let name = transfer as! CFString
    if CFEqual(name, kCMFormatDescriptionTransferFunction_SMPTE_ST_2084_PQ) { return "PQ (HDR10)" }
    if CFEqual(name, kCMFormatDescriptionTransferFunction_ITU_R_2100_HLG) { return "HLG" }
    return "SDR (\(name))"
  }

  private func watchSwitches(_ controller: PlayerController) {
    guard observers.isEmpty else { return }
    observers = [
      NotificationCenter.default.addObserver(forName: .AVDisplayManagerModeSwitchStart, object: nil, queue: .main) {
        [weak self, weak controller] _ in
        MainActor.assumeIsolated {
          log.info("display mode switch started")
          if let controller { self?.pauseForSwitch(controller) }
        }
      },
      NotificationCenter.default.addObserver(forName: .AVDisplayManagerModeSwitchEnd, object: nil, queue: .main) {
        [weak self] _ in
        MainActor.assumeIsolated {
          log.info("display mode switch ended")
          self?.resumeAfterSwitch()
        }
      },
    ]
  }

  private func pauseForSwitch(_ controller: PlayerController) {
    guard pausedController == nil, controller.playing else { return }
    pausedController = controller
    controller.pause()
  }

  private func resumeAfterSwitch() {
    pausedController?.play()
    pausedController = nil
  }

  /// The player closed: the display goes back to the mode for the rest of the app.
  func release() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    pausedController = nil
    guard applied else { return }
    applied = false
    window?.avDisplayManager.preferredDisplayCriteria = nil
    log.info("player closed: display criteria back to the default")
  }
}
