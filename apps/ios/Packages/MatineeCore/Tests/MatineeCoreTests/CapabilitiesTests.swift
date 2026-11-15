import CoreMedia
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

  @Test func mpvFormatsComeFromItsBuild() {
    let device = mpvPlaybackProfile(settings: .init(convertAudio: ["dts"], audioCodec: "aac"), snapshot: phone, locale: Locale(identifier: "de_DE"))
    #expect(device.containers.contains("mkv") && device.containers.contains("webm"))
    #expect(device.audio.contains("truehd") && device.audio.contains("opus"))
    #expect(!device.audio.contains("dts"))
    #expect(device.streamAudio.first == "aac")
    #expect(device.video.contains { $0.codec == "mpeg2video" })
    #expect(!device.video.contains { $0.codec == "av1" })
    #expect(device.video.allSatisfy { $0.dolbyVisionProfiles == [] })
    #expect(device.embeddedSubtitles.contains("PGS") && device.embeddedSubtitles.contains("ASS"))
    #expect(device.subtitles == ["webvtt", "ass"])
    #expect(device.sidecarSubtitles.isEmpty)
    #expect(device.language == "de")
    let hardware = CapabilitySnapshot(codecs: .init(video: phone.codecs.video + [.init(codec: "av1", widest: nil, tallest: nil, tenBit: true)], audio: phone.codecs.audio, dolbyVision: false))
    #expect(mpvPlaybackProfile(snapshot: hardware).video.contains { $0.codec == "av1" })
  }

  /// Passthrough offers what the engine plays as it is: AudioToolbox's
  /// formats for AVPlayer, and every optional one for mpv, which the mpv
  /// profile claims whatever the device decodes.
  @Test func passthroughFollowsTheEngine() {
    let lean = CapabilitySnapshot(codecs: .init(video: phone.codecs.video, audio: ["aac", "ac3"], dolbyVision: false))
    #expect(Capabilities.passthrough(lean, engine: .avPlayer) == ["ac3"])
    #expect(Capabilities.passthrough(lean, engine: .mpv) == OPTIONAL_PASSTHROUGH)
    let claimed = Set(mpvPlaybackProfile(snapshot: lean).audio)
    #expect(OPTIONAL_PASSTHROUGH.allSatisfy(claimed.contains))
  }

  @Test func theSimulatorDecodesH264AndHevcWithoutHardware() {
    let none: (CMVideoCodecType) -> Bool = { _ in false }
    #expect(Capabilities.videoDecodes(kCMVideoCodecType_H264, hardware: none, simulator: true))
    #expect(Capabilities.videoDecodes(kCMVideoCodecType_HEVC, hardware: none, simulator: true))
    #expect(!Capabilities.videoDecodes(kCMVideoCodecType_AV1, hardware: none, simulator: true))
    #expect(!Capabilities.videoDecodes(kCMVideoCodecType_H264, hardware: none, simulator: false))
    #expect(Capabilities.videoDecodes(kCMVideoCodecType_AV1, hardware: { _ in true }, simulator: false))
  }
  @Test func avPlayerSaysWhatTheProfileSupports() {
    let device = playbackProfile(snapshot: phone, locale: Locale(identifier: "de_DE"))
    // AVPlayer differs from ExoPlayer in containers and embedded subtitle support.
    #expect(device.containers == ["mp4", "m4v", "mov"])
    #expect(device.audio == ["aac", "opus", "flac", "ac3", "eac3", "pcm_*"])
    #expect(device.streamAudio == ["opus", "aac", "flac", "ac3", "eac3"])
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
        $0.dolbyVisionProfiles == []
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
    #expect(try #require(single.first).dolbyVisionProfiles == [])
  }

  @Test func leavesOutWhatSettingsConvert() {
    let device = playbackProfile(
      settings: .init(convertAudio: ["eac3", "ac3"], audioCodec: "aac", videoCodec: "hevc"),
      snapshot: phone)
    #expect(!device.audio.contains("ac3") && !device.audio.contains("eac3"))
    #expect(device.streamAudio == ["aac", "opus", "flac"])
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

  @Test func hdrAndDolbyVisionArePerCodecAndBitDepth() {
    var snapshot = phone
    snapshot.hdr = [HdrFormat.hdr10, HdrFormat.hlg, HdrFormat.dolby_vision]
    snapshot.codecs = .init(
      video: phone.codecs.video + [
        .init(codec: "av1", widest: nil, tallest: nil, tenBit: true)
      ], audio: [], dolbyVision: true)
    let device = playbackProfile(snapshot: snapshot)
    #expect(
      device.video.filter { $0.codec == "h264" }.allSatisfy {
        $0.hdr == [] && $0.dolbyVisionProfiles == [] && $0.maxLevel == 52
      })
    #expect(
      device.video.filter { $0.codec == "hevc" }.allSatisfy {
        $0.hdr == snapshot.hdr && $0.dolbyVisionProfiles == [5, 8]
          && $0.profiles == ["Main", "Main 10"] && $0.maxLevel == 153
      })
    #expect(
      device.video.filter { $0.codec == "av1" }.allSatisfy {
        $0.hdr == ["hdr10", "hlg"] && $0.dolbyVisionProfiles == [] && $0.maxLevel == 18
      })
    #expect(device.video.allSatisfy { $0.dolbyVisionProfiles?.contains(7) == false })
  }

  @Test @MainActor func currentMacDescription() throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    print(
      "CAPABILITY DESCRIPTION "
        + String(
          decoding: try encoder.encode(playbackProfile(snapshot: Capabilities.probe())),
          as: UTF8.self))
  }
}
