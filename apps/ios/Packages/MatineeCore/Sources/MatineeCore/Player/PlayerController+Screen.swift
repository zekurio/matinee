import Foundation

// What Android's `PlayerScreen.kt` and `PlayerActivity.kt` keep themselves
// and the iOS view reads from the controller: the scrub, trickplay tiles,
// the countdown to the next episode, and the moments of the view's life.
// README.md, Lifecycle, maps each to Android's.

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

  /// Ten seconds after the file ends, the next one starts, unless cancelled
  /// or settings turned autoplay off, as Android's `rememberUpNext`.
  func countDown(_ now: Date) {
    guard ended, next != nil else {
      endedAt = nil
      nextCountdown = nil
      return
    }
    guard prefs.autoplayNext, !nextCancelled else { return }
    let since = endedAt ?? now
    endedAt = since
    nextCountdown = max(0, 10 - Int(now.timeIntervalSince(since)))
    if nextCountdown == 0 { playNext() }
  }

  public func cancelNext() {
    nextCancelled = true
    nextCountdown = nil
  }

  public func playNext() {
    guard let next else { return }
    nextCancelled = true
    nextCountdown = nil
    onNext?(next)
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
