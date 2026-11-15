import Foundation

// What Android's `PlayerScreen.kt` and `PlayerActivity.kt` keep themselves
// and the iOS view reads from the controller: the scrub, trickplay tiles,
// the countdown to the next episode, the skip button's timing, and the
// moments of the view's life. README.md, Lifecycle, maps each to Android's.

/// The last second of a segment, which has nothing left worth skipping.
let SEGMENT_END_SECONDS = 1.0

/// How long the skip button shows by itself once its segment starts.
let SKIP_SHOWN_SECONDS: TimeInterval = 8

/// How long the next episode waits after the end before it starts on its own.
let UP_NEXT_SECONDS = 10

/// The next episode as the player offers it.
public struct UpNextOffer: Sendable, Equatable {
  public let item: MediaItem
  /// Offered before the file ended, once the credits started.
  public let early: Bool
  /// The countdown stopped, or never ran, so it waits for Play.
  public internal(set) var cancelled: Bool
  /// Put away while the credits roll. It comes back once the file ends.
  public internal(set) var hidden = false
}

extension PlayerController {
  public func dismissNotice() { notice = nil }

  public func beginScrub() { scrubPosition = position }
  public func scrub(to seconds: Double) { scrubPosition = seekClamp(seconds, duration: duration) }
  public func endScrub(commit: Bool = true) async {
    let target = scrubPosition
    scrubPosition = nil
    if commit, let target { await seekTo(target) }
  }

  /// The trickplay tile and its crop for `seconds` into the file.
  public func trickplayFrame(at seconds: Double) -> TrickplayFrame? {
    guard let images = trickplay, let item, images.intervalSeconds > 0,
      images.count > 0, images.columns > 0, images.rows > 0
    else { return nil }
    let index = min(
      images.count - 1, max(0, Int(seekClamp(seconds, duration: duration) / images.intervalSeconds))
    )
    let perTile = images.columns * images.rows
    return TrickplayFrame(
      url: api.paths.trickplayTile(item.id, key: images.key, tile: index / perTile),
      x: index % images.columns * images.width, y: index % perTile / images.columns * images.height,
      width: images.width, height: images.height)
  }

  /// A request with the session's token for the server's own addresses only.
  /// Use for artwork and trickplay image loading as well as media requests.
  public func mediaRequest(url: URL) async -> URLRequest {
    var request = URLRequest(url: url)
    guard url.scheme == api.base.scheme, url.host == api.base.host, url.port == api.base.port else {
      return request
    }
    for (key, value) in await headers() { request.setValue(value, forHTTPHeaderField: key) }
    return request
  }

  /// The next episode while the player offers it, counting down to it and
  /// starting it unless cancelled, as Android's `rememberUpNext` and the
  /// web's `UpNextCard`. Offered early, once the credits start at the
  /// server's `upNextAt`, it counts the seconds left in the file and starts
  /// as the file ends; offered at the end, it starts ten seconds after.
  /// Settings turning autoplay off make it wait for Play. Moving back before
  /// where it's offered puts it away, and offering it again starts afresh.
  func countDown(_ now: Date) {
    guard offersNext, let next else {
      upNext = nil
      endedAt = nil
      nextCountdown = nil
      return
    }
    if upNext?.item.id != next.id {
      upNext = UpNextOffer(item: next, early: !ended, cancelled: !prefs.autoplayNext)
      endedAt = nil
    }
    guard let offer = upNext, !offer.cancelled else {
      nextCountdown = nil
      return
    }
    guard ended else {
      endedAt = nil
      nextCountdown = max(0, Int((duration - position).rounded(.up)))
      return
    }
    // The countdown ran while the credits rolled.
    if offer.early {
      nextCountdown = 0
      playNext()
      return
    }
    let since = endedAt ?? now
    endedAt = since
    nextCountdown = max(0, UP_NEXT_SECONDS - Int(now.timeIntervalSince(since)))
    if nextCountdown == 0 { playNext() }
  }

  /// Stops the countdown; the offer stays, waiting for Play.
  public func cancelNext() {
    upNext?.cancelled = true
    nextCountdown = nil
  }

  /// Puts the offer away while the credits roll, without a countdown. It
  /// comes back, waiting for Play, once the file ends.
  public func hideNext() {
    upNext?.cancelled = true
    upNext?.hidden = true
    nextCountdown = nil
  }

  /// Whether the next episode's card shows: while it's offered, unless hidden until the end.
  public var showsUpNext: Bool {
    guard let upNext, offersNext else { return false }
    return !upNext.hidden || ended
  }

  public func playNext() {
    guard let next else { return }
    upNext?.cancelled = true
    nextCountdown = nil
    onNext?(next)
  }

  /// The previous episode's button: plays it in place of this one.
  public func playPrevious() {
    guard let previous else { return }
    playInstead(previous)
  }

  /// Stops this sitting and plays `item` in its place, as the episode buttons do.
  public func playInstead(_ item: MediaItem) {
    upNext?.cancelled = true
    nextCountdown = nil
    onNext?(item)
  }

  /// Notes when the segment that plays changed, so its button shows by
  /// itself for `SKIP_SHOWN_SECONDS`, and with the controls after that, as
  /// Android's `rememberSkipSegment` and the web's `SkipSegment` do.
  func followSegment(_ now: Date) {
    let current = segment
    if current != shownSegment {
      shownSegment = current
      segmentSince = now
    }
    segmentFresh = current != nil && now.timeIntervalSince(segmentSince) < SKIP_SHOWN_SECONDS
  }

  /// The segment whose skip button shows now: fresh, or with the controls.
  public func skippable(controls: Bool) -> MediaSegment? {
    guard let segment, segmentFresh || controls else { return nil }
    return segment
  }

  /// The scene went to the background, Android's `ON_STOP`: nothing shows
  /// the video, and it pauses unless picture in picture shows it.
  public func sceneDidEnterBackground() {
    surfaceShown = false
    if !pictureInPictureActive { pause() }
  }

  /// The scene is active again and the view's layer shows the video.
  public func sceneDidBecomeActive() { surfaceShown = true }

  /// Picture in picture started or stopped, from AVKit's delegate.
  public func pictureInPictureChanged(_ active: Bool) { pictureInPictureActive = active }

  /// Another app or a call took the audio. ExoPlayer pauses for a transient
  /// loss of audio focus and plays again after; this does the same.
  public func audioInterruptionBegan() {
    resumeAfterInterruption = wantPlay
    pause()
  }

  /// The interruption ended; `shouldResume` is AVAudioSession's option to.
  public func audioInterruptionEnded(shouldResume: Bool) {
    if shouldResume && resumeAfterInterruption { play() }
    resumeAfterInterruption = false
  }
}
