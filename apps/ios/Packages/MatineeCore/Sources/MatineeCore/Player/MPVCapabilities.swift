import Foundation

/// Format names from MPVUI 0.10.0's FFmpegFlags.swift, not a full FFmpeg build.
public func mpvPlaybackProfile(
  settings: ProfileSettings = ProfileSettings(), snapshot: CapabilitySnapshot,
  locale: Locale = .current
) -> PlaybackDevice {
  var result = playbackProfile(settings: settings, snapshot: snapshot, locale: locale)
  result.containers = ["mp4", "m4v", "mov", "mkv", "webm", "avi", "flv", "ts", "m2ts", "mts", "mpg", "mpeg", "ogv", "wmv", "3gp", "3g2"]
  result.audio = ["aac", "ac3", "eac3", "alac", "flac", "dts", "truehd", "mp1", "mp2", "mp3", "opus", "vorbis", "wmav1", "wmav2", "wmapro", "wmalossless", "amr_nb", "amr_wb", "pcm_*"].filter { !settings.convertAudio.contains($0) }
  result.streamAudio = ["opus", "aac", "flac", "alac", "ac3", "eac3"].filter { $0 == "aac" || result.audio.contains($0) }
  if let index = result.streamAudio.firstIndex(of: settings.audioCodec) {
    result.streamAudio.insert(result.streamAudio.remove(at: index), at: 0)
  }
  // AV1 software decoding is too expensive on older phones. Keep the hardware gate.
  let software = ["h264", "hevc", "vp8", "vp9", "mpeg1video", "mpeg2video", "mpeg4", "vc1", "wmv1", "wmv2", "wmv3", "h263", "mjpeg", "prores", "ffv1", "flv1"]
  result.video = (software + (snapshot.codecs.video.contains { $0.codec == "av1" } ? ["av1"] : [])).map { codec in
    PlaybackDecoder(codec: codec, maxWidth: 3840, maxHeight: 3840,
      maxBitDepth: codec == "hevc" || codec == "h264" || codec == "vp9" || codec == "av1" ? 10 : 8,
      profiles: nil, maxLevel: nil,
      hdr: codec == "hevc" || codec == "vp9" || codec == "av1" ? snapshot.hdr.filter { $0 != HdrFormat.dolby_vision } : [],
      // Native Dolby Vision cannot compose ASS/bitmap subtitles. The contract
      // cannot express that combination, so do not advertise DV for this engine.
      dolbyVisionProfiles: [])
  }
  result.subtitles = ["webvtt", "ass"]
  result.embeddedSubtitles = ["ASS", "SSA", "PGS", "VobSub", "DVB", "SRT", "WebVTT", "TX3G"]
  return result
}
