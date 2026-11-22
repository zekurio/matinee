import AVFoundation
import AudioToolbox
import UIKit
import VideoToolbox

/// What the device decodes, for the playback profile. Read once.
enum Capabilities {
  static let codecs: CodecCapabilitiesMessage = {
    // Apple's HLS authoring specification supplies a 3840x2160 delivery
    // envelope; VideoToolbox says which codecs it has but not their limits.
    let widest = FrameSizeMessage(width: 3840, height: 2160)
    let tallest = FrameSizeMessage(width: 2160, height: 3840)
    let candidates: [(String, CMVideoCodecType)] = [
      ("h264", kCMVideoCodecType_H264), ("hevc", kCMVideoCodecType_HEVC), ("av1", kCMVideoCodecType_AV1),
    ]
    let video = candidates.filter { decodes($0.1) }.map {
      VideoDecoderMessage(codec: $0.0, widest: widest, tallest: tallest, tenBit: $0.0 != "h264")
    }
    // AudioFormat reports the decoders installed, rather than assuming what
    // a version of iOS has.
    var size: UInt32 = 0
    var formats: [AudioFormatID] = []
    if AudioFormatGetPropertyInfo(kAudioFormatProperty_DecodeFormatIDs, 0, nil, &size) == noErr {
      formats = Array(repeating: 0, count: Int(size) / MemoryLayout<AudioFormatID>.size)
      let status = formats.withUnsafeMutableBytes {
        AudioFormatGetProperty(kAudioFormatProperty_DecodeFormatIDs, 0, nil, &size, $0.baseAddress!)
      }
      if status != noErr { formats = [] }
    }
    let audio: [(String, AudioFormatID)] = [
      ("aac", kAudioFormatMPEG4AAC), ("mp3", kAudioFormatMPEGLayer3), ("ac3", kAudioFormatAC3),
      ("eac3", kAudioFormatEnhancedAC3), ("flac", kAudioFormatFLAC), ("alac", kAudioFormatAppleLossless),
      ("opus", kAudioFormatOpus),
    ]
    return CodecCapabilitiesMessage(
      video: video, audio: audio.filter { formats.contains($0.1) }.map(\.0),
      dolbyVision: AVPlayer.availableHDRModes.contains(.dolbyVision))
  }()

  /// VideoToolbox answers for the hardware, which the simulator has none
  /// of, though it plays H.264 and HEVC through the Mac's decoders.
  private static func decodes(_ codec: CMVideoCodecType) -> Bool {
    #if targetEnvironment(simulator)
      return codec == kCMVideoCodecType_H264 || codec == kCMVideoCodecType_HEVC
    #else
      return VTIsHardwareDecodeSupported(codec)
    #endif
  }

  static func deviceDiagnostics() -> DeviceDiagnosticsMessage {
    let info = Bundle.main.infoDictionary
    #if DEBUG
      let buildType = "debug"
    #else
      let buildType = "release"
    #endif
    #if arch(arm64)
      let abi = "arm64"
    #else
      let abi = "x86_64"
    #endif
    return DeviceDiagnosticsMessage(
      appBuild: Int64(info?["CFBundleVersion"] as? String ?? "") ?? 0, buildType: buildType,
      release: UIDevice.current.systemVersion,
      sdk: Int64(ProcessInfo.processInfo.operatingSystemVersion.majorVersion), manufacturer: "Apple",
      model: DeviceBridge.hardwareModel(), abi: abi, tv: false,
      // Media3 and its FFmpeg audio decoder are Android's.
      media3: "", ffmpeg: false)
  }
}
