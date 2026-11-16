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

/// The trickplay frame at `seconds`, cut from the server's tiles; black while its tile loads.
struct TVTrickplayFrame: View {
  let controller: PlayerController
  let seconds: Double
  @State private var tiles = TVTrickplayTiles.shared

  var body: some View {
    ZStack {
      Color.black
      if let frame = controller.trickplayFrame(at: seconds), let image = tiles.frame(frame, controller) {
        Image(uiImage: image).resizable().interpolation(.medium)
      }
    }
  }
}

/// Trickplay tiles as they load, kept while the player shows: one sheet
/// holds many frames, so a scrub across it loads it once.
///
/// TODO(share): the iPhone's `TrickplayTiles` and `TrickplayFrameView`
/// (Matinee/UI/player/PlayerSeekBar.swift), copied because that file holds
/// the touch seek bar too. The split: both into `PlayerTrickplay.swift`,
/// shared by both targets.
@Observable final class TVTrickplayTiles {
  static let shared = TVTrickplayTiles()
  private var sheets: [String: CGImage] = [:]
  @ObservationIgnored private var loading: Set<String> = []

  /// The frame cut from its sheet, or nil while the sheet loads.
  func frame(_ frame: TrickplayFrame, _ controller: PlayerController) -> UIImage? {
    guard let sheet = sheets[frame.url] else {
      load(frame.url, controller)
      return nil
    }
    let rect = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
    return sheet.cropping(to: rect).map { UIImage(cgImage: $0) }
  }

  func clear() {
    sheets = [:]
    loading = []
  }

  private func load(_ address: String, _ controller: PlayerController) {
    guard !loading.contains(address), let url = URL(string: address) else { return }
    loading.insert(address)
    Task {
      let request = await controller.mediaRequest(url: url)
      guard let (data, response) = try? await URLSession.shared.data(for: request),
        (response as? HTTPURLResponse)?.statusCode == 200,
        let image = UIImage(data: data)?.cgImage
      else {
        loading.remove(address)
        return
      }
      sheets[address] = image
    }
  }
}
