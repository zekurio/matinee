import MatineeCore
import Nuke
import NukeUI
import MatineeKit
import SwiftUI
import UIKit

/*
 * Picture.kt: images from the server over their blurred placeholders, the
 * tones that stand in for missing art, and the logo. `ImageSource` and the
 * API's `art`, `frame`, and `landscape` are MatineeCore's (Images/), as is
 * the blur hash decoder. Icons are the kit's `LucideIcon`.
 */

extension ImagePipeline {
  /// The pipeline for the server in use: `headers`, the session's
  /// `Authorization`, go with requests to `server` and nowhere else, so an
  /// image from anywhere else never gets the token. The root makes one per
  /// sign-in and hands it down with `.environment(\.imagePipeline, …)`.
  nonisolated static func matinee(server: URL?, headers: [String: String]) -> ImagePipeline {
    guard let server, !headers.isEmpty else { return .anonymous }
    return ImagePipeline(delegate: SignedImages(server: server, headers: headers)) { configure(&$0) }
  }

  /// Without a session: the gallery, and public images.
  nonisolated static let anonymous = ImagePipeline { configure(&$0) }

  /// Decoded images are kept in memory as Nuke does by default; the
  /// server's answers are cached on disk too, once, in the data cache, so a
  /// rail scrolling back doesn't fetch them again. Nuke's own URL cache
  /// would keep a second copy that `forgetAll` doesn't reach.
  nonisolated private static func configure(_ configuration: inout ImagePipeline.Configuration) {
    let loading = DataLoader.defaultConfiguration
    loading.urlCache = nil
    configuration.dataLoader = DataLoader(configuration: loading)
    configuration.dataCache = try? DataCache(name: CACHE_NAME)
  }

  nonisolated private static let CACHE_NAME = "io.github.zekurio.matinee.images"

  /// Every image the app keeps, in memory and on disk: a removed server's,
  /// or a signed-out account's, go with it.
  nonisolated static func forgetAll() {
    ImageCache.shared.removeAll()
    (try? DataCache(name: CACHE_NAME))?.removeAll()
    // What earlier builds left in the URL caches: Nuke's of images, the system's of the API's answers.
    DataLoader.sharedUrlCache.removeAllCachedResponses()
    URLCache.shared.removeAllCachedResponses()
  }
}

/// Adds the session's headers to requests for its server's origin.
private final class SignedImages: ImagePipeline.Delegate {
  let server: URL
  let headers: [String: String]

  init(server: URL, headers: [String: String]) {
    self.server = server
    self.headers = headers
  }

  func willLoadData(for request: ImageRequest, urlRequest: URLRequest, pipeline: ImagePipeline) async throws
    -> URLRequest
  {
    guard let url = urlRequest.url, url.scheme == server.scheme, url.host == server.host, url.port == server.port
    else { return urlRequest }
    var signed = urlRequest
    for (name, value) in headers { signed.setValue(value, forHTTPHeaderField: name) }
    return signed
  }
}

extension EnvironmentValues {
  @Entry var imagePipeline: ImagePipeline = .anonymous
}

/// The first of `sources` that loads, fading in over its blurred placeholder
/// while it loads. Nothing when every one fails, so what's beneath shows:
/// the tone and name of `PosterArt`, or the film icon of a still. It fills
/// what it's given and never sizes it, so give it a frame or put it in an
/// `ArtFrame`:
///
///     ArtFrame(title.name, aspect: 16 / 9) { Picture(api?.landscape(item) ?? []) }
///
/// Images load with the session's sign-in through the root's pipeline, and
/// only from the server in use (`ImagePipeline.matinee`).
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
