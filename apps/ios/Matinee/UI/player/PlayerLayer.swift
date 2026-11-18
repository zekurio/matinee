import AVFoundation
import MatineeKit
import SwiftUI
import UIKit

/// A view whose layer is the player's, so it follows the view's size and rotation.
final class PlayerLayerView: UIView {
  override static var layerClass: AnyClass { AVPlayerLayer.self }
  // SAFETY: `layerClass` makes the view's layer an AVPlayerLayer.
  var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
  #if os(tvOS)
    override var canBecomeFocused: Bool { false }
  #endif
}

/// AVPlayer's picture, with platform-specific lifecycle callbacks.
struct PlayerSurface: UIViewRepresentable {
  let player: AVPlayer?
  let fill: Bool
  var rebindPlayer = false
  var attached: (AVPlayerLayer) -> Void = { _ in }
  var updated: () -> Void = {}

  func makeUIView(context: Context) -> PlayerLayerView {
    let view = PlayerLayerView()
    view.backgroundColor = .black
    view.isUserInteractionEnabled = false
    view.playerLayer.player = player
    view.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
    attached(view.playerLayer)
    return view
  }

  func updateUIView(_ view: PlayerLayerView, context: Context) {
    if rebindPlayer, view.playerLayer.player !== player { view.playerLayer.player = player }
    let gravity: AVLayerVideoGravity = fill ? .resizeAspectFill : .resizeAspect
    if view.playerLayer.videoGravity != gravity {
      CATransaction.begin()
      CATransaction.setAnimationDuration(Motion.moveDuration)
      view.playerLayer.videoGravity = gravity
      CATransaction.commit()
    }
    updated()
  }

  static func dismantleUIView(_ view: PlayerLayerView, coordinator: ()) {
    view.playerLayer.player = nil
  }
}

