import Foundation

// The viewer's controls, in `PlayerController.kt`'s order from `togglePlay`
// to `pickSpeed`.

extension PlayerController {
  public func togglePlay() {
    if ended {
      Task {
        await seekTo(0)
        play()
      }
      return
    }
    if engine.isPlaying { pause() } else { play() }
  }

  /// Plays, as `player.play()` does from Android's screen and the system's controls.
  public func play() {
    wantPlay = true
    engine.play(atRate: rate)
  }

  public func pause() {
    wantPlay = false
    holding = false
    engine.pause()
  }

  public func seekTo(_ seconds: Double) async {
    guard let current = source else { return }
    let target = seekClamp(seconds, duration: max(duration - 1, 0))
    ended = false
    stalledSince = nil
    if let asked = inFlight {
      // An answer on its way would start where the viewer was, so ask again.
      seekOnAnswer = target
      pendingAt = target
      var change = asked.ask
      change.at = target
      change.snap = PlaybackSnap.nearest
      sendReport()
      await request(change, undo: asked.undo)
      return
    }
    switch current.seek {
    case .inSource:
      position = target
      sendReport()
      await engine.seek(Double(current.sourceMs(seconds: target)) / 1000)
      return
    case .newStream:
      pendingAt = target
      sendReport()
      await seekStream(current, target)
    case .newStart:
      pendingAt = target
      sendReport()
      // Kotlin asks without `reload` here, so an encode that isn't HLS would
      // keep its old stream: `sameSource` ignores where a stream starts.
      // Both apps ask for HLS, so it doesn't happen; this loads the answer.
      await ask(Ask(at: target, reason: nil, snap: PlaybackSnap.nearest, reload: true))
    }
  }

  /// A copied stream can't seek, so a new one starts from the keyframe nearest `target`.
  func seekStream(_ current: Source, _ target: Double) async {
    guard let playing = plan, let itemId else { return }
    cancelSeek()
    pendingAt = target
    position = target
    let request = seeks
    let input = PlaybackSeekInput(
      itemId: itemId, sessionId: sessionId, audio: playing.audio?.index ?? 0, position: target,
      snap: PlaybackSnap.nearest, audioCodecs: device.streamAudio)
    let task = Task { [api] () -> Result<PlaybackSeek, any Error> in
      do { return .success(try await api.playback.seek(playbackSeekInput: input)) } catch {
        return .failure(error)
      }
    }
    seekTask = task
    let result = await task.value
    guard request == seeks, !stopped else { return }
    seekTask = nil
    switch result {
    case .failure(let error):
      pendingAt = nil
      diagnostics.note(.seekFailed)
      notice = Notice(.switchFailed, detail: error.localizedDescription)
    case .success(let answer):
      var next = current
      next.url = resolve(answer.url)
      next.offset = answer.offset
      next.start = 0
      await load(next, reason: nil)
    }
  }

  public func skip(_ seconds: Double) async { await seekTo(now() + seconds) }

  /// Plays another audio track, which the server remembers for the next time.
  public func pickAudio(_ track: AudioTrack) async {
    if track == audio { return }
    audio = track
    if local != nil {
      // A download holds only its own tracks, so it picks among them whatever plays.
      await selectAudioInFile()
      await recordTracks()
      recordSelection()
      return
    }
    guard let itemId else { return }
    sendPick { [api] in try await api.playback.pickTracks(itemId: itemId, audio: track.index) }
    await ask(Ask(at: now(), reason: .audioChange, picks: Picks(audio: track.index)))
  }

  /// Shows a subtitle track, or none for nil, which the server remembers for the next time.
  public func pickSubtitle(_ track: SubtitleTrack?) async {
    if track?.id == subtitle?.id { return }
    subtitle = track
    subtitleError = false
    if local != nil {
      localSubtitle = track
      await showSubtitle()
      recordSelection()
      return
    }
    guard let itemId else { return }
    let pick = SubtitlePick(trackId: track?.id)
    sendPick { [api] in try await api.playback.pickTracks(itemId: itemId, subtitle: pick) }
    await ask(Ask(at: now(), reason: .subtitleChange, picks: Picks(subtitle: pick)))
  }

  public func pickQuality(_ id: String) async {
    if id == quality || local != nil { return }
    quality = id
    await ask(Ask(at: now(), reason: .qualityChange, picks: Picks(quality: id)))
  }

  /// Tells the server the viewer's pick, as the web does. A pick that doesn't reach it is only for this sitting.
  func sendPick(_ send: @escaping @Sendable () async throws -> Void) {
    picking = Task {
      // The pick still plays now.
      try? await send()
    }
  }

  public func pickSpeed(_ rate: Float) {
    guard rate.isFinite, rate > 0 else { return }
    speed = rate
    holding = false
    // AVPlayer has no speed apart from its rate, so a paused player keeps
    // the speed for when it plays.
    if wantPlay { engine.play(atRate: rate) }
  }

  /// The rate the engine plays at: the picked speed, or `HOLD_SPEED` while a finger holds the video.
  var rate: Float { holding ? HOLD_SPEED : speed }

  /// Plays at `HOLD_SPEED` until `endHold`, if the video plays and slower
  /// than that. Says whether it did.
  @discardableResult public func startHold() -> Bool {
    guard !holding, playing, wantPlay, speed < HOLD_SPEED else { return false }
    holding = true
    engine.play(atRate: HOLD_SPEED)
    return true
  }

  /// Back to the picked speed after `startHold`.
  public func endHold() {
    guard holding else { return }
    holding = false
    // The finger may lift after the player closed, or paused it meanwhile.
    if !stopped, wantPlay { engine.play(atRate: speed) }
  }

  /// Skips the segment that plays now, as its button does: to its end.
  public func skipSegment() async {
    guard let segment else { return }
    await seekTo(segment.end)
  }
}
