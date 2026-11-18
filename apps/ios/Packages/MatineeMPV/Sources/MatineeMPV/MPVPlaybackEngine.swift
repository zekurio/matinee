import Foundation
import MPVUI
import MatineeCore
import Observation
import SwiftUI

enum MPVLoadError: LocalizedError {
  case readinessTimedOut

  var errorDescription: String? { "The player did not become ready in time." }
}

@MainActor @Observable public final class MPVPlaybackEngine: PlaybackEngine {
  public let mpv: MPVPlayer
  public private(set) var text = ""
  @ObservationIgnored private var lastSample: Int64?
  @ObservationIgnored private var subtitles: Task<Void, Never>?
  #if DEBUG
    @ObservationIgnored private var debugLoaded = false
    @ObservationIgnored private var debugTrace: Task<Void, Never>?
  #endif

  public init() {
    mpv = MPVPlayer(
      configuration: .init(
        additionalOptions: ["sid": "no"], audio: .init(audioSession: .hostManaged),
        automaticallyPlays: false))
    mpv.setDiagnosticsEnabled(true)
    mpv.setTextSubtitleInterceptionEnabled(true)
    let stream = mpv.makeTextSubtitleStream()
    subtitles = Task { [weak self] in
      for await snapshot in stream {
        guard !Task.isCancelled else { return }
        self?.text = snapshot.text
      }
    }
  }
  public var mpvStatistics: MPVStatistics? {
    let d = mpv.playbackDiagnostics
    let decode: String?
    switch d.decoder.session {
    case .unknown: decode = nil
    case .software: decode = "software"
    case .hardware(let name): decode = "hardware-\(name)"
    }
    return MPVStatistics(
      activeAudioOrdinal: mpv.audioTracks.firstIndex(where: \.isSelected).map { $0 + 1 },
      audioCodec: mpv.mediaInformation.audioCodec,
      decoder: d.decoder.codec, decode: decode,
      videoOutput: "sample-buffer", decoderDroppedFrames: d.decoderDroppedFrames,
      outputDroppedFrames: d.outputDroppedFrames,
      samples: d.nativeOutputStatistics?.sampleBuildCount)
  }
  public var isPlaying: Bool { mpv.state == .playing && !mpv.isPaused }
  public var isLoading: Bool { mpv.state == .loading || mpv.bufferStatus.isBuffering }
  public var isReady: Bool { mpv.isPlaybackReady }
  public var positionSeconds: Double { seconds(mpv.position) }
  public var durationSeconds: Double { seconds(mpv.duration) }
  public var bufferedSeconds: Double? { mpv.bufferStatus.bufferedEnd.map(seconds) }
  public var videoSize: CGSize {
    guard let size = mpv.mediaInformation.presentationDimensions else { return .zero }
    return CGSize(width: size.width, height: size.height)
  }
  public var failure: (any Error)? {
    if case .failed(let error) = mpv.state { return error }
    return nil
  }
  public func play(atRate rate: Float) {
    mpv.setPlaybackRate(Double(rate))
    mpv.play()
  }
  public func pause() { mpv.pause() }
  public func load(_ source: Source, headers: [String: String]) async throws {
    #if DEBUG
      var address = source.url
      if !debugLoaded, let first = UserDefaults.standard.string(forKey: "player.firstURL") {
        address = first
      }
      debugLoaded = true
    #else
      let address = source.url
    #endif
    guard let url = URL(string: address) else { throw URLError(.badURL) }
    #if DEBUG
      trace("load method=\(source.method ?? "local")")
      if UserDefaults.standard.bool(forKey: "player.trace"), debugTrace == nil {
        debugTrace = Task { [weak self] in
          while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            guard let self else { return }
            self.trace("state=\(self.mpv.state) position=\(self.positionSeconds) ready=\(self.isReady) samples=\(self.mpvStatistics?.samples ?? 0)")
          }
        }
      }
    #endif
    // mpv string-list syntax escapes commas and backslashes. No headers for local files.
    let fields =
      url.isFileURL
      ? []
      : headers.sorted { $0.key < $1.key }.map { key, value in
        "\(key): \(value)".replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(
          of: ",", with: "\\,")
      }
    mpv.setProperty("http-header-fields", to: fields.joined(separator: ","))
    mpv.load(url, playAutomatically: false, startTime: .seconds(source.start))
    let generation = mpv.generation
    // Controller track ordinals must not be applied until this file's tracks arrive.
    let deadline = Date().addingTimeInterval(20)
    while !mpv.isPlaybackReady {
      if Date() > deadline {
        #if DEBUG
          trace("load timeout")
        #endif
        // This deadline covers demux, decoder and surface setup too. It is
        // not evidence of a network outage, which would suppress fallback.
        throw MPVLoadError.readinessTimedOut
      }
      try Task.checkCancellation()
      guard generation == mpv.generation else { throw CancellationError() }
      if let failure {
        #if DEBUG
          trace("load failed: \(failure)")
        #endif
        throw failure
      }
      try await Task.sleep(for: .milliseconds(20))
    }
  }
  public func seek(_ seconds: Double) async { mpv.seek(to: .seconds(max(0, seconds))) }
  public func selectAudio(_ ordinal: Int) async {
    guard mpv.audioTracks.indices.contains(ordinal) else { return }
    mpv.selectTrack(mpv.audioTracks[ordinal].id)
  }
  public func selectSubtitle(_ ordinal: Int?) async {
    let track = ordinal.flatMap {
      mpv.subtitleTracks.indices.contains($0) ? mpv.subtitleTracks[$0] : nil
    }
    mpv.selectSubtitle(track?.id)
  }
  public func hasVideoFrame() -> Bool {
    guard mpv.hasVideoFrame else { return false }
    let sample = mpv.playbackDiagnostics.nativeOutputStatistics?.sampleBuildCount
    defer { lastSample = sample }
    return sample != nil && sample != lastSample
  }
  public func loadSubtitle(url: URL, headers: [String: String]) async throws -> Bool {
    guard
      url.pathExtension.lowercased() == "ass"
        || URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: {
          $0.name == "delivery" && $0.value == "ass"
        }) == true
    else { return false }
    _ = try await mpv.loadExternalTrack(.init(url: url, type: .subtitle, selection: .selected))
    return true
  }
  public func tracks() async -> [TrackDiagnostics] {
    mpv.mediaInformation.tracks.prefix(12).map { track in
      var result = TrackDiagnostics(
        mediaType: track.type == .audio ? "audio" : track.type == .video ? "video" : "text",
        codec: track.codec ?? "other", width: 0, height: 0, channels: nil, sampleRate: nil)
      result.type = track.type == .audio ? .audio : track.type == .video ? .video : .text
      result.selected = track.isSelected
      return result
    }
  }
  public func clear() {
    #if DEBUG
      debugTrace?.cancel()
      debugTrace = nil
    #endif
    mpv.stop()
    text = ""
    lastSample = nil
  }
  #if DEBUG
    private func trace(_ line: String) {
      guard UserDefaults.standard.bool(forKey: "player.trace") else { return }
      let url = FileManager.default.temporaryDirectory.appending(path: "mpv-trace.txt")
      let data = Data("\(Date().timeIntervalSince1970) \(line)\n".utf8)
      if !FileManager.default.fileExists(atPath: url.path) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
      }
      guard let handle = try? FileHandle(forWritingTo: url) else { return }
      defer { try? handle.close() }
      _ = try? handle.seekToEnd()
      try? handle.write(contentsOf: data)
    }
  #endif
  private func seconds(_ value: Duration) -> Double {
    Double(value.components.seconds) + Double(value.components.attoseconds) / 1e18
  }
}

/// MPVUI attaches the same sample-buffer renderer on iOS and tvOS.
public struct MPVPlaybackSurface: View {
  let engine: MPVPlaybackEngine
  let fill: Bool
  public init(engine: MPVPlaybackEngine, fill: Bool = false) {
    self.engine = engine
    self.fill = fill
  }
  public var body: some View {
    MPVVideoPlayer(player: engine.mpv)
      .onChange(of: fill, initial: true) { _, value in
        engine.mpv.setProperty("panscan", to: value ? "1" : "0")
      }

  }
}
