import Foundation

public let ORIGINAL_QUALITY = PlaybackQuality.original
public let AUTOMATIC = "auto"
public struct Picks: Sendable, Equatable {
  public var audio: Int?
  public var subtitle: SubtitlePick?
  public var quality: String?
  public init(audio: Int? = nil, subtitle: SubtitlePick? = nil, quality: String? = nil) {
    self.audio = audio; self.subtitle = subtitle; self.quality = quality
  }
  public func merging(_ change: Picks) -> Picks {
    Picks(audio: change.audio ?? audio, subtitle: change.subtitle ?? subtitle, quality: change.quality ?? quality)
  }
}
public enum NoticeKind: Sendable { case burnInFailed, qualityFailed, switchFailed }
public enum Refusal: Sendable { case restricted, busy }
public func refusal(_ error: any Error) -> Refusal? {
  switch (error as? ApiException)?.code {
  case PLAYBACK_RESTRICTED: .restricted
  case PLAYBACK_BUSY: .busy
  default: nil
  }
}
public struct Asking: Sendable {
  public var picks: Picks
  public private(set) var failed: [String]
  public init(picks: Picks = Picks(), failed: [String] = []) { self.picks = picks; self.failed = failed }
  public func pick(_ change: Picks, tracks: [SubtitleTrack]) -> Asking {
    let track = tracks.first { $0.id == change.subtitle?.trackId }
    let encodes = (change.quality != nil && change.quality != ORIGINAL_QUALITY) || (track != nil && track?.delivery != SubtitleDelivery.webvtt)
    return Asking(picks: picks.merging(change), failed: encodes ? failed.filter { $0 != PlaybackMethod.transcode } : failed)
  }
  public func fail(_ method: String) -> Asking {
    Asking(picks: picks, failed: failed.contains(method) ? failed : failed + [method])
  }
  public func forgetFailures() -> Asking { Asking(picks: picks) }
  public func input(itemId: String, sessionId: String, device: PlaybackDevice, at: Double?, snap: String = PlaybackSnap.before) -> PlaybackStartInput {
    PlaybackStartInput(itemId: itemId, sessionId: sessionId, device: device, audio: picks.audio, subtitle: picks.subtitle, quality: picks.quality, position: at.map { max(0, $0) }, snap: snap, failed: failed)
  }
  public func settle(lost: PlaybackStart?, plan: PlaybackStart) -> (Asking, NoticeKind?) {
    guard let lost else { return (self, nil) }
    var next = self
    if lost.subtitleMode == PlaybackSubtitleMode.burn_in && plan.subtitleMode != PlaybackSubtitleMode.burn_in {
      next.picks.subtitle = SubtitlePick(trackId: nil); return (next, .burnInFailed)
    }
    if let quality = picks.quality, quality != ORIGINAL_QUALITY, lost.quality != ORIGINAL_QUALITY, plan.quality == ORIGINAL_QUALITY {
      next.picks.quality = ORIGINAL_QUALITY; return (next, .qualityFailed)
    }
    return (self, nil)
  }
}
public enum SourceKind: Sendable { case file, mp4, hls }
public enum SeekWay: Sendable { case inSource, newStream, newStart }
public struct Source: Sendable, Equatable {
  public var method: String?
  public var url: String
  public var hls: Bool
  public var offset: Double
  public var start: Double
  public init(method: String?, url: String, hls: Bool, offset: Double, start: Double) {
    self.method = method; self.url = url; self.hls = hls; self.offset = offset; self.start = start
  }
  public var position: Double { offset + start }
  public var holdsTracks: Bool { method == nil || method == PlaybackMethod.direct }
  public var seeksItself: Bool { holdsTracks || hls }
  public var seek: SeekWay { seeksItself ? .inSource : method == PlaybackMethod.remux ? .newStream : .newStart }
  public var kind: SourceKind { holdsTracks ? .file : hls ? .hls : .mp4 }
  public func fileSeconds(ms: Int64) -> Double { offset + Double(ms) / 1000 }
  public func sourceMs(seconds: Double) -> Int64 { Int64(max(0, ((seconds - offset) * 1000).rounded())) }
  public static func of(_ plan: PlaybackStart, resolve: (String) -> String) -> Source {
    Source(method: plan.method, url: resolve(plan.url), hls: plan.hls, offset: plan.offset, start: plan.start)
  }
  public static func local(url: String, at: Double) -> Source { Source(method: nil, url: url, hls: false, offset: 0, start: max(0, at)) }
}
public func sameSource(_ current: PlaybackStart, _ next: PlaybackStart) -> Bool {
  guard current.method == next.method, current.hls == next.hls else { return false }
  if next.method == PlaybackMethod.direct { return true }
  func burned(_ plan: PlaybackStart) -> String? { plan.subtitleMode == PlaybackSubtitleMode.burn_in ? plan.subtitle?.id : nil }
  return current.audio?.index == next.audio?.index && current.quality == next.quality && current.convertedAudio == next.convertedAudio && burned(current) == burned(next)
}
public enum SubtitleShow: Sendable {
  case off, screen(SubtitleTrack, String), inFile(SubtitleTrack, Int), burned(SubtitleTrack)
}
public func streamIndex(_ track: SubtitleTrack) -> Int? {
  guard track.source == SubtitleSource.embedded, track.id.hasPrefix("stream-") else { return nil }
  return Int(track.id.dropFirst(7))
}
public func subtitleShow(_ plan: PlaybackStart) -> SubtitleShow {
  guard let track = plan.subtitle else { return .off }
  switch plan.subtitleMode {
  case PlaybackSubtitleMode.burn_in: return .burned(track)
  case PlaybackSubtitleMode.player: return streamIndex(track).map { .inFile(track, $0) } ?? .off
  case PlaybackSubtitleMode.client:
    return track.delivery == SubtitleDelivery.webvtt ? plan.subtitleUrl.map { .screen(track, $0) } ?? .off : .off
  default: return .off
  }
}
