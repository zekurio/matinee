import AVFoundation
import MatineeCore
import MatineeKit
import MatineeMPV
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Video`: the controller's engine on black, whole or
 * filling the screen and cut at its edges. AVPlayer shows in an
 * `AVPlayerLayer`, mpv in MatineeMPV's own surface, which also draws its
 * styled and bitmap subtitles. Neither takes focus or presses: the picture
 * holds focus through the kit's `TVFocusSurface` laid over it.
 *
 */

/// The video of whichever engine plays, on black.
struct TVVideo: View {
  let controller: PlayerController
  let fill: Bool

  var body: some View {
    ZStack {
      Color.black
      if let engine = controller.playbackEngine as? MPVPlaybackEngine {
        // mpv fits or fills the video itself, its own subtitles with it.
        MPVPlaybackSurface(engine: engine, fill: fill)
      } else {
        PlayerSurface(player: controller.player, fill: fill, rebindPlayer: true)
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

