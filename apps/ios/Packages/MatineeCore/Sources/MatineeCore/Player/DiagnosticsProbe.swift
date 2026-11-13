import AVFoundation
import Foundation

public struct TrackDiagnostics: Codable, Sendable, Equatable {
  public var mediaType: String
  public var codec: String
  public var width: Int32
  public var height: Int32
  public var channels: UInt32?
  public var sampleRate: Double?
}
public enum DiagnosticsProbe {
  public static func tracks(_ asset: AVAsset) async throws -> [TrackDiagnostics] {
    var result: [TrackDiagnostics] = []
    for track in try await asset.load(.tracks) {
      for format in try await track.load(.formatDescriptions) {
        let subtype = CMFormatDescriptionGetMediaSubType(format)
        let bytes: [UInt8] = [24, 16, 8, 0].map { UInt8((subtype >> $0) & 255) }
        let dimensions =
          track.mediaType == .video
          ? CMVideoFormatDescriptionGetDimensions(format) : CMVideoDimensions(width: 0, height: 0)
        let audio =
          track.mediaType == .audio
          ? CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee : nil
        result.append(
          TrackDiagnostics(
            mediaType: track.mediaType.rawValue,
            codec: String(bytes: bytes, encoding: .ascii) ?? "", width: dimensions.width,
            height: dimensions.height, channels: audio?.mChannelsPerFrame,
            sampleRate: audio?.mSampleRate))
      }
    }
    return Array(result.prefix(4))
  }
}
