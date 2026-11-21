import '../platform/player.g.dart' as wire;
import 'player_state.dart';

sealed class PlayerEvent {
  const PlayerEvent();

  factory PlayerEvent.fromMessage(wire.PlaybackEventMessage message) =>
      switch (message) {
        wire.StateMessage() => _status(message),
        wire.TimelineMessage() => TimelineChanged((
          position: Duration(milliseconds: message.positionMs),
          duration: _duration(message.durationMs),
          buffered: _duration(message.bufferedMs),
        )),
        wire.TracksMessage() => TracksChanged((
          audio: List.unmodifiable(message.audio.map(_track)),
          subtitles: List.unmodifiable(message.subtitles.map(_track)),
        )),
        wire.VideoMessage() => VideoChanged((
          width: message.width,
          height: message.height,
          frameRate: message.frameRate,
        )),
        wire.DiagnosticsMessage() => Diagnosed(message),
        wire.ActiveEngineMessage() => EngineChanged(switch (message.engine) {
          wire.EngineMessage.mpv => PlayerEngine.mpv,
          wire.EngineMessage.media3 => PlayerEngine.media3,
        }),
      };
}

class StatusChanged extends PlayerEvent {
  const StatusChanged(this.status, {this.serverUnavailable = false});

  final PlaybackStatus status;
  final bool serverUnavailable;
}

class TimelineChanged extends PlayerEvent {
  const TimelineChanged(this.timeline);

  final PlaybackTimeline timeline;
}

class TracksChanged extends PlayerEvent {
  const TracksChanged(this.tracks);

  final PlaybackTracks tracks;
}

class VideoChanged extends PlayerEvent {
  const VideoChanged(this.video);

  final VideoInfo video;
}

class EngineChanged extends PlayerEvent {
  const EngineChanged(this.engine);

  final PlayerEngine engine;
}

/// What the engine says for the playback report, which leaves the state
/// as it is ([Player.diagnostics]).
class Diagnosed extends PlayerEvent {
  const Diagnosed(this.message);

  final wire.DiagnosticsMessage message;
}

/// Applies one native event to the state. A new idle status clears
/// everything, since nothing from the old source applies to what comes next.
PlaybackState reducePlayback(PlaybackState current, PlayerEvent event) =>
    switch (event) {
      StatusChanged(:final status) when status.phase == PlaybackPhase.idle =>
        PlaybackState(status: status),
      StatusChanged(:final status, :final serverUnavailable) =>
        current.copyWith(status: status, serverUnavailable: serverUnavailable),
      TimelineChanged(:final timeline) => current.copyWith(timeline: timeline),
      TracksChanged(:final tracks) => current.copyWith(tracks: tracks),
      VideoChanged(:final video) => current.copyWith(video: video),
      EngineChanged(:final engine) => current.copyWith(engine: engine),
      Diagnosed() => current,
    };

Duration? _duration(int? ms) => ms == null ? null : Duration(milliseconds: ms);

MediaTrack _track(wire.TrackMessage message) => (
  id: message.id,
  language: message.language,
  title: message.title,
  codec: message.codec,
  isDefault: message.isDefault,
  isForced: message.isForced,
  selected: message.selected,
);

StatusChanged _status(wire.StateMessage message) {
  final phase = switch (message.phase) {
    wire.PhaseMessage.idle => PlaybackPhase.idle,
    wire.PhaseMessage.buffering => PlaybackPhase.buffering,
    wire.PhaseMessage.ready => PlaybackPhase.ready,
    wire.PhaseMessage.ended => PlaybackPhase.ended,
    wire.PhaseMessage.error => PlaybackPhase.error,
  };
  return StatusChanged((
    phase: phase,
    playing: message.playing,
    // Both engines keep the viewer's wish past the end, where play means
    // from the start again, so it shows play there.
    wantsPlay:
        message.wantsPlay &&
        (phase == PlaybackPhase.buffering || phase == PlaybackPhase.ready),
    message: message.message,
  ), serverUnavailable: message.serverUnavailable);
}
