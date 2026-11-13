import AVFoundation
import Foundation

@MainActor protocol PlaybackEngine: AnyObject {
  var player: AVPlayer { get }
  func load(_ source: Source, headers: [String: String]) async throws
  func seek(_ seconds: Double) async
  func selectAudio(_ ordinal: Int) async
  func hasVideoFrame() -> Bool
  func clear()
}
@MainActor final class AVPlayerEngine: PlaybackEngine {
  let player = AVPlayer()
  private var videoOutput: AVPlayerItemVideoOutput?
  private var generation = 0
  func load(_ source: Source, headers: [String: String]) async throws {
    guard let url = URL(string: source.url) else { throw URLError(.badURL) }
    let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
    generation += 1; let request = generation
    let item = AVPlayerItem(asset: asset)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: nil)
    item.add(output); videoOutput = output
    player.replaceCurrentItem(with: item)
    if let group = try await asset.loadMediaSelectionGroup(for: .legible) { item.select(nil, in: group) }
    guard request == generation else { return }
    await seek(source.start)
  }
  func seek(_ seconds: Double) async { await player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) }
  func selectAudio(_ ordinal: Int) async {
    guard let item = player.currentItem, let group = try? await item.asset.loadMediaSelectionGroup(for: .audible), group.options.indices.contains(ordinal) else { return }
    // AVFoundation's media-selection group is in audio-track order, not
    // ffprobe's mixed video/audio/subtitle stream-index space.
    item.select(group.options[ordinal], in: group)
  }
  func hasVideoFrame() -> Bool {
    guard let videoOutput else { return false }
    let time = player.currentTime()
    guard videoOutput.hasNewPixelBuffer(forItemTime: time) else { return false }
    return videoOutput.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) != nil
  }
  func clear() { generation += 1; player.pause(); player.replaceCurrentItem(with: nil); videoOutput = nil }
}
