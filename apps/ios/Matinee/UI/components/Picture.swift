import MatineeCore
import Nuke
import NukeUI
import SwiftUI
import UIKit

/*
 * Picture.kt: images from the server over their blurred placeholders, the
 * tones that stand in for missing art, the lucide icons, and the logo.
 * `ImageSource` and the API's `art`, `frame`, and `landscape` are
 * MatineeCore's (Images/), as is the blur hash decoder.
 */

extension ImagePipeline {
  /// The pipeline for a server's images. `headers` go with every request,
  /// as the session's `Authorization` will: the root makes one per sign-in
  /// and hands it down with `.environment(\.imagePipeline, …)`.
  nonisolated static func matinee(headers: [String: String] = [:]) -> ImagePipeline {
    ImagePipeline {
      let configuration = DataLoader.defaultConfiguration
      configuration.httpAdditionalHeaders = headers
      $0.dataLoader = DataLoader(configuration: configuration)
      // Decoded images are kept in memory as Nuke does by default; the
      // server's answers are cached on disk too, so a rail scrolling back
      // doesn't fetch them again.
      $0.dataCache = try? DataCache(name: "io.github.zekurio.matinee.images")
    }
  }

  /// Without a session: the gallery, and public images.
  nonisolated static let anonymous = ImagePipeline.matinee()
}

extension EnvironmentValues {
  @Entry var imagePipeline: ImagePipeline = .anonymous
}

/// The first of `sources` that loads, fading in over its blurred placeholder
/// while it loads. Nothing when every one fails, so what's beneath shows:
/// the tone and name of `PosterArt`, or the film icon of a still.
struct Picture: View {
  let sources: [ImageSource]
  var contentMode: ContentMode = .fill
  var alignment: Alignment = .center

  @Environment(\.imagePipeline) private var pipeline
  @State private var failed: Set<URL> = []

  init(_ sources: [ImageSource], contentMode: ContentMode = .fill, alignment: Alignment = .center) {
    self.sources = sources
    self.contentMode = contentMode
    self.alignment = alignment
  }

  init(_ source: ImageSource?, contentMode: ContentMode = .fill, alignment: Alignment = .center) {
    self.init(source.map { [$0] } ?? [], contentMode: contentMode, alignment: alignment)
  }

  var body: some View {
    // Sized by what it's offered, never by the image, which only fills it.
    Color.clear
      .overlay {
        if let hash = sources.first?.placeholder?.blurhash, let image = BlurHashImage.image(hash) {
          Image(uiImage: image).resizable().scaledToFill()
        }
      }
      .overlay(alignment: alignment) {
        if let source = sources.first(where: { !failed.contains($0.url) }) {
          LazyImage(request: ImageRequest(url: source.url), transaction: Transaction(animation: Motion.image)) {
            state in
            if let image = state.image {
              image.resizable().aspectRatio(contentMode: contentMode).transition(.opacity)
            }
          }
          .pipeline(pipeline)
          .onCompletion { result in
            if case .failure = result { failed.insert(source.url) }
          }
          .id(source.url)
        }
      }
      .clipped()
      .accessibilityHidden(true)
  }
}

/// Blur hashes as images, decoded once each.
enum BlurHashImage {
  private static let cache = NSCache<NSString, UIImage>()

  static func image(_ hash: String) -> UIImage? {
    if let image = cache.object(forKey: hash as NSString) { return image }
    let size = 32
    guard let pixels = BlurHash.decode(hash, width: size, height: size),
      let provider = CGDataProvider(data: Data(pixels) as CFData),
      let cgImage = CGImage(
        width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider,
        decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    else { return nil }
    let image = UIImage(cgImage: cgImage)
    cache.setObject(image, forKey: hash as NSString)
    return image
  }
}

/// The neutral gradient that stands in for missing art, the same one for the same key.
struct Tone: View {
  let key: String
  @Environment(\.palette) private var palette

  init(_ key: String) { self.key = key }

  var body: some View {
    let tones = palette.tones
    let (from, to) = tones[toneIndex(key, count: tones.count)]
    LinearGradient(colors: [from, to], startPoint: .topLeading, endPoint: .bottomTrailing)
  }
}

/// A lucide icon (see `Lucide`), in the foreground color unless `tint` says
/// otherwise. `size` is in points at the default text size and grows with
/// Dynamic Type, as an SF Symbol in a label does. With a `label`, VoiceOver
/// reads it; without, the icon is decoration and VoiceOver skips it.
struct LucideIcon: View {
  let icon: Lucide
  var label: String?
  var size: CGFloat
  var tint: Color?
  /// How Dynamic Type has grown body text, which icons follow.
  @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

  init(_ icon: Lucide, label: String? = nil, size: CGFloat = 20, tint: Color? = nil) {
    self.icon = icon
    self.label = label
    self.size = size
    self.tint = tint
  }

  var body: some View {
    let image = Image(icon)
      .resizable()
      .frame(width: size * scale, height: size * scale)
    Group {
      if let tint { image.foregroundStyle(tint) } else { image }
    }
    .accessibilityHidden(label == nil)
    .accessibilityLabel(label ?? "")
  }
}

extension Image {
  /// A lucide icon as a template image, for a `Label`, a menu item, or a
  /// button the system draws.
  init(_ icon: Lucide) {
    self.init(icon.name)
    self = self.renderingMode(.template)
  }
}

/// The sunset mark. It has its own colors, which never take the theme's or
/// the server's accent; the asset has one for light backgrounds and one for dark.
struct LogoMark: View {
  var size: CGFloat = 24

  var body: some View {
    Image("logo_mark").resizable().scaledToFit().frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/// The mark with the wordmark beside it, from brand/wordmark.py. `height` is
/// the word's, which the mark matches; the round letters dip a little below.
struct Logo: View {
  var height: CGFloat = 24

  var body: some View {
    // The drawing is 24.5 tall for a word 24 to its baseline, as Android's.
    Image("logo").resizable().scaledToFit().frame(height: height * 24.5 / 24)
      .accessibilityLabel(Str.appName)
  }
}
