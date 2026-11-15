import AVKit
import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Video` and `rememberPictureInPicture`: the controller's
 * AVPlayer in an `AVPlayerLayer`, whole or filling the screen, on black,
 * and picture in picture from the same layer. HDR is the layer's own:
 * AVPlayerLayer shows it on a screen that can, with nothing to set.
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
  let fill: Bool
  let autoPicture: Bool

  func makeCoordinator() -> PictureInPicture { PictureInPicture(controller) }

  func makeUIView(context: Context) -> PlayerLayerView {
    let view = PlayerLayerView()
    view.backgroundColor = .black
    view.isUserInteractionEnabled = false
    view.playerLayer.player = controller.player
    view.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
    context.coordinator.attach(view.playerLayer)
    return view
  }

  func updateUIView(_ view: PlayerLayerView, context: Context) {
    let gravity: AVLayerVideoGravity = fill ? .resizeAspectFill : .resizeAspect
    if view.playerLayer.videoGravity != gravity {
      CATransaction.begin()
      CATransaction.setAnimationDuration(Motion.moveDuration)
      view.playerLayer.videoGravity = gravity
      CATransaction.commit()
    }
    context.coordinator.autoStart(autoPicture)
  }

  static func dismantleUIView(_ view: PlayerLayerView, coordinator: PictureInPicture) {
    coordinator.detach()
    view.playerLayer.player = nil
  }
}

/// AVKit's picture in picture on the player's layer, telling the controller
/// when it shows the video, which counts as a surface for the freeze watch
/// and keeps it playing in the background.
final class PictureInPicture: NSObject, AVPictureInPictureControllerDelegate {
  private let controller: PlayerController
  private var pip: AVPictureInPictureController?
  private var returned: NSObjectProtocol?

  init(_ controller: PlayerController) { self.controller = controller }

  func attach(_ layer: AVPlayerLayer) {
    guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
    let pip = AVPictureInPictureController(playerLayer: layer)
    pip?.delegate = self
    self.pip = pip
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

  func autoStart(_ enabled: Bool) {
    if pip?.canStartPictureInPictureAutomaticallyFromInline != enabled {
      pip?.canStartPictureInPictureAutomaticallyFromInline = enabled
    }
  }

  func detach() {
    if let returned { NotificationCenter.default.removeObserver(returned) }
    returned = nil
    pip?.stopPictureInPicture()
    pip?.delegate = nil
    pip = nil
  }

  // Marked on its way in, not once it shows: the scene goes to the
  // background between the two, and the controller pauses there unless it
  // knows the small window keeps the video.
  func pictureInPictureControllerWillStartPictureInPicture(_ pip: AVPictureInPictureController) {
    controller.pictureInPictureChanged(true)
  }

  func pictureInPictureControllerDidStartPictureInPicture(_ pip: AVPictureInPictureController) {
    controller.pictureInPictureChanged(true)
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
    controller.pictureInPictureChanged(false)
    if UIApplication.shared.applicationState != .active { controller.sceneDidEnterBackground() }
  }
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
