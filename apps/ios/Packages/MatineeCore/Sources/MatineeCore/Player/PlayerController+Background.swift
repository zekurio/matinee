import AVFoundation
import Foundation

// What runs beside playback, in `PlayerController.kt`'s order from
// `loadCues` to `release`: subtitles and trickplay loading, the tick, the
// reports, the system's controls, and closing.

/// How long AVPlayer may wait for data, wanting to play, before the source
/// counts as failed. ExoPlayer fails a stalled source by its own timeouts;
/// AVPlayer waits for ever, so the controller notices instead.
let stallLimit: TimeInterval = 20

extension PlayerController {
  func loadCues(_ track: SubtitleTrack, url: String) async {
    cuesFor = track.id
    do {
      let address = local?.saved[track.id] ?? URL(string: resolve(url))
      if let address, try await engine.loadSubtitle(url: address, headers: await headers()) { return }
      let text: String
      if let saved = local?.saved[track.id] {
        text = try String(contentsOf: saved, encoding: .utf8)
      } else {
        guard let address = URL(string: resolve(url)) else { throw URLError(.badURL) }
        var request = URLRequest(url: address)
        for (key, value) in await headers() { request.setValue(value, forHTTPHeaderField: key) }
        let (body, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
        else { throw URLError(.badServerResponse) }
        text = String(decoding: body, as: UTF8.self)
      }
      let parsed = await Task.detached { CueTrack.parse(text) }.value
      if cuesFor == track.id { cues = parsed }
    } catch {
      diagnostics.note(.subtitleLoadFailed)
      if cuesFor == track.id { subtitleError = true }
    }
  }

  func loadTrickplay(_ itemId: String) {
    trickTask?.cancel()
    trickTask = Task { [weak self, api] in
      do {
        for try await status in api.trickplayUntilSettled(itemId) {
          if case .ready(let ready) = status { self?.trickplay = ready.images }
        }
      } catch {
        // The seek bar does without previews.
      }
    }
  }

  func beginTick() {
    ticking?.cancel()
    ticking = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled, let self else { return }
        await self.tick()
      }
    }
  }

  /// Follows the position for the view and counts the time spent playing.
  /// AVPlayer has no listener for most of what ExoPlayer calls back with,
  /// so its errors, its end, and its video size are read here too.
  func tick() async {
    guard !stopped else { return }
    let now = clock()
    let elapsed = now.timeIntervalSince(lastTick)
    lastTick = now
    let wasPlaying = playing
    playing = engine.isPlaying
    loading = engine.isLoading
    if playing { playedSeconds += max(0, elapsed) * Double(rate) }
    guard let current = source else { return }
    let clock = engine.positionSeconds
    // Only a source the engine has and plays tells where it is: one still
    // loading, or failed before it sought to its start, is at 0, which
    // isn't where the viewer is, and a fallback would ask from there.
    if sourceLoaded, !sourceFailed, engine.failure == nil, clock.isFinite {
      position = pendingAt ?? (current.offset + clock)
    }
    if let seconds = engine.bufferedSeconds, seconds.isFinite {
      buffered = current.offset + seconds
    }
    let size = engine.videoSize
    if size.width > 0 && size.height > 0 { videoAspect = size.width / size.height }
    if !sourceFailed, let failure = engine.failure {
      await sourceFailed(failure)
      return
    }
    // An HLS item gets its tracks only after it loads, where ExoPlayer calls
    // `onTracksChanged` again; the report takes them once they're there.
    if sourceLoaded, diagnostics.tracks.isEmpty, engine.isReady { await recordTracks() }
    let nowMs = Int64(ProcessInfo.processInfo.systemUptime * 1000)
    let shown = surfaceShown || pictureInPictureActive
    if shown, engine.hasVideoFrame() {
      freeze.frame(atMs: nowMs)
      if diagnostics.firstFrameSeconds == nil {
        diagnostics.firstFrameSeconds = max(0, now.timeIntervalSince(startedAt))
      }
    }
    if !sourceFailed, freeze.check(nowMs: nowMs, playing: playing, shown: shown && size.height > 0)
    {
      await frozen()
      return
    }
    // Only a source that keeps the player waiting counts, not a call on its way.
    if !sourceFailed, wantPlay, engine.isLoading, inFlight == nil, pendingAt == nil {
      let since = stalledSince ?? now
      stalledSince = since
      if now.timeIntervalSince(since) > stallLimit {
        stalledSince = nil
        await sourceFailed(URLError(.timedOut))
        return
      }
    } else {
      stalledSince = nil
    }
    let wasEnded = ended
    ended = duration > 0 && position >= duration - 0.3 && !playing
    if ended && !wasEnded { sendReport() }
    countDown(now)
    followSegment(now)
    let every: TimeInterval = playing ? 10 : 30
    if wasPlaying != playing || now.timeIntervalSince(lastReport) >= every { sendReport() }
    diagnostics.mpvStatistics = engine.mpvStatistics
    if let player { diagnostics.sample(player) }
    nowPlaying?.update()
  }

  /// Tell the server where the viewer is; on play, pause, seek, close, and every so often.
  public func report(closed: Bool = false) async {
    await sendReport(closed: closed)?.value
  }

  /// Sends the report without waiting for it, as Kotlin launches it. A
  /// report that doesn't reach the server waits with the downloads.
  @discardableResult func sendReport(closed: Bool = false) -> Task<Void, Never>? {
    guard source != nil, let itemId else { return nil }
    lastReport = clock()
    let at = max(0, now())
    let length = item?.durationSeconds ?? (duration > 0 ? duration : nil)
    let played = max(0, playedSeconds)
    let paused = !engine.isPlaying
    let sessionId = sessionId
    let started = startedAt
    let ended = clock()
    let offline = offline
    let task = Task { [api, downloads] in
      do {
        if offline { throw URLError(.notConnectedToInternet) }
        try await api.playback.report(
          itemId: itemId, positionSeconds: at,
          durationSeconds: length.flatMap { $0 > 0 ? $0 : nil },
          sessionId: sessionId, playedSeconds: played, paused: paused, closed: closed ? true : nil)
        await downloads?.reported(itemId: itemId, sessionId: sessionId)
      } catch {
        // Offline, as when watching a download, or in offline mode: send it
        // once the server answers, and the sitting so far, for watch time,
        // under this session's id.
        let stamp = ISO8601DateFormatter()
        stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        await downloads?.queueReport(
          itemId: itemId, report: PendingReport(positionSeconds: at, durationSeconds: length),
          play: played > 0
            ? PlaybackOfflineInput.Play(
              sessionId: sessionId, itemId: itemId, startedAt: stamp.string(from: started),
              endedAt: stamp.string(from: ended), playedSeconds: played, positionSeconds: at,
              durationSeconds: length) : nil)
      }
    }
    reporting = task
    return task
  }

  /// What the system's controls show: the episode and its show, or the movie, and its year.
  func metadata(_ item: MediaItem) -> (title: String, subtitle: String?) {
    let label = item.label
    let title = label.title ?? item.fileTitle
    if item.title?.kind == TitleKind.show {
      let parts = [label.showName, label.code].compactMap { $0 }.filter { !$0.isEmpty }
      return (title, parts.isEmpty ? nil : parts.joined(separator: " · "))
    }
    return (title, label.year)
  }

  func enableNowPlaying(_ shown: (title: String, subtitle: String?)) {
    enableNowPlaying(title: shown.title, subtitle: shown.subtitle)
  }

  /// Puts the sitting on the lock screen and in Control Center, as Kotlin's
  /// media session does. The view may call it again with its localized label.
  public func enableNowPlaying(title: String, subtitle: String? = nil) {
    nowPlaying?.stop()
    nowPlaying = PlayerNowPlaying(controller: self, title: title, subtitle: subtitle)
    if let picture = item?.episode?.still ?? item?.title?.images.backdrop
      ?? item?.title?.images.poster,
      let url = URL(string: api.paths.artwork(picture.id))
    {
      nowPlaying?.loadArtwork(url)
    }
  }

  /// What the report says is picked: the audio, and the subtitle that shows and who draws it.
  func selectionDiagnostics() -> SelectionDiagnostics {
    let show = shown()
    return .of(audio: audio, subtitle: show.track, rendering: show.rendering)
  }

  func recordSelection() { diagnostics.select(selectionDiagnostics()) }

  /// Closes the sitting, as Kotlin's `release`: the last report says it
  /// closed, and the system's controls go.
  public func stop() async {
    guard !stopped else { return }
    stopped = true
    asks += 1
    loads += 1
    askTask?.cancel()
    cancelSeek()
    ticking?.cancel()
    ticking = nil
    trickTask?.cancel()
    trickTask = nil
    nextTask?.cancel()
    nextTask = nil
    picking?.cancel()
    engine.pause()
    playing = false
    diagnostics.close()
    await report(closed: true)
    nowPlaying?.stop()
    nowPlaying = nil
    engine.clear()
  }
}
