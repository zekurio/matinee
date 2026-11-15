import CoreImage
import CoreImage.CIFilterBuiltins
import MatineeKit
import SwiftUI

/// `text` as a QR code, black on a white card whatever the theme: phones'
/// cameras read dark on light best, and the card's padding is the quiet
/// zone they need around it.
struct QrCode: View {
  let text: String
  let label: String
  var size: CGFloat = 220
  @Environment(\.palette) private var palette
  @Environment(\.displayScale) private var displayScale

  init(_ text: String, label: String, size: CGFloat = 220) {
    self.text = text
    self.label = label
    self.size = size
  }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: size / 14, style: .continuous)
    let matrix = QrMatrix.encode(text)
    Canvas { context, canvas in
      guard let matrix else { return }
      let modules = matrix.count
      // Whole pixels per module, so neighbours meet without seams.
      let side = min(canvas.width, canvas.height)
      let cell = (side * displayScale / CGFloat(modules)).rounded(.down) / displayScale
      let inset = ((side - cell * CGFloat(modules)) / 2 * displayScale).rounded() / displayScale
      var path = Path()
      for (y, row) in matrix.enumerated() {
        var x = 0
        while x < modules {
          guard row[x] else {
            x += 1
            continue
          }
          // One rectangle per run of dark modules in the row.
          let start = x
          while x < modules && row[x] { x += 1 }
          path.addRect(
            CGRect(
              x: inset + CGFloat(start) * cell, y: inset + CGFloat(y) * cell, width: CGFloat(x - start) * cell,
              height: cell))
        }
      }
      context.fill(path, with: .color(.black))
    }
    .padding(size / 14)
    .frame(width: size, height: size)
    .background(.white, in: shape)
    .overlay { shape.strokeBorder(palette.border) }
    .accessibilityElement()
    .accessibilityLabel(label)
    .accessibilityAddTraits(.isImage)
  }
}

/// The modules of a QR code, row by row, from CoreImage's generator at
/// error correction level M, as Android's ZXing encodes it.
enum QrMatrix {
  private static let context = CIContext(options: [.useSoftwareRenderer: false])
  private static let cache = NSCache<NSString, Box>()

  private final class Box {
    let matrix: [[Bool]]
    init(_ matrix: [[Bool]]) { self.matrix = matrix }
  }

  static func encode(_ text: String) -> [[Bool]]? {
    if let box = cache.object(forKey: text as NSString) { return box.matrix }
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(text.utf8)
    filter.correctionLevel = "M"
    guard let image = filter.outputImage,
      let cgImage = context.createCGImage(image, from: image.extent)
    else { return nil }
    let width = cgImage.width
    let height = cgImage.height
    var pixels = [UInt8](repeating: 0, count: width * height)
    guard
      let bitmap = CGContext(
        data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    bitmap.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    let dark = (0..<height).map { y in (0..<width).map { x in pixels[y * width + x] < 128 } }
    // CoreImage draws a quiet zone around the code; the card's padding is ours.
    let rows = dark.indices.filter { dark[$0].contains(true) }
    let columns = (0..<width).filter { x in dark.contains { $0[x] } }
    guard let top = rows.first, let bottom = rows.last, let left = columns.first, let right = columns.last
    else { return nil }
    let matrix = dark[top...bottom].map { Array($0[left...right]) }
    cache.setObject(Box(matrix), forKey: text as NSString)
    return matrix
  }
}
