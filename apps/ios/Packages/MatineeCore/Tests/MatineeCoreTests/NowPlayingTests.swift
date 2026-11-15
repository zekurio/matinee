import Foundation
import MediaPlayer
import Testing

@testable import MatineeCore

@MainActor private final class LockScreenPlayer: NowPlayingPlayer {
  var position = 12.0
  var duration = 100.0
  var speed: Float = 1.5
  var playing = false
  var canPlay = true
  var canSeek = true
  var canNext = false
  var skipBack = 10.0
  var nowPlayingItemID: String? = "first"
  var nowPlayingTitle: String? = "Replacement"
  var nowPlayingSubtitle: String? = "Other show"
  var skipForward = 30.0
  var nextCount = 0
  var interruptions: [String] = []
  func audioInterruptionBegan() {
    interruptions.append("began")
    playing = false
  }
  func audioInterruptionEnded(shouldResume: Bool) {
    interruptions.append("ended \(shouldResume)")
  }
  func play() { playing = true }
  func pause() { playing = false }
  func togglePlay() { playing.toggle() }
  func playNext() { nextCount += 1 }
  func skip(_ seconds: Double) async { position += seconds }
  func seekTo(_ seconds: Double) async { position = seconds }
  func mediaRequest(url: URL) async -> URLRequest {
    var request = URLRequest(url: url)
    request.setValue("Bearer session-token", forHTTPHeaderField: "Authorization")
    return request
  }
}
@MainActor private final class LockScreenInfo: NowPlayingInfo {
  var nowPlayingInfo: [String: Any]?
}
@MainActor private final class LockScreenCommands: NowPlayingCommands {
  var handler: (@MainActor (NowPlayingCommand, Double?) -> Bool)?
  var enabled: [NowPlayingCommand: Bool] = [:]
  var intervals: [NowPlayingCommand: Double] = [:]
  func install(_ handler: @escaping @MainActor (NowPlayingCommand, Double?) -> Bool) {
    self.handler = handler
  }
  func enable(_ command: NowPlayingCommand, _ enabled: Bool, interval: Double?) {
    self.enabled[command] = enabled
    intervals[command] = interval
  }
  func remove() {
    handler = nil
    enabled = [:]
  }
}
@MainActor private final class LockScreenAudio: NowPlayingAudioSession {
  var event: (@MainActor (NowPlayingAudioEvent) -> Void)?
  var activations = 0
  var stops = 0
  var fail = false
  func start(_ event: @escaping @MainActor (NowPlayingAudioEvent) -> Void) { self.event = event }
  func activate() throws {
    if fail { throw URLError(.unknown) }
    activations += 1
  }
  func stop() {
    stops += 1
    event = nil
  }
}

@MainActor private final class LockScreenArtwork: NowPlayingArtworkLoader {
  var requests: [URLRequest] = []
  func data(for request: URLRequest) async throws -> (Data, URLResponse) {
    requests.append(request)
    let data = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVocAAAAASUVORK5CYII="
    )!
    return (
      data,
      HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
    )
  }
}

@Suite @MainActor struct NowPlayingTests {
  private func fixture() -> (
    PlayerNowPlaying, LockScreenPlayer, LockScreenInfo, LockScreenCommands, LockScreenAudio
  ) {
    let player = LockScreenPlayer()
    let info = LockScreenInfo()
    let commands = LockScreenCommands()
    let audio = LockScreenAudio()
    let session = PlayerNowPlaying(
      player: player, title: "Episode", subtitle: "Show · S1 E2", info: info, commands: commands,
      audio: audio)
    return (session, player, info, commands, audio)
  }
  @Test func showEpisodeAndMovieYearMatchAndroidMetadata() {
    #expect(
      nowPlayingDetail(show: true, showName: "Show", code: "S01E02", year: "2020")
        == "Show · S01E02")
    #expect(nowPlayingDetail(show: true, showName: "Show", code: nil, year: nil) == "Show")
    #expect(nowPlayingDetail(show: false, showName: "Movie", code: nil, year: "1993") == "1993")
    #expect(nowPlayingDetail(show: false, showName: "Movie", code: nil, year: nil) == nil)
  }
  @Test func metadataTracksPlaybackAndSourceReplacement() {
    let (session, player, info, _, audio) = fixture()
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Episode")
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyArtist] as? String == "Show · S1 E2")
    #expect(audio.activations == 0)
    player.play()
    session.update()
    #expect(audio.activations == 1)
    #expect(info.nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Float == 1.5)
    player.speed = 2
    player.position = 75
    player.duration = 200
    session.update()
    #expect(info.nowPlayingInfo?[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double == 75)
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyPlaybackDuration] as? Double == 200)
    #expect(info.nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Float == 2)
    player.pause()
    session.update()
    #expect(info.nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Float == 0)
    player.nowPlayingItemID = "second"
    session.update()
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Replacement")
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyArtist] as? String == "Other show")
    session.stop()
    session.update()
    session.stop()
    #expect(info.nowPlayingInfo == nil)
    #expect(audio.stops == 1)
  }
  @Test func commandsAreEnabledOnlyWhenTheyAct() async {
    let (session, player, _, commands, _) = fixture()
    #expect(commands.enabled[.play] == true)
    #expect(commands.enabled[.pause] == false)
    #expect(commands.enabled[.next] == false)
    #expect(commands.intervals[.backward] == 10)
    #expect(commands.intervals[.forward] == 30)
    #expect(commands.handler?(.next, nil) == false)
    #expect(commands.handler?(.play, nil) == true)
    #expect(player.playing)
    #expect(commands.enabled[.pause] == true)
    #expect(commands.handler?(.pause, nil) == true)
    #expect(!player.playing)
    #expect(commands.handler?(.toggle, nil) == true)
    #expect(player.playing)
    #expect(commands.handler?(.backward, nil) == true)
    await Task.yield()
    #expect(player.position == 2)
    #expect(commands.handler?(.forward, nil) == true)
    await Task.yield()
    #expect(player.position == 32)
    #expect(commands.handler?(.position, 60) == true)
    await Task.yield()
    #expect(player.position == 60)
    #expect(commands.handler?(.position, .nan) == false)
    player.canNext = true
    session.update()
    #expect(commands.handler?(.next, nil) == true)
    #expect(player.nextCount == 1)
    player.canPlay = false
    player.canSeek = false
    session.update()
    #expect(commands.handler?(.position, 5) == false)
    #expect(commands.enabled[.toggle] == false)
    session.stop()
    #expect(commands.handler == nil)
  }
  /// The controller decides about resuming (PlayerControllerTests has it);
  /// the session passes the events on, once each, and pauses on unplugging.
  @Test func interruptionsGoToTheController() {
    let (session, player, _, _, audio) = fixture()
    player.play()
    session.update()
    audio.event?(.interruption)
    audio.event?(.interruptionEnded(resume: true))
    audio.event?(.interruption)
    audio.event?(.interruptionEnded(resume: false))
    #expect(player.interruptions == ["began", "ended true", "began", "ended false"])
    player.play()
    audio.event?(.unplugged)
    #expect(!player.playing)
    #expect(player.interruptions.count == 4)
    session.stop()
    audio.event?(.interruption)
    #expect(player.interruptions.count == 4)
  }
  @Test func artworkIsAuthorizedAndClearedOnReplacementAndStop() async {
    let player = LockScreenPlayer()
    let info = LockScreenInfo()
    let loader = LockScreenArtwork()
    let session = PlayerNowPlaying(
      player: player, title: "First", info: info,
      commands: LockScreenCommands(), audio: LockScreenAudio(), artworkLoader: loader)
    session.loadArtwork(URL(string: "https://example.invalid/art")!)
    for _ in 0..<20 { await Task.yield() }
    #expect(
      loader.requests.first?.value(forHTTPHeaderField: "Authorization") == "Bearer session-token")
    let art = info.nowPlayingInfo?[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork
    #expect(art != nil)
    #expect((art?.bounds.width ?? 0) <= 600)
    player.nowPlayingItemID = "second"
    session.update()
    #expect(info.nowPlayingInfo?[MPMediaItemPropertyArtwork] == nil)
    session.loadArtwork(URL(string: "https://example.invalid/other")!)
    session.stop()
    for _ in 0..<20 { await Task.yield() }
    #expect(info.nowPlayingInfo == nil)
  }
  @Test func failedActivationPauses() {
    let (session, player, info, _, audio) = fixture()
    audio.fail = true
    player.play()
    session.update()
    #expect(!player.playing)
    #expect(info.nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Float == 0)
    session.stop()
  }
}
