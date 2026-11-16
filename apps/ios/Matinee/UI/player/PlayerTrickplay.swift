import MatineeCore
import SwiftUI
import UIKit

/// The trickplay frame at `seconds`, cut from the server's tiles; black while its tile loads.
struct TrickplayFrameView: View {
  let controller: PlayerController
  let seconds: Double
  @State private var tiles = TrickplayTiles.shared

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
@Observable final class TrickplayTiles {
  static let shared = TrickplayTiles()
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
