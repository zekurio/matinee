import Foundation

// The player's side of `playback.start`. The server picks the source, the
// audio, and the subtitle; the player keeps what the viewer picked and
// which methods failed, sends all of it with every call, and loads what
// comes back. Plain Swift, so the macOS tests run it.

public let ORIGINAL_QUALITY = PlaybackQuality.original
public let AUTOMATIC = "auto"

/// What the viewer picked in this sitting. What's left out, the server picks.
public struct Picks: Sendable, Equatable {
  public var audio: Int?
  public var subtitle: SubtitlePick?
  public var quality: String?
  public init(audio: Int? = nil, subtitle: SubtitlePick? = nil, quality: String? = nil) {
    self.audio = audio
    self.subtitle = subtitle
    self.quality = quality
  }
  /// These picks with `change` on top. Kotlin's `plus`.
  public func merging(_ change: Picks) -> Picks {
    Picks(
      audio: change.audio ?? audio, subtitle: change.subtitle ?? subtitle,
      quality: change.quality ?? quality)
  }
}

/// Something to tell the viewer about an answer.
public enum NoticeKind: Sendable { case burnInFailed, qualityFailed, switchFailed }

/// Why the server won't play the file for this account now: its access
/// rules out every way left, or it plays on as many devices as it may.
/// Asking again gets the same answer, so the player shows the server's
/// message and stops.
public enum Refusal: Sendable { case restricted, busy }

/// The refusal `error` is, or nil for any other failure.
public func refusal(_ error: any Error) -> Refusal? {
  switch (error as? ApiException)?.code {
  case PLAYBACK_RESTRICTED: .restricted
  case PLAYBACK_BUSY: .busy
  default: nil
  }
}

/// What every `playback.start` of a sitting carries again, since the server
/// keeps nothing between calls: the viewer's picks, and the methods that
/// didn't play, which the server never answers with.
public struct Asking: Sendable, Equatable {
  public var picks: Picks
  public private(set) var failed: [String]
  public init(picks: Picks = Picks(), failed: [String] = []) {
    self.picks = picks
    self.failed = failed
  }
  /// The picks with `change` on top. A pick that may take an encode, a
  /// quality or a subtitle in pictures, tries encodes again after one
  /// failed, since the viewer asked for it. `tracks` are the file's.
  public func pick(_ change: Picks, tracks: [SubtitleTrack]) -> Asking {
    let track = tracks.first { $0.id == change.subtitle?.trackId }
    let encodes =
      (change.quality != nil && change.quality != ORIGINAL_QUALITY)
      || (track != nil && track?.delivery != SubtitleDelivery.webvtt)
    return Asking(
      picks: picks.merging(change),
      failed: encodes ? failed.filter { $0 != PlaybackMethod.transcode } : failed)
  }
  /// With `method` among the failed, so the server falls back past it.
  public func fail(_ method: String) -> Asking {
    Asking(picks: picks, failed: failed.contains(method) ? failed : failed + [method])
  }
  /// Every method tried again, as a retry does.
  public func forgetFailures() -> Asking { Asking(picks: picks) }
  /// The call for `at` seconds into the file, or where the viewer stopped for nil.
  public func input(
    itemId: String, sessionId: String, device: PlaybackDevice, at: Double?,
    snap: String = PlaybackSnap.before
  ) -> PlaybackStartInput {
    PlaybackStartInput(
      itemId: itemId, sessionId: sessionId, device: device, audio: picks.audio,
      subtitle: picks.subtitle, quality: picks.quality, position: at.map { max(0, $0) }, snap: snap,
      failed: failed)
  }
  /// What an answer to a failure leaves of the picks. An encode that burned
  /// a subtitle in failed, and the server played on without it, so the
  /// subtitle is off. An encode at a picked quality failed, and the
  /// original plays, so that's the pick. A source that failed while it
  /// played the original, as when the picked quality is one the account
  /// may not use, lost nothing the viewer picked. `lost` is the answer
  /// whose source failed, nil for an answer to anything else.
  public func settle(lost: PlaybackStart?, plan: PlaybackStart) -> (Asking, NoticeKind?) {
    guard let lost else { return (self, nil) }
    var next = self
    if lost.subtitleMode == PlaybackSubtitleMode.burn_in
      && plan.subtitleMode != PlaybackSubtitleMode.burn_in
    {
      next.picks.subtitle = SubtitlePick(trackId: nil)
      return (next, .burnInFailed)
    }
    if let quality = picks.quality, quality != ORIGINAL_QUALITY, lost.quality != ORIGINAL_QUALITY,
      plan.quality == ORIGINAL_QUALITY
    {
      next.picks.quality = ORIGINAL_QUALITY
      return (next, .qualityFailed)
    }
    return (self, nil)
  }
}

/// What the report calls a source: the file, a copied stream, HLS, another
/// encode, or a download.
public enum SourceMode: String, Codable, Sendable { case direct, stream, hls, encode, local }

/// How the player reads a source: the file by what it finds in it, a stream as MP4, an encode as HLS.
public enum SourceKind: Sendable { case file, mp4, hls }

/// A seek within the source the player has, a new copied stream from `playback.seek`, or a new answer.
public enum SeekWay: Sendable { case inSource, newStream, newStart }

/// What the player loads: the source of an answer, a stream from
/// `playback.seek` in its place, or a download. `offset` is where in the
/// file its time 0 is, above 0 only for a stream that starts partway in.
/// `start` is where it begins playing, in its own time. Positions, the
/// seek bar, subtitles, and trickplay all count in the file's time, which
/// is the source's time plus `offset`.
public struct Source: Sendable, Equatable {
  /// The answer's method, or nil for a download.
  public var method: String?
  public var url: String
  public var hls: Bool
  public var offset: Double
  public var start: Double
  public init(method: String?, url: String, hls: Bool, offset: Double, start: Double) {
    self.method = method
    self.url = url
    self.hls = hls
    self.offset = offset
    self.start = start
  }
  public var mode: SourceMode {
    if method == nil { return .local }
    if method == PlaybackMethod.direct { return .direct }
    if hls { return .hls }
    return method == PlaybackMethod.remux ? .stream : .encode
  }
  public var kind: SourceKind {
    switch mode {
    case .direct, .local: .file
    case .hls: .hls
    case .stream, .encode: .mp4
    }
  }
  /// Where in the file it begins.
  public var position: Double { offset + start }
  /// Where the player starts it, in its own time.
  public var startMs: Int64 { Int64((start * 1000).rounded()) }
  /// The file and HLS seek by themselves. A copied stream starts over from
  /// `playback.seek`, another encode from `playback.start`.
  public var seeksItself: Bool { mode == .direct || mode == .local || mode == .hls }
  /// It is the file, with all its tracks, so the player picks the audio inside it.
  public var holdsTracks: Bool { mode == .direct || mode == .local }
  /// What a seek in it takes.
  public var seek: SeekWay {
    if seeksItself { return .inSource }
    return mode == .stream ? .newStream : .newStart
  }
  /// Seconds into the file at `ms` into this source.
  public func fileSeconds(ms: Int64) -> Double { offset + Double(ms) / 1000 }
  /// Where `seconds` into the file is in this source.
  public func sourceMs(seconds: Double) -> Int64 {
    Int64(max(0, ((seconds - offset) * 1000).rounded()))
  }
  /// An answer's source, its path made an address by `resolve`.
  public static func of(_ plan: PlaybackStart, resolve: (String) -> String) -> Source {
    Source(
      method: plan.method, url: resolve(plan.url), hls: plan.hls, offset: plan.offset,
      start: plan.start)
  }
  /// A download at `url`, from `at` seconds in.
  public static func local(url: String, at: Double) -> Source {
    Source(method: nil, url: url, hls: false, offset: 0, start: max(0, at))
  }
}

/// Whether `next` plays from what `current` loaded, so the player keeps it:
/// the file, whose audio the player picks inside it, or a stream of the
/// same audio, quality, and picture. Only where it starts differs, as after
/// a subtitle the player draws.
public func sameSource(_ current: PlaybackStart, _ next: PlaybackStart) -> Bool {
  guard current.method == next.method, current.hls == next.hls else { return false }
  if next.method == PlaybackMethod.direct { return true }
  return current.audio?.index == next.audio?.index && current.quality == next.quality
    && current.convertedAudio == next.convertedAudio && burnedIn(current) == burnedIn(next)
}

private func burnedIn(_ plan: PlaybackStart) -> String? {
  plan.subtitleMode == PlaybackSubtitleMode.burn_in ? plan.subtitle?.id : nil
}

/// Who draws the subtitle that shows, and from where.
public enum SubtitleShow: Sendable, Equatable {
  case off
  /// The player view draws WebVTT from the url, or from the file saved beside a download.
  case screen(SubtitleTrack, String)
  /// The engine draws a stream of the file it plays, by its index there.
  case inFile(SubtitleTrack, Int)
  /// mpv draws the PGS file at the url over the video. AVPlayer never gets
  /// one: the device doesn't claim PGS, so the server never answers with it.
  case overlay(SubtitleTrack, String)
  /// The server burned it into the picture.
  case burned(SubtitleTrack)

  public var track: SubtitleTrack? {
    switch self {
    case .off: nil
    case .screen(let track, _), .inFile(let track, _), .overlay(let track, _), .burned(let track):
      track
    }
  }

  /// Who draws it, for the diagnostics report.
  public var rendering: SubtitleRendering? {
    switch self {
    case .off: nil
    case .screen: .screen
    case .inFile, .overlay: .player
    case .burned: .burnIn
    }
  }
}

/// The index ffprobe gives a stream inside the file, from its track id, `stream-3`.
public func streamIndex(_ track: SubtitleTrack) -> Int? {
  guard track.source == SubtitleSource.embedded, track.id.hasPrefix("stream-") else { return nil }
  return Int(track.id.dropFirst("stream-".count))
}

/// How the subtitle of `plan` shows, by its `subtitleMode`: `client` is
/// WebVTT the view draws, or a PGS file mpv draws; `player` a stream of
/// the file the engine draws; `burn-in` part of the picture. `mpv` says
/// which engine plays; the iOS app has only AVPlayer so far.
public func subtitleShow(_ plan: PlaybackStart, mpv: Bool = false) -> SubtitleShow {
  guard let track = plan.subtitle else { return .off }
  switch plan.subtitleMode {
  case PlaybackSubtitleMode.burn_in: return .burned(track)
  case PlaybackSubtitleMode.player: return streamIndex(track).map { .inFile(track, $0) } ?? .off
  case PlaybackSubtitleMode.client:
    guard let url = plan.subtitleUrl else { return .off }
    if track.delivery == SubtitleDelivery.webvtt { return .screen(track, url) }
    if (track.delivery == SubtitleDelivery.pgs || track.delivery == "ass") && mpv { return .overlay(track, url) }
    return .off
  default: return .off
  }
}
