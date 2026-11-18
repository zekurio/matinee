import AVFoundation
import Foundation
import Testing

@testable import MatineeCore

struct PlayerTests {
  @Test func seekArithmetic() {
    #expect(!seekable(.nan))
    #expect(!seekable(.infinity))
    #expect(!seekable(0))
    #expect(seekClamp(.nan, duration: 10) == 0)
    #expect(seekClamp(.infinity, duration: 10) == 10)
    #expect(seekFraction(25, duration: 100) == 0.25)
    #expect(seekAt(x: 300, width: 200, duration: 100) == 100)
    #expect(seekSteps(duration: 100, step: 10) == 9)
    #expect(seekStepped(from: 4, direction: -1, step: 10, duration: 100) == 0)
  }
  @Test func freezeWatch() {
    var watch = FreezeWatch()
    func check(_ now: Int64, _ playing: Bool = true) -> Bool {
      watch.check(nowMs: now, playing: playing, shown: true)
    }
    #expect(!check(0))
    watch.frame(atMs: 1000)
    #expect(!check(5999))
    #expect(check(6000))
    #expect(!check(7000, false))
    #expect(!check(8000))
    watch.reset()
    #expect(!check(20000))
  }
  @Test func sourceTimelines() {
    let stream = Source(
      method: "remux", url: "https://example.invalid", hls: false, offset: 750, start: 0)
    #expect(stream.fileSeconds(ms: 12500) == 762.5)
    #expect(stream.sourceMs(seconds: 740) == 0)
    #expect(stream.seek == .newStream)
    #expect(!stream.holdsTracks)
    #expect(Source.local(url: "file:///tmp/a.mp4", at: -2).position == 0)
    #expect(
      Source(method: "transcode", url: "", hls: true, offset: 0, start: 300).seek == .inSource)
  }
  @Test func picksAndFailures() {
    let device = playbackProfile(
      snapshot: CapabilitySnapshot(
        codecs: DeviceCodecs(video: [], audio: ["aac"], dolbyVision: false)))
    let asking = Asking().fail("direct").fail("direct").pick(Picks(audio: 2), tracks: []).fail(
      "remux")
    let input = asking.input(itemId: "item", sessionId: "session", device: device, at: -10)
    #expect(input.failed == ["direct", "remux"])
    #expect(input.audio == 2)
    #expect(input.position == 0)
    #expect(asking.forgetFailures().failed.isEmpty)
    #expect(Asking(failed: ["transcode"]).pick(Picks(quality: "720p-4"), tracks: []).failed.isEmpty)
    #expect(
      Picks(audio: 2, subtitle: SubtitlePick(trackId: "a")).merging(
        Picks(subtitle: SubtitlePick(trackId: nil))
      ).subtitle?.trackId == nil)
    #expect(
      refusal(ApiException(status: 403, code: PLAYBACK_RESTRICTED, message: "restricted"))
        == .restricted)
  }
  @Test func injectedProfile() {
    let decoder = VideoDecoder(
      codec: "hevc", widest: FrameSize(width: 3840, height: 2160),
      tallest: FrameSize(width: 2160, height: 3840), tenBit: true)
    #expect(profileDecoders(decoder, dolbyVision: false).count == 2)
    #expect(!profileDecoders(decoder, dolbyVision: false)[0].dolbyVisionProfiles!.contains(5))
    let profile = playbackProfile(
      settings: ProfileSettings(convertAudio: ["ac3"], audioCodec: "aac", videoCodec: "hevc"),
      snapshot: CapabilitySnapshot(
        codecs: DeviceCodecs(video: [decoder], audio: ["aac", "ac3", "opus"], dolbyVision: false)),
      locale: Locale(identifier: "de-DE"))
    #expect(profile.containers == ["mp4", "m4v", "mov"])
    #expect(!profile.audio.contains("ac3"))
    #expect(profile.streamAudio.first == "aac")
    #expect(profile.encodeVideo.first == "hevc")
    #expect(profile.language == "de")
    #expect(profile.embeddedSubtitles.isEmpty)
  }
  @Test func vtt() {
    let track = CueTrack.parse(
      "WEBVTT\r\n\r\n1\r\n00:01.000 --> 00:04.000\r\n<i>Hello &amp; <b>world</b></i>\r\n\r\n00:02.000 --> 00:03.000 align:start\r\nOverlap"
    )
    #expect(track.at(0).isEmpty)
    #expect(track.at(2).count == 2)
    #expect(track.at(4).isEmpty)
    #expect(track.cues[0].text == "Hello & world")
    #expect(track.cues[0].spans.last?.bold == true)
    #expect(track.cues[0].spans.last?.italic == true)
  }
}

struct LivePlayerTests {
  struct Fixture: Decodable {
    var id: String
    var path: String
  }
  @Test(.enabled(if: ProcessInfo.processInfo.environment["MATINEE_PLAYER_LIVE"] == "1"))
  @MainActor func fixturePlayback() async throws {
    let env = ProcessInfo.processInfo.environment
    let token = try String(contentsOfFile: env["MATINEE_PLAYER_TOKEN_FILE"]!, encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let fixtures = try JSONDecoder().decode(
      [Fixture].self,
      from: Data(contentsOf: URL(fileURLWithPath: env["MATINEE_PLAYER_ITEMS_FILE"]!)))
    let api = MatineeApi(base: URL(string: "http://localhost:18420")!, tokenProvider: { token })
    let device = playbackProfile(snapshot: Capabilities.probe())
    print("DEVICE", String(decoding: try JSONEncoder().encode(device), as: UTF8.self))
    for fixture in fixtures
    where !fixture.path.contains("Breaking") && !fixture.path.contains("Extras") {
      let prefs = PlayerPrefs(defaults: UserDefaults(suiteName: "player-live")!)
      let controller = PlayerController(
        api: api, device: device, prefs: prefs, tokenProvider: { token })
      controller.surfaceShown = true
      await controller.start(itemId: fixture.id, at: 0)
      try await Task.sleep(for: .seconds(4))
      let method = controller.plan?.method ?? "none"
      let advanced = controller.position > 1 && controller.error == nil
      #expect(advanced)
      print("ATTEMPTS", fixture.path, controller.diagnostics.attempts)
      print("FIRST FRAME", fixture.path, controller.diagnostics.firstFrameSeconds as Any)
      #expect(controller.diagnostics.firstFrameSeconds != nil)
      await controller.seekTo(min(10, controller.duration / 2))
      try await Task.sleep(for: .seconds(2))
      let forward = controller.position
      await controller.seekTo(1)
      try await Task.sleep(for: .seconds(2))
      let backward = controller.position
      if controller.audioTracks.count > 1 {
        let picked = controller.audioTracks[1]
        await controller.pickAudio(picked)
        #expect(controller.audio?.index == picked.index)
        if controller.source?.holdsTracks == true, let item = controller.player?.currentItem,
          let group = try await item.asset.loadMediaSelectionGroup(for: .audible)
        {
          #expect(item.currentMediaSelection.selectedMediaOption(in: group) == group.options[1])
        }
      }
      if let subtitle = controller.subtitles.first(where: { $0.delivery == "webvtt" }) {
        await controller.pickSubtitle(subtitle)
        #expect(controller.cues != nil)
      }
      let cues =
        controller.cues?.at(controller.position).map(\.text).joined(separator: " / ") ?? "none"
      if fixture.path.contains("Matrix") {
        guard let quality = controller.qualities.first else {
          Issue.record("Long-file encode quality missing")
          await controller.stop()
          continue
        }
        await controller.pickQuality(quality.id)
        await controller.seekTo(120)
        try await Task.sleep(for: .seconds(3))
        let far = controller.position
        await controller.seekTo(30)
        try await Task.sleep(for: .seconds(3))
        print(
          "LONG ENCODE", controller.plan?.method ?? "none", "seek", far, controller.position,
          "error", controller.error ?? "none")
        #expect(far >= 120)
        #expect(controller.position >= 30 && controller.position < 40)
      }
      print(
        "LIVE |", fixture.path, "|", method, "| advanced", advanced, "| seek", forward, backward,
        "| audio", controller.audio?.language ?? "none", "| cues", cues, "| error",
        controller.error ?? "none")
      if fixture.path.contains("Toy Story"), let originalMethod = controller.source?.method {
        await controller.sourceFailed(URLError(.cannotDecodeContentData))
        print("FALLBACK", controller.failedMethods, "=>", controller.source?.method ?? "none")
        #expect(controller.failedMethods.contains(originalMethod))
      }
      if let picture = controller.subtitles.first(where: { $0.delivery != "webvtt" }) {
        await controller.pickSubtitle(picture)
        try await Task.sleep(for: .seconds(3))
        print(
          "PICTURE", controller.plan?.subtitleMode ?? "none", controller.position,
          controller.error ?? "none")
        #expect(controller.plan?.subtitleMode == "burn-in")
      }
      await controller.report()
      await controller.stop()
      print(
        "RENDERED REPORT BEGIN\n" + formatReport(controller.diagnostics) + "RENDERED REPORT END")
    }
  }
}
