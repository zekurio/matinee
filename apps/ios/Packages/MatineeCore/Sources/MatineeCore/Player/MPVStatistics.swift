/// mpv observations, not AVPlayer access-log defaults. Missing counters remain unknown.
public struct MPVStatistics: Codable, Sendable, Equatable {
  public var activeAudioOrdinal: Int?
  public var audioCodec: Safe?
  public var decoder: Safe?
  public var decode: Safe?
  public var videoOutput: Safe?
  public var decoderDroppedFrames: Int64?
  public var outputDroppedFrames: Int64?
  public var samples: Int64?
  public init(
    activeAudioOrdinal: Int? = nil, audioCodec: String? = nil, decoder: String?, decode: String?,
    videoOutput: String?, decoderDroppedFrames: Int64?, outputDroppedFrames: Int64?, samples: Int64?
  ) {
    self.activeAudioOrdinal = activeAudioOrdinal
    self.audioCodec = Safe.token(audioCodec)
    self.decoder = Safe.token(decoder)
    self.decode = Safe.token(decode)
    self.videoOutput = Safe.token(videoOutput)
    self.decoderDroppedFrames = decoderDroppedFrames
    self.outputDroppedFrames = outputDroppedFrames
    self.samples = samples
  }
}
