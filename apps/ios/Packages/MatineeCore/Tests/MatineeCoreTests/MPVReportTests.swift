import Testing

@testable import MatineeCore

struct MPVReportTests {
  @Test func mpvDoesNotPrintAVPlayerDefaults() {
    var report = PlaybackReport()
    report.mpvStatistics = MPVStatistics(
      activeAudioOrdinal: 2, audioCodec: "aac",
      decoder: "hevc", decode: "software", videoOutput: "sample-buffer", decoderDroppedFrames: 2,
      outputDroppedFrames: nil, samples: 40)
    let text = formatReport(report)
    #expect(text.contains("player: mpv\n"))
    #expect(text.contains("decoder=hevc decode=software video_output=sample-buffer"))
    #expect(text.contains("decoder_dropped_frames=2 output_dropped_frames=unknown samples=40"))
    #expect(text.contains("active_audio=2 audio_codec=aac"))
    #expect(!text.contains("AVPlayer"))
    #expect(!text.contains("avplayer:"))
    #expect(!text.contains("likely_to_keep_up"))
  }
  @Test func absentMPVSnapshotDoesNotInventAVPlayerStatistics() {
    var report = PlaybackReport()
    report.settings = .of(
      engine: "mpv", decoders: "auto", quality: "original", videoCodec: "auto", audioCodec: "auto",
      convertAudio: [])
    let text = formatReport(report)
    #expect(text.contains("player: mpv\n"))
    #expect(!text.contains("avplayer:"))
  }
  @Test func avPlayerRetainsItsStatistics() {
    #expect(formatReport(PlaybackReport()).contains("avplayer: status=unknown"))
  }
}
