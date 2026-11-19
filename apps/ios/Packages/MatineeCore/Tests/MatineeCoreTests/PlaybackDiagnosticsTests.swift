import AVFoundation
import Foundation
import Testing

@testable import MatineeCore

@Suite(.serialized) struct PlaybackDiagnosticsTests {
  private func report() -> PlaybackReport {
    var r = PlaybackReport()
    r.device = .of(
      appVersion: "0.1.0", appBuild: 1, buildType: "release", osRelease: "27.2", model: "iPhone",
      abi: "arm64")
    r.settings = .of(
      engine: "avplayer", decoders: "hardware", quality: "original", videoCodec: "auto",
      audioCodec: "opus", convertAudio: ["eac3", "ac3"])
    return r
  }
  private func attempt(
    _ r: inout PlaybackReport, mode: SourceMode = .direct, reason: AttemptReason = .start
  ) {
    r.attempt(mode: mode, reason: reason, at: 12.7, audioIndex: 1, quality: nil, burnIn: false)
  }
  @Test func formatsAttemptsAndCodes() {
    var r = report()
    attempt(&r)
    r.failed(
      ErrorDiagnostics(
        code: 2004, name: Safe.constant("ERROR_CODE_IO_BAD_HTTP_STATUS"),
        type: Safe.token("source"), httpStatus: 401,
        causes: [Safe.token("InvalidResponseCodeException")!]))
    r.attempt(
      mode: .hls, reason: .fallback, at: 12.7, audioIndex: 1, quality: "1080p-20", burnIn: true,
      why: ["subtitle", "failed"], videoTo: "h264", audioTo: "opus")
    var track = TrackDiagnostics(
      mediaType: "video", codec: "avc1.640028", width: 1920, height: 1080, channels: nil,
      sampleRate: nil)
    track.type = .video
    track.selected = true
    track.mime = Safe.mime("video/avc")
    track.bitrate = 8_000_000
    track.support = Safe.constant("YES")
    r.tracks([track])
    r.decoder(DecoderDiagnostics(type: .video, name: Safe.token("decoder")))
    r.playing()
    let text = formatReport(r)
    for line in [
      "app: 0.1.0 (1, release)", "device: Apple iPhone", "engine: avplayer, decoders: hardware",
      "convert_audio=ac3,eac3", "1. direct reason=start at=12s audio=#1 -> failed", "http=401",
      "causes=InvalidResponseCodeException",
      "2. hls reason=fallback at=12s audio=#1 quality=1080p-20 burn_in=yes why=subtitle,failed video_to=h264 audio_to=opus -> playing",
      "video selected video/avc codecs=avc1.640028 1920x1080 8000kbps support=YES",
      "decoders: video=decoder",
    ] { #expect(text.contains(line)) }
    #expect(!r.failed)
  }
  @Test func theAccountsLimitsShowAsCodes() {
    var r = report()
    r.attempt(
      mode: .hls, reason: .start, at: 0, audioIndex: 1, quality: "720p-4", burnIn: false,
      why: ["limit"])
    r.note(.restricted)
    r.note(.tooManyStreams)
    #expect(formatReport(r).contains("why=limit"))
    #expect(formatReport(r).contains("notes: restricted x1, too_many_streams x1"))
  }
  @Test func leavesOutWhatTellsWhoOrWhat() throws {
    var r = report()
    attempt(&r)
    r.failed(
      ErrorDiagnostics(
        code: 2004,
        name: Safe.constant("Response code: 401 for https://media.example.com/api?token=abc123"),
        decoder: Safe.token("/data/user/secret.heist.mkv"),
        causes: [Safe.token("Bearer abc123: jane@example.com")!]))
    r.tracks([
      TrackDiagnostics(
        mediaType: "http://secret", codec: "file:///sdcard/secret.mkv", width: 0, height: 0,
        channels: nil, sampleRate: nil)
    ])
    let text = formatReport(r) + String(decoding: try JSONEncoder().encode(r), as: UTF8.self)
    for secret in [
      "Secret", "Heist", "secret.heist", "item-8f3a2c", "library-77d1", "Jane", "commentary",
      "Signs", "Songs", "English", "Atmos", "example.com", "token=", "abc123", "Bearer", "@", "://",
      "/data", "sdcard", "2024-05-01",
    ] { #expect(!text.localizedCaseInsensitiveContains(secret)) }
    #expect(formatReport(r).contains("error: other (2004) decoder=other causes=other"))
  }
  @Test func keepsOnlyTheLatestAttempts() {
    var r = report()
    for i in 0..<30 {
      r.attempt(
        mode: .stream, reason: .audioChange, at: Double(i), audioIndex: i, quality: nil,
        burnIn: false)
    }
    #expect(r.attempts.count == MAX_ATTEMPTS)
    #expect(r.droppedAttempts == 18)
    #expect(r.attempts.map(\.number) == Array(19...30))
    #expect(formatReport(r).contains("attempts: (18 earlier left out)"))
  }
  @Test func boundsTracksDecodersAndCauses() {
    var r = report()
    attempt(&r)
    let track = TrackDiagnostics(
      mediaType: "audio", codec: "ac-3", width: 0, height: 0, channels: 6, sampleRate: 48000)
    r.tracks(Array(repeating: track, count: 10))
    for i in 0..<10 {
      r.decoder(DecoderDiagnostics(type: .audio, name: Safe.token("decoder.\(i)")))
    }
    r.decoder(DecoderDiagnostics(type: .audio, name: Safe.token("decoder.9")))
    r.failed(ErrorDiagnostics(code: 4001, causes: (0..<10).compactMap { Safe.token("Cause\($0)") }))
    #expect(r.tracks.count == MAX_TRACKS)
    #expect(
      r.decoders.map { $0.name?.text } == ["decoder.6", "decoder.7", "decoder.8", "decoder.9"])
    #expect(r.latest?.error?.causes.count == MAX_CAUSES)
    #expect(r.failed)
  }
  @MainActor @Test func followsEachAttemptsOutcome() {
    var sink: [PlaybackReport] = []
    let r = DiagnosticsRecorder(report()) { sink.append($0) }
    r.attempt(mode: .direct, reason: .start, at: 0, audioIndex: nil, quality: nil, burnIn: false)
    r.attempt(
      mode: .hls, reason: .qualityChange, at: 30, audioIndex: nil, quality: "720p-4", burnIn: false)
    #expect(r.report.attempts.map(\.outcome) == [.replaced, .loading])
    r.failed(ErrorDiagnostics(code: 500))
    r.playing()
    #expect(r.report.latest?.outcome == .failed)
    r.attempt(mode: .hls, reason: .retry, at: 30, audioIndex: nil, quality: "720p-4", burnIn: false)
    r.closed()
    #expect(r.report.latest?.outcome == .closed)
    #expect(r.report.attempts[1].outcome == .failed)
    r.note(.subtitleLoadFailed)
    r.note(.subtitleLoadFailed)
    #expect(formatReport(r.report).contains("notes: subtitle_load_failed x2"))
    #expect(sink.last == r.report)
    #expect(sink.first?.attempts.isEmpty == true)
    var played = report()
    attempt(&played)
    played.playing()
    played.close()
    #expect(played.latest?.outcome == .playing)
  }
  @Test func emptyReportSaysSo() {
    let text = formatReport(report())
    #expect(text.contains("attempts:\n  none"))
    #expect(text.contains("tracks:\n  none reported"))
  }
  @MainActor @Test func storeKeepsTheLatestUntilCleared() {
    PlaybackDiagnostics.clear()
    #expect(PlaybackDiagnostics.latest == nil)
    let r = DiagnosticsRecorder(report())
    r.attempt(mode: .local, reason: .start, at: 0, audioIndex: nil, quality: nil, burnIn: false)
    #expect(PlaybackDiagnostics.latest == r.report)
    PlaybackDiagnostics.clear()
    #expect(PlaybackDiagnostics.latest == nil)
  }
  @Test func safeTakesOnlyCodes() {
    #expect(Safe.token("Main 10")?.text == "Main 10")
    #expect(Safe.token("c2.qti.hevc.decoder")?.text == "c2.qti.hevc.decoder")
    #expect(Safe.token(nil) == nil)
    #expect(Safe.token("  ") == nil)
    for bad in [
      "a/b", "a:b", "a?b", "a=b", "a@b", "a\\b", "a%20b", String(repeating: "x", count: 49),
      "line\nbreak", "ümlaut",
    ] { #expect(Safe.token(bad) == .OTHER) }
    #expect(Safe.known("MKV", KNOWN_CONTAINERS)?.text == "mkv")
    #expect(Safe.known("secret.heist.mkv", KNOWN_CONTAINERS) == .OTHER)
    #expect(Safe.mime("video/avc")?.text == "video/avc")
    #expect(Safe.mime("audio/mp4a-latm")?.text == "audio/mp4a-latm")
    for bad in ["file/secret", "video/a/b", "video/../x y"] { #expect(Safe.mime(bad) == .OTHER) }
    #expect(safeAudioCodec("pcm_s24le")?.text == "pcm_s24le")
    #expect(safeAudioCodec("pcm_/etc/passwd") == .OTHER)
    #expect(safeQuality("4k-secret") == .OTHER)
    #expect(safeQuality("720p-4")?.text == "720p-4")
    #expect(safeQuality("original")?.text == "original")
  }
  @Test func boundedDiagnostics() {
    var report = PlaybackReport()
    let source = Source(
      method: "direct", url: "https://secret.invalid", hls: false, offset: 0, start: 0)
    for _ in 0..<30 { report.attempt(source, plan: nil, reason: .start, audioIndex: nil) }
    #expect(report.attempts.count == 12)
    #expect(report.droppedAttempts == 18)
    report.failed(ErrorDiagnostics(code: 401))
    #expect(report.attempts.last?.outcome == .failed)
    var odd = source
    odd.method = "https://secret.invalid?token=secret"
    report.attempt(odd, plan: nil, reason: .retry, audioIndex: nil)
    #expect(report.attempts.last?.mode == .encode)
    #expect(!formatReport(report).contains("secret"))
  }
  @MainActor @Test func diagnosticsStore() {
    PlaybackDiagnostics.clear()
    #expect(PlaybackDiagnostics.latest == nil)
    PlaybackDiagnostics.latest = PlaybackReport()
    #expect(PlaybackDiagnostics.shared.report != nil)
    PlaybackDiagnostics.clear()
  }
  @Test func reportsNeverContainURLs() throws {
    var report = PlaybackReport()
    report.attempt(
      Source(
        method: "direct", url: "https://secret.invalid/a.mkv", hls: false, offset: 0, start: 10),
      plan: nil, reason: .start, audioIndex: nil)
    report.failed(errorDiagnostics(NSError(domain: AVFoundationErrorDomain, code: -11800)))
    let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
    #expect(!json.contains("http"))
    #expect(report.attempts.last?.error?.code == -11800)
  }
  @Test func appleModelIdentifiers() throws {
    // Phones, Macs, and what a simulator's SIMULATOR_MODEL_IDENTIFIER says.
    for model in ["iPhone17,1", "iPad16,3", "Mac16,12", "MacBookPro18,3", "arm64"] {
      let device = DeviceDiagnostics.of(
        appVersion: "0.1.0", appBuild: 1, buildType: "debug", osRelease: "27.2", model: model,
        abi: "arm64")
      #expect(device.model?.text == model)
      #expect(
        try JSONDecoder().decode(Safe.self, from: JSONEncoder().encode(device.model))
          == device.model)
    }
    for bad in [
      "Jane's iPhone", "iPhone 17", "iPhone17.1", "iPhone17_1", "iPhone-17", "a/b", "C02XL0GHJGH5;",
      String(repeating: "x", count: 41),
    ] {
      #expect(Safe.model(bad) == .OTHER)
    }
    #expect(Safe.model(" ") == nil)
    let here = deviceDiagnostics().model?.text
    #expect(here != nil && here != "other")
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
      #expect(here == simulated)
    }
  }
  @Test func errorChainUsesOnlyDomainsAndCodes() {
    let cause = NSError(
      domain: NSURLErrorDomain, code: -1001,
      userInfo: [NSLocalizedDescriptionKey: "https://secret.invalid?token=secret"])
    let error = NSError(
      domain: AVFoundationErrorDomain, code: -11800,
      userInfo: [
        NSUnderlyingErrorKey: cause, NSURLErrorKey: URL(string: "https://secret.invalid")!,
      ])
    let value = errorDiagnostics(error)
    #expect(value.name?.text == AVFoundationErrorDomain)
    #expect(value.causes.map(\.text) == [NSURLErrorDomain])
    #expect(value.causeCodes == [-1001])
    #expect(!formatError(value).contains("secret"))
  }
  @Test func fakeLogsAndBuffer() {
    var r = report()
    attempt(&r)
    var snapshot = DiagnosticsSnapshot()
    snapshot.playing = true
    snapshot.status = "ready"
    snapshot.access = [
      .init(droppedFrames: 8, stalls: 2, indicatedBitrate: 1000, observedBitrate: 900)
    ]
    snapshot.errors = (0..<10).map { .init(domain: "NSURLErrorDomain", code: $0) }
    snapshot.bufferFull = true
    snapshot.likelyToKeepUp = true
    snapshot.bufferedSeconds = 10
    r.sample(snapshot)
    #expect(r.latest?.outcome == .playing)
    #expect(r.errorLogCodes == [7, 8, 9])
    #expect(r.droppedFrames == 8 && r.stalls == 2)
    #expect(r.indicatedBitrate == 1000 && r.observedBitrate == 900)
    #expect(r.bufferFull && r.likelyToKeepUp && r.bufferedSeconds == 10)
    snapshot.errors = [.init(domain: "https://secret", code: 403)]
    snapshot.access = [
      .init(droppedFrames: -1, stalls: -1, indicatedBitrate: .nan, observedBitrate: .infinity)
    ]
    r.sample(snapshot)
    #expect(r.errorLogDomains == [.OTHER])
    #expect(r.indicatedBitrate == 0 && r.observedBitrate == 0)
    #expect(!formatReport(r).contains("secret"))
  }
  private func item() -> MediaItem {
    MediaItem(
      id: "item-8f3a2c", libraryId: "library-77d1", fileTitle: "Secret Heist",
      label: ItemLabel(
        show: "movie", showName: "Secret Heist", year: nil, showKey: "secret", title: nil,
        untitled: false, episodeNumber: nil, code: nil, shortCode: nil, group: "", groupLabel: []),
      title: nil, seasonNumber: nil, episodeNumber: nil, episode: nil,
      relativePath: "Movies/Secret Heist/secret.heist.mkv", container: "mkv",
      mimeType: "video/x-matroska", sizeBytes: 4_000_000_000, modifiedAt: "2024-05-01",
      durationSeconds: 6000, probe: nil, progress: nil, favorite: false)
  }
  private func audio() -> AudioTrack {
    AudioTrack(
      index: 1, label: "English Jane Doe commentary", language: "en", title: "Jane Doe commentary",
      codec: "truehd", format: "TrueHD Atmos", channels: 8, layout: nil, primary: true)
  }
  private func subtitle() -> SubtitleTrack {
    SubtitleTrack(
      id: "stream-3", label: "English Signs and Songs", language: "en", title: "Signs and Songs",
      forced: false, sdh: false, default: false, source: "embedded", index: 3, format: "PGS",
      delivery: "pgs")
  }
  @Test func recordsWhatTheServerAnswered() {
    let plan = PlaybackStart(
      item: item(), method: "transcode", url: "/api/media/item-1/hls/main.m3u8", hls: true,
      offset: 120.4, start: 0, position: 120.4, audio: audio(), convertedAudio: "opus",
      convertedVideo: nil, standIn: nil, subtitle: subtitle(), subtitleMode: "burn-in",
      subtitleUrl: nil, audioTracks: [audio()], subtitleTracks: [subtitle()], quality: "720p-4",
      qualities: [], original: true, reasons: ["subtitle", "secret words"], previous: nil, next: nil, upNextAt: nil, segments: [])
    var r = report()
    r.attempt(
      Source.of(plan) { "https://media.example.com\($0)" }, plan: plan, reason: .subtitleChange,
      audioIndex: nil)
    #expect(
      formatReport(r).contains(
        "1. hls reason=subtitle_change at=120s audio=#1 quality=720p-4 burn_in=yes why=subtitle,other audio_to=opus -> loading"
      ))
    #expect(!formatReport(r).contains("media.example.com"))
  }
  /// The server names an MP4's mov_text track "TX3G", and every other format by its display name.
  @Test func subtitleFormatsByTheServersNames() {
    for (format, safe) in [
      ("TX3G", "tx3g"), ("SRT", "srt"), ("WebVTT", "webvtt"), ("ASS", "ass"), ("SSA", "ssa"), ("PGS", "pgs"),
      ("VobSub", "vobsub"), ("DVB", "dvb"), ("Teletext", "teletext"),
    ] {
      let track = SubtitleTrack(
        id: "stream-2", label: "English", language: "en", title: nil, forced: false, sdh: false, default: false,
        source: "embedded", index: 2, format: format, delivery: "webvtt")
      #expect(SelectionDiagnostics.of(audio: nil, subtitle: track, rendering: .screen).subtitleFormat?.text == safe)
    }
  }
  @Test func fileSelectionAndCapabilitiesExcludePrivateMetadata() throws {
    var media = item()
    media.probe = try decodeSaved(
      DisplayMediaProbe.self,
      text: """
        {"format":{"name":"matroska,webm"},"video":{"index":0,"codec":"hevc","profile":"Main 10","width":3840,"height":2160,"bitDepth":10,"hdr":"hdr10","interlaced":false,"hdr10Plus":false,"masteringDisplay":false,"format":"Secret Format","resolution":"4K"},"audio":[{"index":1,"codec":"truehd","channels":8,"language":"en","title":"Jane Doe commentary","default":true,"format":"Atmos"},{"index":2,"codec":"ac3","channels":6,"default":false,"format":"AC3"}],"subtitles":[{"index":3,"codec":"hdmv_pgs_subtitle","title":"Signs and Songs","default":false,"forced":false,"hearingImpaired":false}]}
        """)
    var r = report()
    r.file = .of(media)
    r.selection = .of(audio: audio(), subtitle: subtitle(), rendering: .burnIn)
    let device = playbackProfile(
      snapshot: CapabilitySnapshot(
        codecs: DeviceCodecs(video: [], audio: ["aac", "pcm_*"], dolbyVision: false)))
    r.capabilities = .of(device, options: FALLBACK_PLAYBACK_OPTIONS)
    let text = formatReport(r)
    #expect(text.contains("file: container=mkv video=hevc (Main 10) 3840x2160 10bit hdr=hdr10"))
    #expect(text.contains("file tracks: audio=truehd,ac3 subtitles=1"))
    #expect(text.contains("audio picked: #1 truehd 8ch"))
    #expect(text.contains("subtitle picked: pgs embedded delivery=pgs drawn_by=burn_in"))
    for secret in [
      "Secret", "Heist", "item-8f3a2c", "library-77d1", "Jane", "commentary", "Signs", "Songs",
      "English", "Atmos", "2024-05-01",
    ] { #expect(!text.localizedCaseInsensitiveContains(secret)) }
    let encoded = try JSONEncoder().encode(r)
    #expect(try JSONDecoder().decode(PlaybackReport.self, from: encoded) == r)
  }
  @Test func fakeAudioFormat() throws {
    var asbd = AudioStreamBasicDescription(
      mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM,
      mFormatFlags: kAudioFormatFlagIsSignedInteger, mBytesPerPacket: 4, mFramesPerPacket: 1,
      mBytesPerFrame: 4, mChannelsPerFrame: 2, mBitsPerChannel: 16, mReserved: 0)
    var format: CMAudioFormatDescription?
    #expect(
      CMAudioFormatDescriptionCreate(
        allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0,
        magicCookie: nil, extensions: nil, formatDescriptionOut: &format) == noErr)
    let t = DiagnosticsProbe.formatDiagnostics(try #require(format), selected: true)
    #expect(t.type == .audio && t.channels == 2 && t.sampleRate == 48000 && t.bitDepth == 16)
  }
  @Test(.enabled(if: ProcessInfo.processInfo.environment["MATINEE_PLAYER_LIVE"] == "1"))
  @MainActor func renderedLiveReport() async throws {
    struct Fixture: Decodable {
      var id: String
      var path: String
    }
    let env = ProcessInfo.processInfo.environment
    let token = try String(contentsOfFile: env["MATINEE_PLAYER_TOKEN_FILE"]!, encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let fixtures = try JSONDecoder().decode(
      [Fixture].self,
      from: Data(contentsOf: URL(fileURLWithPath: env["MATINEE_PLAYER_ITEMS_FILE"]!)))
    let fixture = try #require(fixtures.first { $0.path.contains("Toy Story") })
    let api = MatineeApi(base: URL(string: "http://localhost:18420")!, tokenProvider: { token })
    let prefs = PlayerPrefs(defaults: UserDefaults(suiteName: UUID().uuidString)!)
    let controller = PlayerController(
      api: api, device: playbackProfile(snapshot: Capabilities.probe()), prefs: prefs,
      tokenProvider: { token })
    controller.surfaceShown = true
    await controller.start(itemId: fixture.id)
    try await Task.sleep(for: .seconds(4))
    #expect(controller.position > 1)
    print("RENDERED REPORT BEGIN\n" + formatReport(controller.diagnostics) + "RENDERED REPORT END")
    await controller.stop()
  }
  @MainActor @Test func injectedProbeAndTrackSelection() async throws {
    struct Fake: DiagnosticsProbing {
      func snapshot(_ player: AVPlayer) -> DiagnosticsSnapshot {
        var value = DiagnosticsSnapshot()
        value.playing = true
        value.status = "ready"
        return value
      }
    }
    var r = report()
    attempt(&r)
    r.sample(AVPlayer(), probe: Fake())
    #expect(r.latest?.outcome == .playing)
    var audio = TrackDiagnostics(
      mediaType: "audio", codec: "aac", width: 0, height: 0, channels: 2, sampleRate: 48000)
    audio.type = .audio
    var video = TrackDiagnostics(
      mediaType: "video", codec: "avc1", width: 1920, height: 1080, channels: nil, sampleRate: nil)
    video.type = .video
    video.selected = true
    #expect(
      DiagnosticsProbe.trackDiagnostics([audio, video, video, video]) == [video, video, audio])
    #expect(DiagnosticsProbe.trackDiagnostics([audio, audio]) == [audio])
  }
  @Test func hevcAndHLGFormat() throws {
    var hevc = Data(repeating: 0, count: 23)
    hevc[0] = 1
    hevc[1] = 2
    hevc[12] = 153
    hevc[17] = 2
    let extensions: [String: Any] = [
      kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms as String: ["hvcC": hevc],
      kCMFormatDescriptionExtension_TransferFunction as String: "ITU_R_2100_HLG",
    ]
    var format: CMVideoFormatDescription?
    #expect(
      CMVideoFormatDescriptionCreate(
        allocator: kCFAllocatorDefault, codecType: kCMVideoCodecType_HEVC, width: 3840,
        height: 2160, extensions: extensions as CFDictionary, formatDescriptionOut: &format)
        == noErr)
    let value = DiagnosticsProbe.formatDiagnostics(try #require(format), selected: false)
    #expect(value.profile?.text == "2" && value.level?.text == "153")
    #expect(value.bitDepth == 10 && value.hdr?.text == "hlg")
  }
  @Test func fakeFormatDescription() throws {
    let atoms: [String: Data] = ["avcC": Data([1, 100, 0, 40]), "dvcC": Data([1, 0, 16, 48])]
    let extensions: [String: Any] = [
      kCMFormatDescriptionExtension_ColorPrimaries as String: "ITU_R_2020",
      kCMFormatDescriptionExtension_TransferFunction as String: "SMPTE_ST_2084_PQ",
      kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms as String: atoms,
      "BitsPerComponent": 10, "Label": "Secret Heist",
    ]
    var format: CMVideoFormatDescription?
    #expect(
      CMVideoFormatDescriptionCreate(
        allocator: kCFAllocatorDefault, codecType: kCMVideoCodecType_H264, width: 1920,
        height: 1080, extensions: extensions as CFDictionary, formatDescriptionOut: &format)
        == noErr)
    let value = DiagnosticsProbe.formatDiagnostics(
      try #require(format), selected: true, frameRate: 24, bitrate: 8_000_000)
    #expect(value.width == 1920 && value.height == 1080)
    #expect(value.profile?.text == "100" && value.level?.text == "40")
    #expect(value.bitDepth == 10)
    #expect(value.dolbyVisionProfile == 8 && value.dolbyVisionLevel == 6)
    #expect(value.hdr?.text == "dolby-vision")
    #expect(value.frameRate == 24)
    #expect(!formatTrack(value).contains("Secret"))
  }
}
