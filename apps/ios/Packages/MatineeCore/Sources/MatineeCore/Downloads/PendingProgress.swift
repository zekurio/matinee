import Foundation
import Observation

public struct PendingReport: Codable, Sendable, Hashable {
  public var positionSeconds: Double
  public var durationSeconds: Double?
  public init(positionSeconds: Double, durationSeconds: Double?) {
    self.positionSeconds = positionSeconds
    self.durationSeconds = durationSeconds
  }
}
@Observable @MainActor public final class PendingProgress {
  public let server: String
  private let file: URL
  private struct Saved: Codable {
    var reports: [String: PendingReport] = [:]
    var plays: [String: PlaybackOfflineInput.Play] = [:]
  }
  private var saved: Saved
  private var flushing = false
  public init(root: URL, server: String) throws {
    self.server = server
    let key = Data(server.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
    file = root.appending(path: "pending-\(key).json")
    saved =
      FileManager.default.fileExists(atPath: file.path)
      ? try JSONDecoder().decode(Saved.self, from: Data(contentsOf: file)) : Saved()
  }
  private func save(_ next: Saved) throws {
    try JSONEncoder().encode(next).write(to: file, options: .atomic)
    saved = next
  }
  public func put(_ itemId: String, _ report: PendingReport) throws {
    var next = saved
    next.reports[itemId] = report
    try save(next)
  }
  public func report(_ itemId: String) -> PendingReport? { saved.reports[itemId] }
  public func drop(_ itemId: String) throws {
    var next = saved
    next.reports[itemId] = nil
    try save(next)
  }
  public func putPlay(_ play: PlaybackOfflineInput.Play) throws {
    var next = saved
    next.plays[play.sessionId] = play
    try save(next)
  }
  public func dropPlay(_ sessionId: String) throws {
    var next = saved
    next.plays[sessionId] = nil
    try save(next)
  }
  public func clear() throws { try save(Saved()) }
  public func flush(client: @MainActor (String) -> MatineeApi?) async throws {
    guard !flushing, let api = client(server) else { return }
    flushing = true
    defer { flushing = false }
    let plays = Array(saved.plays.values)
    for offset in stride(from: 0, to: plays.count, by: 200) {
      let batch = Array(plays[offset..<min(offset + 200, plays.count)])
      do { try await api.playback.offline(plays: batch) } catch let error as ApiException
        where (400..<500).contains(error.status)
      {} catch { return }
      var next = saved
      // A player can have advanced while the request was in flight.
      for play in batch where next.plays[play.sessionId] == play {
        next.plays[play.sessionId] = nil
      }
      try save(next)
    }
    for (id, report) in saved.reports {
      do {
        try await api.playback.report(
          itemId: id, positionSeconds: max(0, report.positionSeconds),
          durationSeconds: report.durationSeconds.flatMap { $0 > 0 ? $0 : nil }, closed: true)
      } catch let error as ApiException where (400..<500).contains(error.status) {} catch { return }
      if saved.reports[id] == report { try drop(id) }
    }
  }
}
