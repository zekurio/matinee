import Foundation
import Testing

@testable import MatineeCore

/// Builds the server's answers the player takes, from the fields a test sets.
enum Answers {
  static let aac = AudioTrack(
    index: 1, label: "English", language: "en", title: nil, codec: "aac", format: "AAC",
    channels: 2, layout: nil, primary: true)
  static let ac3 = AudioTrack(
    index: 2, label: "German", language: "de", title: nil, codec: "ac3", format: "AC-3",
    channels: 6, layout: nil, primary: false)

  static let vtt = track("sub-1", "English", "en", source: "sidecar", format: "SRT", "webvtt")
  static let pgsInFile = track(
    "stream-3", "English", "en", source: "embedded", format: "PGS", "pgs")
  static let pgsBeside = track("sub-2", "German", "de", source: "sidecar", format: "PGS", "pgs")
  static let vobsub = track(
    "stream-4", "French", "fr", source: "embedded", format: "VobSub", "burn-in")
  static let assInFile = track(
    "stream-5", "Signs", "en", source: "embedded", format: "ASS", "webvtt")

  static func track(
    _ id: String, _ label: String, _ language: String, source: String, format: String,
    _ delivery: String
  ) -> SubtitleTrack {
    SubtitleTrack(
      id: id, label: label, language: language, title: nil, forced: false, sdh: false,
      default: false, source: source, format: format, delivery: delivery)
  }

  static func item(_ id: String = "item-1", duration: Double = 3000) -> MediaItem {
    let json = """
      {"id":"\(id)","libraryId":"library-1","fileTitle":"File","relativePath":"a.mkv","container":"mkv",
       "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2024-01-01T00:00:00Z","durationSeconds":\(duration),
       "favorite":false,"label":{"show":"File","showName":"File","showKey":"k","untitled":false,"group":"g","groupLabel":[]}}
      """
    return try! JSONDecoder().decode(MediaItem.self, from: Data(json.utf8))
  }

  static func plan(
    method: String = "direct", url: String = "/api/media/item-1/stream", hls: Bool = false,
    offset: Double = 0, start: Double = 0, audio: Int = 1, quality: String = "original",
    convertedAudio: String? = nil, subtitle: SubtitleTrack? = nil, subtitleMode: String? = nil,
    subtitleUrl: String? = nil, reasons: [String] = [], original: Bool = true,
    subtitleTracks: [SubtitleTrack] = [], qualities: [PlaybackQualityPreset] = [],
    item: MediaItem = item(), next: MediaItem? = nil
  ) -> PlaybackStart {
    PlaybackStart(
      item: item, method: method, url: url, hls: hls, offset: offset, start: start,
      position: offset + start, audio: audio == 2 ? ac3 : aac, convertedAudio: convertedAudio,
      convertedVideo: nil, standIn: nil, subtitle: subtitle, subtitleMode: subtitleMode,
      subtitleUrl: subtitleUrl, audioTracks: [aac, ac3], subtitleTracks: subtitleTracks,
      quality: quality, qualities: qualities, original: original, reasons: reasons, previous: nil, next: next, upNextAt: nil, segments: [])
  }
}

struct PlaybackTests {
  let device = playbackProfile(
    snapshot: CapabilitySnapshot(
      codecs: DeviceCodecs(video: [], audio: ["aac"], dolbyVision: false)),
    locale: Locale(identifier: "en"))
  let resolve = { (path: String) in "https://media.example.com\(path)" }

  @Test func theFileStartsWhereTheViewerStopped() {
    let source = Source.of(Answers.plan(start: 754.2), resolve: resolve)
    #expect(source.url == "https://media.example.com/api/media/item-1/stream")
    #expect(source.mode == .direct)
    #expect(source.kind == .file)
    #expect(source.startMs == 754_200)
    #expect(source.position == 754.2)
    #expect(source.holdsTracks)
    #expect(source.seek == .inSource)
    #expect(source.sourceMs(seconds: 800) == 800_000)
  }

  @Test func aCopiedStreamCountsFromItsOffset() {
    let source = Source.of(
      Answers.plan(method: "remux", url: "/api/media/item-1/play?start=750.000", offset: 750),
      resolve: resolve)
    #expect(source.mode == .stream)
    #expect(source.kind == .mp4)
    // Its own time 0 is 750 seconds into the file, where it starts.
    #expect(source.startMs == 0)
    #expect(source.position == 750)
    #expect(abs(source.fileSeconds(ms: 12_500) - 762.5) < 1e-9)
    #expect(!source.holdsTracks)
    #expect(source.seek == .newStream)
    // A stream from `playback.seek` in its place starts at its own offset.
    var sought = source
    sought.url = "https://media.example.com/api/media/item-1/play?start=1200.000"
    sought.offset = 1200
    sought.start = 0
    #expect(sought.position == 1200)
    #expect(abs(sought.fileSeconds(ms: 5_000) - 1205) < 1e-9)
  }

  @Test func hlsRunsOnTheFilesTimeline() {
    let source = Source.of(
      Answers.plan(
        method: "transcode", url: "/api/media/item-1/hls/main.m3u8", hls: true, start: 300),
      resolve: resolve)
    #expect(source.mode == .hls)
    #expect(source.kind == .hls)
    #expect(source.startMs == 300_000)
    #expect(abs(source.fileSeconds(ms: 301_000) - 301) < 1e-9)
    #expect(source.seek == .inSource)
    // An encode that isn't HLS starts again from a new answer.
    var progressive = source
    progressive.hls = false
    #expect(progressive.seek == .newStart)
  }

  @Test func aDownloadPlaysFromWhereItStopped() {
    let source = Source.local(url: "file:///data/video.mkv", at: 42)
    #expect(source.mode == .local)
    #expect(source.method == nil)
    #expect(source.startMs == 42_000)
    #expect(source.holdsTracks)
  }

  @Test func failedMethodsPileUpAndTravelWithEveryCall() {
    var asking = Asking(picks: Picks(quality: "original"))
    asking = asking.fail("direct")
    asking = asking.fail("direct")
    asking = asking.pick(Picks(audio: 2), tracks: [])
    asking = asking.fail("remux")
    let input = asking.input(itemId: "item-1", sessionId: "session-1", device: device, at: 61.5)
    #expect(input.failed == ["direct", "remux"])
    #expect(input.audio == 2)
    #expect(input.quality == "original")
    #expect(input.subtitle == nil)
    #expect(input.position == 61.5)
    #expect(input.snap == "before")
    #expect(input.device == device)
    #expect(asking.forgetFailures().failed.isEmpty)
  }

  @Test func picksAddUp() {
    let asking = Asking()
      .pick(Picks(audio: 2), tracks: [])
      .pick(Picks(subtitle: SubtitlePick(trackId: "sub-1")), tracks: [Answers.vtt])
      .pick(Picks(subtitle: SubtitlePick(trackId: nil)), tracks: [Answers.vtt])
    #expect(asking.picks == Picks(audio: 2, subtitle: SubtitlePick(trackId: nil)))
  }

  @Test func aPickThatTakesAnEncodeTriesEncodesAgain() {
    let failed = Asking(failed: ["direct", "transcode"])
    let tracks = [Answers.vtt, Answers.pgsInFile, Answers.vobsub]
    #expect(failed.pick(Picks(quality: "720p-4"), tracks: tracks).failed == ["direct"])
    #expect(
      failed.pick(Picks(subtitle: SubtitlePick(trackId: "stream-3")), tracks: tracks).failed == [
        "direct"
      ])
    #expect(
      failed.pick(Picks(subtitle: SubtitlePick(trackId: "stream-4")), tracks: tracks).failed == [
        "direct"
      ])
    // The original, text the view draws, and off take no encode.
    #expect(
      failed.pick(Picks(quality: "original"), tracks: tracks).failed == ["direct", "transcode"])
    #expect(
      failed.pick(Picks(subtitle: SubtitlePick(trackId: "sub-1")), tracks: tracks).failed == [
        "direct", "transcode",
      ])
    #expect(
      failed.pick(Picks(subtitle: SubtitlePick(trackId: nil)), tracks: tracks).failed == [
        "direct", "transcode",
      ])
  }

  @Test func aBurnInThatFailedTurnsSubtitlesOff() {
    let asking = Asking(picks: Picks(subtitle: SubtitlePick(trackId: "stream-4")))
    let lost = Answers.plan(
      method: "transcode", hls: true, quality: "1080p-20", subtitle: Answers.vobsub,
      subtitleMode: "burn-in")
    let (after, notice) = asking.settle(lost: lost, plan: Answers.plan())
    #expect(notice == .burnInFailed)
    #expect(after.picks.subtitle == SubtitlePick(trackId: nil))
  }

  @Test func aQualityThatFailedGoesBackToTheOriginal() {
    let asking = Asking(picks: Picks(quality: "720p-4"))
    let lost = Answers.plan(method: "transcode", hls: true, quality: "720p-4")
    let (after, notice) = asking.settle(lost: lost, plan: Answers.plan(quality: "original"))
    #expect(notice == .qualityFailed)
    #expect(after.picks.quality == "original")
    // An answer to a pick, rather than to a failure, leaves the picks alone.
    let untouched = asking.settle(lost: nil, plan: Answers.plan(quality: "original"))
    #expect(untouched.0 == asking)
    #expect(untouched.1 == nil)
    // A file that failed as it is says nothing: the stream after it is what the server does.
    #expect(
      Asking(picks: Picks(quality: "original")).settle(
        lost: Answers.plan(), plan: Answers.plan(method: "remux")
      ).1 == nil)
  }

  @Test func aQualityTheServerPlayedTheOriginalForFailsNothing() {
    // The account may not encode, so the picked encode played as the file; when the file fails, a stream follows.
    let asking = Asking(picks: Picks(quality: "1080p-20"))
    let (after, notice) = asking.settle(lost: Answers.plan(), plan: Answers.plan(method: "remux"))
    #expect(notice == nil)
    #expect(after.picks.quality == "1080p-20")
  }

  @Test func aRememberedOriginalOverTheLimitTakesTheServersEncode() {
    // The file is over the account's limit: the server answers with an encode under it, and the menu has no original.
    let plan = Answers.plan(
      method: "transcode", hls: true, quality: "720p-4", reasons: ["limit"], original: false)
    #expect(!plan.original)
    let original = Asking(picks: Picks(quality: "original"))
    let settled = original.settle(lost: nil, plan: plan)
    #expect(settled.0 == original)
    #expect(settled.1 == nil)
    // An encode that fails then stays an encode, and says nothing of the original.
    let next = Answers.plan(
      method: "transcode", hls: false, quality: "720p-4", reasons: ["limit", "failed"],
      original: false)
    #expect(original.settle(lost: plan, plan: next).1 == nil)
  }

  @Test func refusalsStopThePlayer() {
    #expect(
      refusal(
        ApiException(
          status: 403, code: "PLAYBACK_RESTRICTED",
          message: "This file is over your account's limit."
        )) == .restricted)
    #expect(
      refusal(
        ApiException(
          status: 429, code: "TOO_MANY_STREAMS", message: "You're playing on 2 devices already."))
        == .busy)
    #expect(
      refusal(ApiException(status: 422, code: "UNPLAYABLE", message: "Nothing plays.")) == nil)
    #expect(refusal(URLError(.networkConnectionLost)) == nil)
  }

  @Test func refusalsCarryTheirReason() {
    let reason = Data(#"{"reason":"bitrate-failed"}"#.utf8)
    let restricted = ApiException(status: 403, code: "PLAYBACK_RESTRICTED", message: "Over the limit.", data: reason)
    #expect(restriction(restricted) == PlaybackRestriction.bitrate_failed)
    #expect(refusalReason(restricted) == .restricted(PlaybackRestriction.bitrate_failed))
    let playing = Data(#"{"playing":2}"#.utf8)
    let busy = ApiException(status: 429, code: "TOO_MANY_STREAMS", message: "Playing on 2 devices.", data: playing)
    #expect(busyPlaying(busy) == 2)
    #expect(refusalReason(busy) == .busy(playing: 2))
    // An older server sends none, or data of another shape: the server's message shows.
    #expect(restriction(ApiException(status: 403, code: "PLAYBACK_RESTRICTED", message: "Over the limit.")) == nil)
    #expect(restriction(ApiException(status: 403, code: "PLAYBACK_RESTRICTED", message: "Over the limit.", data: playing)) == nil)
    #expect(busyPlaying(ApiException(status: 403, code: "PLAYBACK_RESTRICTED", message: "Over the limit.", data: playing)) == nil)
    #expect(refusalReason(ApiException(status: 422, code: "UNPLAYABLE", message: "Nothing plays.", data: reason)) == nil)
  }

  @Test func anErrorKeepsTheDataBesideItsMessage() throws {
    let body = Data(#"{"code":"PLAYBACK_RESTRICTED","status":403,"message":"Over","data":{"reason":"transcode"}}"#.utf8)
    let data = try #require(errorData(body))
    #expect(try JSONDecoder().decode(PlaybackRestrictedData.self, from: data).reason == "transcode")
    #expect(errorData(Data(#"{"code":"X","message":"No data"}"#.utf8)) == nil)
    #expect(errorData(Data("not json".utf8)) == nil)
  }

  @Test func theSameSourcePlaysOn() {
    let file = Answers.plan()
    // Another audio track in the file is picked inside it.
    #expect(sameSource(file, Answers.plan(audio: 2)))
    #expect(
      sameSource(
        file, Answers.plan(subtitle: Answers.vtt, subtitleMode: "client", subtitleUrl: "/s")))
    #expect(!sameSource(file, Answers.plan(method: "remux", offset: 10)))
    let stream = Answers.plan(method: "remux", offset: 10)
    // Where it would start differs, as after a subtitle the view draws.
    #expect(
      sameSource(
        stream,
        Answers.plan(method: "remux", offset: 20, subtitle: Answers.vtt, subtitleMode: "client")))
    #expect(!sameSource(stream, Answers.plan(method: "remux", audio: 2)))
    #expect(!sameSource(stream, Answers.plan(method: "remux", convertedAudio: "opus")))
    let encode = Answers.plan(method: "transcode", hls: true, quality: "1080p-20")
    #expect(!sameSource(encode, Answers.plan(method: "transcode", hls: true, quality: "720p-4")))
    #expect(
      !sameSource(
        encode,
        Answers.plan(
          method: "transcode", hls: true, quality: "1080p-20", subtitle: Answers.vobsub,
          subtitleMode: "burn-in")))
  }

  @Test func theAnswerSaysWhoDrawsTheSubtitle() {
    #expect(subtitleShow(Answers.plan(), mpv: false) == .off)
    let text = Answers.plan(
      subtitle: Answers.vtt, subtitleMode: "client",
      subtitleUrl: "/api/media/item-1/subtitles/sub-1")
    #expect(
      subtitleShow(text, mpv: false) == .screen(Answers.vtt, "/api/media/item-1/subtitles/sub-1"))
    #expect(
      subtitleShow(text, mpv: true) == .screen(Answers.vtt, "/api/media/item-1/subtitles/sub-1"))
    let inFile = Answers.plan(subtitle: Answers.pgsInFile, subtitleMode: "player")
    #expect(subtitleShow(inFile, mpv: false) == .inFile(Answers.pgsInFile, 3))
    let styled = Answers.plan(subtitle: Answers.assInFile, subtitleMode: "player")
    #expect(subtitleShow(styled, mpv: true) == .inFile(Answers.assInFile, 5))
    let beside = Answers.plan(
      method: "remux", offset: 30, subtitle: Answers.pgsBeside, subtitleMode: "client",
      subtitleUrl: "/api/media/item-1/subtitles/sub-2")
    #expect(
      subtitleShow(beside, mpv: true)
        == .overlay(Answers.pgsBeside, "/api/media/item-1/subtitles/sub-2"))
    // AVPlayer says it doesn't draw PGS files, so the server never answers with one; were it to, nothing shows.
    #expect(subtitleShow(beside, mpv: false) == .off)
    let burned = Answers.plan(
      method: "transcode", hls: true, subtitle: Answers.vobsub, subtitleMode: "burn-in")
    #expect(subtitleShow(burned, mpv: false) == .burned(Answers.vobsub))
    #expect(subtitleShow(burned, mpv: false).rendering == .burnIn)
    #expect(subtitleShow(beside, mpv: true).rendering == .player)
  }

  @Test func aDownloadDrawsItsOwnSubtitles() {
    let url = "https://media.example.com/api/media/item-1/subtitles/x"
    #expect(downloadSubtitleShow(nil, mpv: false, url: url) == .off)
    #expect(downloadSubtitleShow(Answers.vtt, mpv: false, url: url) == .screen(Answers.vtt, url))
    #expect(
      downloadSubtitleShow(Answers.pgsInFile, mpv: false, url: url) == .inFile(Answers.pgsInFile, 3)
    )
    #expect(
      downloadSubtitleShow(Answers.vobsub, mpv: true, url: url) == .inFile(Answers.vobsub, 4))
    // Only mpv keeps ASS styling; AVPlayer's view draws its WebVTT.
    #expect(
      downloadSubtitleShow(Answers.assInFile, mpv: true, url: url) == .inFile(Answers.assInFile, 5))
    #expect(
      downloadSubtitleShow(Answers.assInFile, mpv: false, url: url)
        == .screen(Answers.assInFile, url))
    // A PGS file beside it isn't saved with a download.
    #expect(downloadSubtitleShow(Answers.pgsBeside, mpv: true, url: url) == .off)
  }
}
