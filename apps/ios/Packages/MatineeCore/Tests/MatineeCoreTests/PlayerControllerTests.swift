import AVFoundation
import Foundation
import Testing

@testable import MatineeCore

private func playerItem(_ id: String = "item") -> MediaItem {
  MediaItem(
    id: id, libraryId: "library", fileTitle: "Fixture",
    label: ItemLabel(
      show: "movie", showName: "Fixture", year: nil, showKey: "fixture", title: nil,
      untitled: false, episodeNumber: nil, code: nil, shortCode: nil, group: "", groupLabel: []),
    title: nil, seasonNumber: nil, episodeNumber: nil, episode: nil, relativePath: "fixture.mp4",
    container: "mp4", mimeType: "video/mp4", sizeBytes: 1, modifiedAt: "", durationSeconds: 100,
    probe: nil, progress: nil, favorite: false)
}

private func playerPlan(method: String, at: Double) -> PlaybackStart {
  PlaybackStart(
    item: playerItem(), method: method, url: "/media", hls: method == "transcode",
    offset: method == "remux" ? at : 0, start: method == "remux" ? 0 : at, position: at, audio: nil,
    convertedAudio: nil, convertedVideo: nil, standIn: nil, subtitle: nil, subtitleMode: nil,
    subtitleUrl: nil, audioTracks: [], subtitleTracks: [], quality: ORIGINAL_QUALITY, qualities: [],
    original: true, reasons: [], next: playerItem("next"))
}

private final class PlayerProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}
  override func startLoading() {
    do {
      let path = request.url!.path
      var status = 200
      let data: Data
      if path.hasSuffix("/start") {
        if ["restricted", "busy"].contains(request.url!.host!) {
          status = 403
          let code = request.url!.host == "busy" ? PLAYBACK_BUSY : PLAYBACK_RESTRICTED
          data = Data("{\"code\":\"\(code)\",\"message\":\"Refused\"}".utf8)
        } else {
          var body = request.httpBody ?? Data()
          if body.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
              let count = stream.read(&buffer, maxLength: buffer.count)
              if count <= 0 { break }
              body.append(contentsOf: buffer.prefix(count))
            }
          }
          let input = try JSONDecoder().decode(PlaybackStartInput.self, from: body)
          let methods = ["direct", "remux", "transcode"]
          let method = methods.first { !(input.failed ?? []).contains($0) } ?? "transcode"
          data = try JSONEncoder().encode(playerPlan(method: method, at: input.position ?? 42))
        }
      } else if path.hasSuffix("/options") {
        data = try JSONEncoder().encode(FALLBACK_PLAYBACK_OPTIONS)
      } else if path.hasSuffix("/seek") {
        data = Data("{\"url\":\"/seeked\",\"offset\":20}".utf8)
      } else if path.hasSuffix("/progress") {
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
        return
      } else {
        data = Data("{}".utf8)
      }
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: request.url!, statusCode: status, httpVersion: nil,
          headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
}

@MainActor private final class FakeEngine: PlaybackEngine {
  let player = AVPlayer()
  var isPlaying = false
  var isLoading = false
  var positionSeconds = 0.0
  var failure: (any Error)?
  var sources: [Source] = []
  var seeks: [Double] = []
  func load(_ source: Source, headers: [String: String]) async throws {
    sources.append(source)
    positionSeconds = source.start
  }
  func play(atRate rate: Float) { isPlaying = true }
  func pause() { isPlaying = false }
  func seek(_ seconds: Double) async {
    seeks.append(seconds)
    positionSeconds = seconds
  }
  func selectAudio(_ ordinal: Int) async {}
  func hasVideoFrame() -> Bool { false }
  func clear() {}
}

@MainActor private final class FakeDownloads: PlayerDownloads {
  struct Report {
    let position: Double
    let played: Double
    let closed: Bool
  }
  var reports: [Report] = []
  func playback(itemId: String) async throws -> LocalPlayback {
    LocalPlayback(
      item: playerItem(), file: URL(fileURLWithPath: "/tmp/fixture.mp4"), audio: [], subtitles: [],
      saved: [:], at: 23)
  }
  func next(after item: MediaItem) async -> MediaItem? { playerItem("next") }
  func queueReport(
    itemId: String, sessionId: String, position: Double, duration: Double?, played: Double,
    closed: Bool
  ) async {
    reports.append(Report(position: position, played: played, closed: closed))
  }
}

@MainActor private final class PlayerHarness {
  var now = Date(timeIntervalSince1970: 1000)
  let engine = FakeEngine()
  let downloads = FakeDownloads()
  func controller(host: String = "player") -> PlayerController {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PlayerProtocol.self]
    let api = MatineeApi(
      transport: ApiTransport(base: URL(string: "http://\(host)")!, configuration: configuration))
    return PlayerController(
      api: api,
      device: playbackProfile(
        snapshot: CapabilitySnapshot(codecs: DeviceCodecs(video: [], audio: [], dolbyVision: false))
      ), prefs: PlayerPrefs(defaults: UserDefaults(suiteName: UUID().uuidString)!), engine: engine,
      clock: { self.now }, downloads: downloads)
  }
}

struct PlayerControllerTests {
  @MainActor @Test func resumeFallbackSeekAndRetry() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.start(itemId: "item")
    #expect(controller.position == 42)
    await controller.seekTo(10)
    #expect(harness.engine.seeks == [10])
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.source?.method == "remux")
    await controller.seekTo(20)
    #expect(controller.source?.offset == 20)
    #expect(controller.source?.url.hasSuffix("/seeked") == true)
    await controller.sourceFailed(URLError(.cannotDecodeContentData))
    #expect(controller.failedMethods == ["direct", "remux"])
    #expect(controller.source?.method == "transcode")
    await controller.seekTo(30)
    #expect(harness.engine.seeks.last == 30)
    await controller.retry()
    #expect(controller.failedMethods.isEmpty)
    #expect(controller.source?.method == "direct")
    await controller.stop()
    #expect(controller.diagnostics.attempts.last?.outcome == .closed)
  }

  @MainActor @Test(arguments: ["restricted", "busy"]) func refusals(host: String) async {
    let harness = PlayerHarness()
    let controller = harness.controller(host: host)
    await controller.start(itemId: "item")
    #expect(controller.refusal == (host == "busy" ? .busy : .restricted))
    #expect(controller.error != nil)
    #expect(harness.engine.sources.isEmpty)
    #expect(!harness.engine.isPlaying)
    await controller.stop()
  }

  @MainActor @Test func offlineReportsAndCountdownCancel() async {
    let harness = PlayerHarness()
    let controller = harness.controller()
    await controller.startLocal(itemId: "item")
    #expect(controller.isLocal)
    #expect(controller.position == 23)
    await controller.tick()
    #expect(harness.downloads.reports.count == 1)
    harness.now += 1
    harness.engine.positionSeconds = 24
    await controller.tick()
    #expect(harness.downloads.reports.count == 1)
    harness.now += 9
    await controller.tick()
    #expect(harness.downloads.reports.count == 2)
    #expect(harness.downloads.reports.last?.played == 10)
    harness.engine.positionSeconds = 100
    harness.engine.isPlaying = false
    await controller.tick()
    #expect(controller.nextCountdown == 10)
    harness.now += 4
    await controller.tick()
    #expect(controller.nextCountdown == 6)
    controller.cancelNext()
    harness.now += 10
    await controller.tick()
    #expect(controller.nextCountdown == nil)
    await controller.stop()
    #expect(harness.downloads.reports.last?.closed == true)
    let count = harness.downloads.reports.count
    await controller.stop()
    #expect(harness.downloads.reports.count == count)
  }
}
