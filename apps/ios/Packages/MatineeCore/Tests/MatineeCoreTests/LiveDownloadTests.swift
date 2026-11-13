import AVFoundation
import Foundation
import Testing

@testable import MatineeCore

@Suite @MainActor struct LiveDownloadTests {
  @Test(.enabled(if: ProcessInfo.processInfo.environment["MATINEE_DOWNLOAD_LIVE"] == "1"))
  func live() async throws {
    let env = ProcessInfo.processInfo.environment
    let token = try String(
      contentsOfFile: env["MATINEE_DOWNLOAD_TOKEN_FILE"] ?? "/tmp/matinee-download-token",
      encoding: .utf8
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    let server = "http://localhost:18420/"
    let api = MatineeApi(
      transport: ApiTransport(base: URL(string: server)!, tokenProvider: { token }))
    let device = PlaybackDevice(
      containers: ["mp4"],
      video: [
        .init(
          codec: "h264", maxWidth: nil, maxHeight: nil, maxBitDepth: 8, profiles: nil,
          maxLevel: nil, hdr: nil, dolbyVisionProfiles: nil)
      ], audio: ["aac"], streamAudio: ["aac"], encodeVideo: ["h264"], hls: true, selectAudio: true,
      subtitles: ["webvtt"], sidecarSubtitles: ["webvtt"], embeddedSubtitles: [], language: "en")
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let config = URLSessionConfiguration.default
    let downloads = try Downloads(
      root: root, configuration: config, client: { $0 == server ? api : nil })
    downloads.store.server = server
    downloads.worker.progressInterval = 0.001
    let home = try await api.home.continueWatching()
    for (name, original) in [("The Matrix", true), ("Jurassic Park", false)] {
      let item = try #require(home.first { $0.title?.name == name })
      let results = try await api.downloads.resolve(
        downloadResolveInput: .init(ids: [item.id], device: device, wishes: .init(subtitles: "all"))
      )
      guard case .ready(let ready) = try #require(results.first) else {
        Issue.record("Not resolved")
        return
      }
      print(
        "LIVE resolve \(name): \(ready.plan.video.mode), subtitles \(ready.spec.subtitles?.count ?? 0)"
      )
      let entry = try await downloads.enqueue(
        .init(item: item, resolved: ready), server: server, original: original)
      // Wait for half the original, or at least one committed version fragment.
      for _ in 0..<6000 {
        let current = downloads.store.all[entry.key]!
        if (original ? current.bytes >= item.sizeBytes / 2 : current.segment >= 1)
          || current.state == .done
        {
          break
        }
        try await Task.sleep(for: .milliseconds(1))
      }
      let before = downloads.store.all[entry.key]!
      if before.state != .done {
        try await downloads.pause(item.id)
        print("LIVE interrupted bytes=\(before.bytes) segment=\(before.segment)")
        try await downloads.resume(item.id)
      } else {
        print("LIVE transfer completed before interruption")
      }
      for _ in 0..<1200 {
        let state = downloads.store.all[entry.key]!.state
        if state == .done || state == .failed { break }
        try await Task.sleep(for: .milliseconds(100))
      }
      let done = downloads.store.all[entry.key]!
      #expect(done.state == .done, "\(String(describing: done.failure)) \(done.error ?? "")")
      guard done.state == .done else { return }
      print(
        "LIVE downloaded bytes=\(done.bytes) segment=\(done.segment) subtitles=\(done.subtitles.count)"
      )
      let prefs = PlayerPrefs()
      let offlineApi = MatineeApi(
        transport: ApiTransport(base: URL(string: "http://127.0.0.1:1/")!))
      let player = PlayerController(
        api: offlineApi, device: device, prefs: prefs,
        downloads: DownloadPlayerAdapter(downloads: downloads, server: server),
        preferences: .init(
          audioLanguage: "en", subtitleMode: SubtitleMode.always, subtitleLanguage: "en",
          rememberSubtitles: false, skipBackSeconds: 10, skipForwardSeconds: 30))
      player.player.isMuted = true
      await player.startLocal(itemId: item.id)
      try await Task.sleep(for: .seconds(3))
      #expect(player.player.currentItem?.status == .readyToPlay)
      #expect(player.position > 0)
      #expect(player.subtitle != nil)
      #expect(player.cues?.cues.isEmpty == false)
      await player.seekTo(10)
      try await Task.sleep(for: .seconds(2))
      #expect(player.position >= 10)
      await player.stop()
      let pending = try downloads.pendingFor(server)
      #expect(pending.report(item.id) != nil)
      print(
        "LIVE PlayerController subtitles loaded, seek=\(player.position), offline report queued")
      try await pending.flush(client: { $0 == server ? api : nil })
      #expect(pending.report(item.id) == nil)
      print("LIVE offline progress accepted")
      try await downloads.remove(item.id)
      #expect(!FileManager.default.fileExists(atPath: downloads.store.file(done).path))
      print("LIVE deleted media directory")
    }
  }
}
