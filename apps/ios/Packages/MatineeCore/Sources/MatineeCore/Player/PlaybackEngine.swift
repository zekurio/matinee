import AVFoundation
import Foundation

/// What the controller drives: AVPlayer today, mpv later, a fake in tests.
/// Times are in the source's own timeline; the controller adds the offset.
@MainActor public protocol PlaybackEngine: AnyObject {
  var avPlayer: AVPlayer? { get }
  var durationSeconds: Double { get }
  var isPlaying: Bool { get }
  var isLoading: Bool { get }
  var positionSeconds: Double { get }
  /// How far the source is buffered, in its own time.
  var bufferedSeconds: Double? { get }
  /// The picture's size as it shows, its pixel aspect applied.
  var videoSize: CGSize { get }
  var failure: (any Error)? { get }
  /// The source can play: ExoPlayer's `STATE_READY`.
  var isReady: Bool { get }
  func play(atRate rate: Float)
  func pause()
  func load(_ source: Source, headers: [String: String]) async throws
  func seek(_ seconds: Double) async
  /// Picks the audio inside the file, by its place among the file's audio tracks.
  func selectAudio(_ ordinal: Int) async
  /// Lets the engine draw a subtitle track of the file, by its place among
  /// the file's subtitle tracks, or none for nil. The view draws the rest.
  func selectSubtitle(_ ordinal: Int?) async
  func hasVideoFrame() -> Bool
  /// The tracks of what plays, which of them are selected, for the report.
  func tracks() async -> [TrackDiagnostics]
  func loadSubtitle(url: URL, headers: [String: String]) async throws -> Bool
  func clear()
}
extension PlaybackEngine {
  public func loadSubtitle(url: URL, headers: [String: String]) async throws -> Bool { false }
  public var avPlayer: AVPlayer? { nil }
}

@MainActor protocol AVPlaybackEngine: PlaybackEngine {
  var player: AVPlayer { get }
}
extension AVPlaybackEngine {
  var avPlayer: AVPlayer? { player }
  var durationSeconds: Double { player.currentItem?.duration.seconds ?? 0 }
  var isPlaying: Bool { player.timeControlStatus == .playing }
  var isLoading: Bool { player.timeControlStatus == .waitingToPlayAtSpecifiedRate }
  var positionSeconds: Double { player.currentTime().seconds }
  var bufferedSeconds: Double? {
    guard let range = player.currentItem?.loadedTimeRanges.last?.timeRangeValue else { return nil }
    return range.start.seconds + range.duration.seconds
  }
  var videoSize: CGSize { player.currentItem?.presentationSize ?? .zero }
  var failure: (any Error)? { player.currentItem?.error }
  var isReady: Bool { player.currentItem?.status == .readyToPlay }
  func tracks() async -> [TrackDiagnostics] {
    // The item knows which tracks play; its asset alone would call them all not selected.
    guard let item = player.currentItem else { return [] }
    return (try? await DiagnosticsProbe.tracks(item)) ?? []
  }
  func play(atRate rate: Float) { player.playImmediately(atRate: rate) }
  func pause() { player.pause() }
}

@MainActor final class AVPlayerEngine: AVPlaybackEngine {
  let player = AVPlayer()
  private var videoOutput: AVPlayerItemVideoOutput?
  private var generation = 0
  func load(_ source: Source, headers: [String: String]) async throws {
    guard let url = URL(string: source.url) else { throw URLError(.badURL) }
    let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
    generation += 1
    let request = generation
    let item = AVPlayerItem(asset: asset)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: nil)
    item.add(output)
    videoOutput = output
    player.replaceCurrentItem(with: item)
    // Subtitles are drawn by the player view from the server's WebVTT, but
    // for a track the answer gives the engine; see selectSubtitle.
    if let group = try await asset.loadMediaSelectionGroup(for: .legible) {
      item.select(nil, in: group)
    }
    guard request == generation else { return }
    await seek(source.start)
  }
  func seek(_ seconds: Double) async {
    await player.seek(
      to: CMTime(seconds: max(0, seconds), preferredTimescale: 600), toleranceBefore: .zero,
      toleranceAfter: .zero)
  }
  func selectAudio(_ ordinal: Int) async {
    guard let item = player.currentItem,
      let group = try? await item.asset.loadMediaSelectionGroup(for: .audible),
      group.options.indices.contains(ordinal)
    else { return }
    // AVFoundation's media-selection group is in audio-track order, not
    // ffprobe's mixed video/audio/subtitle stream-index space.
    item.select(group.options[ordinal], in: group)
  }
  func selectSubtitle(_ ordinal: Int?) async {
    guard let item = player.currentItem,
      let group = try? await item.asset.loadMediaSelectionGroup(for: .legible)
    else { return }
    // As with audio, the legible group lists the file's subtitle tracks in
    // file order, which the ordinal counts in.
    let option = ordinal.flatMap { group.options.indices.contains($0) ? group.options[$0] : nil }
    item.select(option, in: group)
  }
  func hasVideoFrame() -> Bool {
    guard let videoOutput else { return false }
    let time = player.currentTime()
    guard videoOutput.hasNewPixelBuffer(forItemTime: time) else { return false }
    return videoOutput.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) != nil
  }
  func clear() {
    generation += 1
    player.pause()
    player.replaceCurrentItem(with: nil)
    videoOutput = nil
  }
}
