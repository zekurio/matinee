import Foundation

public struct FrameSize: Sendable, Hashable {
  public let width: Int
  public let height: Int
  public init(width: Int, height: Int) {
    self.width = width
    self.height = height
  }
}
public struct VideoDecoder: Sendable, Hashable {
  public let codec: String
  public let widest: FrameSize?
  public let tallest: FrameSize?
  public let tenBit: Bool
  public init(codec: String, widest: FrameSize?, tallest: FrameSize?, tenBit: Bool) {
    self.codec = codec
    self.widest = widest
    self.tallest = tallest
    self.tenBit = tenBit
  }
}
public struct DeviceCodecs: Sendable, Hashable {
  public let video: [VideoDecoder]
  public let audio: Set<String>
  public let dolbyVision: Bool
  public init(video: [VideoDecoder], audio: Set<String>, dolbyVision: Bool) {
    self.video = video
    self.audio = audio
    self.dolbyVision = dolbyVision
  }
}
public let OPTIONAL_PASSTHROUGH = ["ac3", "eac3", "flac", "alac"]
public func profileLanguage(_ locale: Locale) -> String {
  locale.language.languageCode?.identifier ?? "en"
}
// Decoder limits are shared data. AVPlayer capability probing and profile assembly belong to the player task.
public func profileDecoders(_ decoder: VideoDecoder, dolbyVision: Bool) -> [PlaybackDecoder] {
  var sizes: [FrameSize?] = []
  for size in [decoder.widest, decoder.tallest].compactMap({ $0 }) where !sizes.contains(size) {
    sizes.append(size)
  }
  if sizes.isEmpty { sizes = [nil] }
  return sizes.map { size in
    PlaybackDecoder(
      codec: decoder.codec, maxWidth: size.map { Double($0.width) },
      maxHeight: size.map { Double($0.height) }, maxBitDepth: decoder.tenBit ? 10 : 8,
      profiles: nil, maxLevel: nil, hdr: nil,
      dolbyVisionProfiles: decoder.codec == "hevc" && decoder.tenBit && dolbyVision ? [5, 8] : [])
  }
}
