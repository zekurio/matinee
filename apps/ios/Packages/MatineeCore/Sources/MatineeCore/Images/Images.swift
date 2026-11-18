import Foundation

/// An image to load, and the blurred stand-in to show until it does.
public struct ImageSource: Hashable, Sendable {
  public var url: URL
  public var placeholder: ImagePlaceholder?

  public init(url: URL, placeholder: ImagePlaceholder? = nil) {
    self.url = url
    self.placeholder = placeholder
  }

  public init?(_ url: String, placeholder: ImagePlaceholder? = nil) {
    guard let url = URL(string: url) else { return nil }
    self.init(url: url, placeholder: placeholder)
  }
}

extension ContractApi {
  /// A piece of artwork at `size`, with its blur hash.
  public func art(_ artwork: Artwork?, size: ArtworkSize = .small) -> ImageSource? {
    artwork.flatMap { ImageSource(paths.artwork($0.id, size: size), placeholder: $0.placeholder) }
  }

  /// A frame from the file itself, which has no placeholder.
  public func frame(_ itemId: String, large: Bool = false) -> ImageSource? {
    ImageSource(paths.thumbnail(itemId, large: large))
  }

  /// Landscape images for a file, best first: the episode's still, then a
  /// frame from the file, then the show's backdrop; for a movie, its
  /// backdrop first.
  public func landscape(_ item: MediaItem, size: ArtworkSize = .small) -> [ImageSource] {
    let still = art(item.episode?.still, size: size)
    let backdrop = art(item.title?.images.backdrop, size: size)
    let file = frame(item.id, large: size == .medium || size == .large)
    let sources = item.title?.kind == TitleKind.movie ? [backdrop, file] : [still, file, backdrop]
    return sources.compactMap(\.self)
  }
}

/// A BlurHash (https://blurha.sh) decoded to pixels: the blurred stand-in
/// the server sends with each image, so a card shows its colors while the
/// image loads, as the web app and Android do.
public enum BlurHash {
  private static let digits = Array(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~".utf8)
  private static let values: [UInt8: Int] = Dictionary(
    uniqueKeysWithValues: digits.enumerated().map { ($1, $0) })

  /// RGBA bytes, `width` by `height`, opaque; nil for a hash that isn't one.
  public static func decode(_ hash: String, width: Int = 32, height: Int = 32) -> [UInt8]? {
    let text = Array(hash.utf8)
    guard text.count >= 6, let size = decode83(text, 0, 1) else { return nil }
    let nx = size % 9 + 1
    let ny = size / 9 + 1
    guard text.count == 4 + 2 * nx * ny, let quantised = decode83(text, 1, 2) else { return nil }
    let maxAc = Double(quantised + 1) / 166
    var colors: [(Double, Double, Double)] = []
    for i in 0..<(nx * ny) {
      if i == 0 {
        guard let dc = decode83(text, 2, 6) else { return nil }
        colors.append((toLinear(dc >> 16), toLinear((dc >> 8) & 255), toLinear(dc & 255)))
      } else {
        guard let ac = decode83(text, 4 + i * 2, 6 + i * 2) else { return nil }
        colors.append(
          (
            signPow(Double(ac / (19 * 19) - 9) / 9, 2) * maxAc,
            signPow(Double((ac / 19) % 19 - 9) / 9, 2) * maxAc,
            signPow(Double(ac % 19 - 9) / 9, 2) * maxAc
          ))
      }
    }
    let cosX = (0..<width).map { x in (0..<nx).map { cos(Double.pi * Double(x * $0) / Double(width)) } }
    let cosY = (0..<height).map { y in (0..<ny).map { cos(Double.pi * Double(y * $0) / Double(height)) } }
    var pixels = [UInt8](repeating: 255, count: width * height * 4)
    for y in 0..<height {
      for x in 0..<width {
        var r = 0.0
        var g = 0.0
        var b = 0.0
        for j in 0..<ny {
          for i in 0..<nx {
            let basis = cosX[x][i] * cosY[y][j]
            let color = colors[i + j * nx]
            r += color.0 * basis
            g += color.1 * basis
            b += color.2 * basis
          }
        }
        let offset = (x + y * width) * 4
        pixels[offset] = toSrgb(r)
        pixels[offset + 1] = toSrgb(g)
        pixels[offset + 2] = toSrgb(b)
      }
    }
    return pixels
  }

  private static func decode83(_ text: [UInt8], _ from: Int, _ to: Int) -> Int? {
    var value = 0
    for i in from..<to {
      guard let digit = values[text[i]] else { return nil }
      value = value * 83 + digit
    }
    return value
  }

  private static func toLinear(_ value: Int) -> Double {
    let v = Double(value) / 255
    return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
  }

  private static func toSrgb(_ value: Double) -> UInt8 {
    let v = min(max(value, 0), 1)
    let srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1 / 2.4) - 0.055
    return UInt8(min(max(Int(srgb * 255 + 0.5), 0), 255))
  }

  private static func signPow(_ value: Double, _ exponent: Double) -> Double {
    (value < 0 ? -1 : 1) * pow(abs(value), exponent)
  }
}
