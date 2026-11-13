import Foundation
import Testing

@testable import MatineeCore

@Suite struct CapabilitiesTests {
  private var phone: CapabilitySnapshot {
    .init(
      codecs: .init(
        video: [
          .init(
            codec: "h264", widest: .init(width: 4096, height: 2304),
            tallest: .init(width: 2304, height: 4096), tenBit: false),
          .init(
            codec: "hevc", widest: .init(width: 4096, height: 2176),
            tallest: .init(width: 2176, height: 4096), tenBit: true),
          .init(codec: "vp9", widest: nil, tallest: nil, tenBit: false),
        ], audio: ["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts", "truehd"],
        dolbyVision: false))
  }

  @Test func avPlayerSaysWhatTheProfileSupports() {
    let device = playbackProfile(snapshot: phone, locale: Locale(identifier: "de_DE"))
    // AVPlayer differs from ExoPlayer in containers and embedded subtitle support.
    #expect(device.containers == ["mp4", "m4v", "mov"])
    #expect(device.audio == ["aac", "mp3", "opus", "flac", "ac3", "eac3", "pcm_*"])
    #expect(device.streamAudio == ["opus", "aac", "mp3", "flac", "ac3", "eac3"])
    #expect(device.encodeVideo == ["h264", "hevc"])
    #expect(device.hls && device.selectAudio)
    #expect(device.subtitles == ["webvtt"])
    #expect(device.sidecarSubtitles.isEmpty && device.embeddedSubtitles.isEmpty)
    #expect(device.language == "de")
  }

  @Test func eachDecoderGoesInAsWideAndAsTallAsItGoes() throws {
    let device = playbackProfile(snapshot: phone)
    let hevc = device.video.filter { $0.codec == "hevc" }
    #expect(hevc.map(\.maxWidth) == [4096, 2176])
    #expect(hevc.map(\.maxHeight) == [2176, 4096])
    #expect(hevc.allSatisfy { $0.maxBitDepth == 10 })
    #expect(
      hevc.allSatisfy {
        $0.dolbyVisionProfiles?.contains(5) == false && $0.dolbyVisionProfiles?.contains(8) == true
      })
    #expect(device.video.first { $0.codec == "h264" }?.maxBitDepth == 8)
    let vp9 = device.video.filter { $0.codec == "vp9" }
    #expect(vp9.count == 1 && vp9.first?.maxWidth == nil)
    let square = FrameSize(width: 1920, height: 1920)
    #expect(
      profileDecoders(
        .init(codec: "av1", widest: square, tallest: square, tenBit: false), dolbyVision: true
      ).count == 1)
    let single = profileDecoders(
      .init(codec: "av1", widest: square, tallest: nil, tenBit: false), dolbyVision: true)
    #expect(try #require(single.first).dolbyVisionProfiles == nil)
  }

  @Test func leavesOutWhatSettingsConvert() {
    let device = playbackProfile(
      settings: .init(convertAudio: ["eac3", "ac3"], audioCodec: "aac", videoCodec: "hevc"),
      snapshot: phone)
    #expect(!device.audio.contains("ac3") && !device.audio.contains("eac3"))
    #expect(device.streamAudio == ["aac", "opus", "mp3", "flac"])
    #expect(device.encodeVideo == ["hevc", "h264"])
    #expect(
      playbackProfile(settings: .init(videoCodec: "av1"), snapshot: phone).encodeVideo == [
        "h264", "hevc",
      ])
  }

  @Test func theLanguageIsTheBaseOne() {
    #expect(profileLanguage(Locale(identifier: "en-US-u-fw-mon-mu-celsius")) == "en")
    #expect(profileLanguage(Locale(identifier: "")) == "en")
    #expect(profileLanguage(Locale(identifier: "pt-BR")) == "pt")
  }

  @Test func currentMacDescription() throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    print(
      "CAPABILITY DESCRIPTION "
        + String(
          decoding: try encoder.encode(playbackProfile(snapshot: Capabilities.probe())),
          as: UTF8.self))
  }
}
