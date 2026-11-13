import AVFoundation
import Foundation
import Observation

public enum AttemptOutcome: String, Codable, Sendable {
  case loading, playing, failed, replaced, closed
}

public struct PlaybackAttempt: Codable, Sendable, Equatable {
  public var method: String?
  public var offset: Double
  public var errorCode: Int?
  public var outcome: AttemptOutcome = .loading
}
public enum DiagnosticsNote: String, Codable, Sendable {
  case subtitleLoadFailed, startFailed, seekFailed, unplayable, restricted, tooManyStreams
}

public struct PlaybackReport: Codable, Sendable, Equatable {
  public var attempts: [PlaybackAttempt] = []
  public var settings: SettingsDiagnostics?
  public var file: FileDiagnostics?
  public var capabilities: CapabilityDiagnostics?
  public var droppedAttempts = 0
  public var tracks: [TrackDiagnostics] = []
  public var errorLogCodes: [Int] = []
  public var droppedFrames: Int = 0
  public var indicatedBitrate: Double = 0
  public var observedBitrate: Double = 0
  public var stalls: Int = 0
  public var firstFrameSeconds: Double?
  public var closed = false
  public var notes: [String: Int] = [:]
  public mutating func note(_ note: DiagnosticsNote) {
    notes[note.rawValue, default: 0] += 1
  }
  public mutating func close() {
    closed = true
    if let index = attempts.indices.last, attempts[index].outcome != .failed {
      attempts[index].outcome = .closed
    }
  }
  public init() {}
  public mutating func attempt(method: String?, offset: Double) {
    if let index = attempts.indices.last,
      attempts[index].outcome == .loading || attempts[index].outcome == .playing
    {
      attempts[index].outcome = .replaced
    }
    attempts.append(
      PlaybackAttempt(
        method: method.map { PlaybackMethod.knownValues.contains($0) ? $0 : "other" },
        offset: offset))
    if attempts.count > 12 {
      attempts.removeFirst()
      droppedAttempts += 1
    }
    tracks = []
  }
  public mutating func failed(code: Int) {
    if !attempts.isEmpty {
      attempts[attempts.count - 1].errorCode = code
      attempts[attempts.count - 1].outcome = .failed
    }
  }
  @MainActor mutating func sample(_ player: AVPlayer) {
    if player.timeControlStatus == .playing, let index = attempts.indices.last,
      attempts[index].outcome == .loading
    {
      attempts[index].outcome = .playing
    }
    errorLogCodes = Array(
      (player.currentItem?.errorLog()?.events ?? []).suffix(3).map(\.errorStatusCode))
    guard let event = player.currentItem?.accessLog()?.events.last else { return }
    droppedFrames = event.numberOfDroppedVideoFrames
    indicatedBitrate = event.indicatedBitrate
    observedBitrate = event.observedBitrate
    stalls = event.numberOfStalls
  }
}
@Observable @MainActor public final class PlaybackDiagnostics {
  public static let shared = PlaybackDiagnostics()
  public private(set) var report: PlaybackReport?
  private init() {}
  // Reports deliberately contain no URLs, tokens, filenames or server messages.
  public static var latest: PlaybackReport? {
    get { shared.report }
    set { shared.report = newValue }
  }
  public static func clear() { shared.report = nil }
}
public func formatReport(_ report: PlaybackReport) -> String {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  return (try? encoder.encode(report)).map { String(decoding: $0, as: UTF8.self) } ?? ""
}
