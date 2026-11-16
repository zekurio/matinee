import AVKit
import MatineeCore
import MatineeKit
import MediaPlayer
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Video` and `rememberPictureInPicture`: the
 * controller's AVPlayer in an `AVPlayerLayer`, whole or filling the
 * screen, on black, picture in picture from the same layer, and the
 * system's AirPlay route picker under a button the app draws. mpv draws
 * into its own surface (MatineeMPV's `MPVPlaybackSurface`), which has
 * neither picture in picture nor AirPlay video, so the screen offers
 * those with AVPlayer only. HDR is the layer's own: AVPlayerLayer shows it
 * on a screen that can, with nothing to set.
 */

/// A view whose layer is the player's, so it follows the view's size and rotation.
final class PlayerLayerView: UIView {
  override static var layerClass: AnyClass { AVPlayerLayer.self }
  // SAFETY: `layerClass` makes the view's layer an AVPlayerLayer.
  var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

/// The video, whole or filling the screen and cut at its edges. `autoPicture`
/// lets picture in picture start by itself on leaving the app, as Android's
/// `setAutoEnterEnabled`: while it plays, unless settings turned it off.
struct VideoSurface: UIViewRepresentable {
  let controller: PlayerController
  let pip: PictureInPictureModel
  let fill: Bool
  let autoPicture: Bool

  func makeUIView(context: Context) -> PlayerLayerView {
    let view = PlayerLayerView()
    view.backgroundColor = .black
    view.isUserInteractionEnabled = false
    view.playerLayer.player = controller.player
    view.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
    pip.attach(view.playerLayer, controller: controller)
    return view
  }

  func updateUIView(_ view: PlayerLayerView, context: Context) {
    let gravity: AVLayerVideoGravity = fill ? .resizeAspectFill : .resizeAspect
    if view.playerLayer.videoGravity != gravity {
      CATransaction.begin()
      CATransaction.setAnimationDuration(MatineeKit.Motion.moveDuration)
      view.playerLayer.videoGravity = gravity
      CATransaction.commit()
    }
    pip.autoStart(autoPicture)
  }

  static func dismantleUIView(_ view: PlayerLayerView, coordinator: ()) {
    view.playerLayer.player = nil
  }
}

/// AVKit's picture in picture on the player's layer, telling the controller
/// when it shows the video, which counts as a surface for the freeze watch
/// and keeps it playing in the background. `possible` says when the button
/// can start it.
@Observable final class PictureInPictureModel: NSObject, AVPictureInPictureControllerDelegate {
  /// The system can start picture in picture now.
  private(set) var possible = false
  @ObservationIgnored private weak var controller: PlayerController?
  @ObservationIgnored private var pip: AVPictureInPictureController?
  @ObservationIgnored private var watch: NSKeyValueObservation?
  @ObservationIgnored private var returned: NSObjectProtocol?

  /// This device has picture in picture at all; some iPhones and every Mac running the app don't.
  static var supported: Bool { AVPictureInPictureController.isPictureInPictureSupported() }

  func attach(_ layer: AVPlayerLayer, controller: PlayerController) {
    detach()
    self.controller = controller
    guard Self.supported, let pip = AVPictureInPictureController(playerLayer: layer) else { return }
    pip.delegate = self
    self.pip = pip
    watch = pip.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] pip, _ in
      let possible = pip.isPictureInPicturePossible
      Task { @MainActor in self?.possible = possible }
    }
    // Opened from its icon while the small window plays, the app shows the
    // player again, so the window goes back into it.
    returned = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        if self?.pip?.isPictureInPictureActive == true { self?.pip?.stopPictureInPicture() }
      }
    }
  }

  func start() { pip?.startPictureInPicture() }

  func autoStart(_ enabled: Bool) {
    if let pip, pip.canStartPictureInPictureAutomaticallyFromInline != enabled {
      pip.canStartPictureInPictureAutomaticallyFromInline = enabled
    }
  }

  func detach() {
    if let returned { NotificationCenter.default.removeObserver(returned) }
    returned = nil
    watch = nil
    pip?.stopPictureInPicture()
    pip?.delegate = nil
    pip = nil
    if possible { possible = false }
  }

  // Marked on its way in, not once it shows: the scene goes to the
  // background between the two, and the controller pauses there unless it
  // knows the small window keeps the video.
  func pictureInPictureControllerWillStartPictureInPicture(_ pip: AVPictureInPictureController) {
    controller?.pictureInPictureChanged(true)
  }

  func pictureInPictureControllerDidStartPictureInPicture(_ pip: AVPictureInPictureController) {
    controller?.pictureInPictureChanged(true)
  }

  func pictureInPictureController(
    _ pip: AVPictureInPictureController, failedToStartPictureInPictureWithError error: any Error
  ) {
    stopped()
  }

  func pictureInPictureControllerDidStopPictureInPicture(_ pip: AVPictureInPictureController) {
    stopped()
  }

  /// The player is still on screen under the window, so there's nothing to
  /// put back but the app itself, which the system brings forward.
  func pictureInPictureController(
    _ pip: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(true)
  }

  /// Closed from the small window while the app is away, the video has
  /// nowhere to show, so it pauses, as Android's `ON_STOP` does.
  private func stopped() {
    controller?.pictureInPictureChanged(false)
    if UIApplication.shared.applicationState != .active { controller?.sceneDidEnterBackground() }
  }
}

/// AirPlay: the system's route picker, which only it can open, under the
/// app's own icon. The picker draws nothing of its own (its tints are
/// clear) and takes the tap; VoiceOver reads the system's own name for it.
struct AirPlayButton: View {
  /// Video is on an AirPlay screen now, which lights the icon.
  let active: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    ZStack {
      RoutePicker()
      MatineeKit.LucideIcon(.airplay, size: 22, tint: active ? palette.accent : .white.opacity(0.85), scales: false)
        .pictureShadow()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
    .frame(width: MatineeKit.TouchTarget, height: MatineeKit.TouchTarget)
  }
}

private struct RoutePicker: UIViewRepresentable {
  func makeUIView(context: Context) -> AVRoutePickerView {
    let picker = AVRoutePickerView()
    picker.prioritizesVideoDevices = true
    picker.backgroundColor = .clear
    picker.tintColor = .clear
    picker.activeTintColor = .clear
    return picker
  }

  func updateUIView(_ picker: AVRoutePickerView, context: Context) {}
}

/// Where the video shows in `bounds`: fitted inside, or covering it when it fills.
nonisolated func videoRect(aspect: Double, in bounds: CGSize, fill: Bool) -> CGRect {
  guard aspect > 0, bounds.width > 0, bounds.height > 0 else { return CGRect(origin: .zero, size: bounds) }
  let box = bounds.width / bounds.height
  let wide = fill ? aspect < box : aspect > box
  let width = wide ? bounds.width : bounds.height * aspect
  let height = wide ? bounds.width / aspect : bounds.height
  return CGRect(x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width: width, height: height)
}
