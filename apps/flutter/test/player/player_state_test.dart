import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/player_events.dart';
import 'package:matinee/player/player_state.dart';

PlaybackState _state({
  PlaybackPhase phase = PlaybackPhase.ready,
  bool playing = true,
}) => PlaybackState(
  status: (phase: phase, playing: playing, message: null),
  timeline: (
    position: const Duration(seconds: 5),
    duration: const Duration(seconds: 60),
    buffered: const Duration(seconds: 20),
  ),
  tracks: (
    audio: [
      (
        id: '1',
        language: 'eng',
        title: null,
        codec: 'aac',
        isDefault: true,
        isForced: false,
        selected: true,
      ),
    ],
    subtitles: const [],
  ),
  video: (width: 1920, height: 1080, frameRate: 23.976),
  engine: PlayerEngine.mpv,
);

void main() {
  group('PlayerEvent.fromMessage', () {
    test('maps every phase', () {
      for (final (message, phase) in [
        (wire.PhaseMessage.idle, PlaybackPhase.idle),
        (wire.PhaseMessage.buffering, PlaybackPhase.buffering),
        (wire.PhaseMessage.ready, PlaybackPhase.ready),
        (wire.PhaseMessage.ended, PlaybackPhase.ended),
        (wire.PhaseMessage.error, PlaybackPhase.error),
      ]) {
        final event = PlayerEvent.fromMessage(
          wire.StateMessage(phase: message, playing: true, message: 'why'),
        );
        expect(event, isA<StatusChanged>());
        expect((event as StatusChanged).status, (
          phase: phase,
          playing: true,
          message: 'why',
        ));
      }
    });

    test('turns milliseconds into durations and keeps unknowns null', () {
      final known = PlayerEvent.fromMessage(
        wire.TimelineMessage(
          positionMs: 1500,
          durationMs: 60000,
          bufferedMs: 9000,
        ),
      );
      expect((known as TimelineChanged).timeline, (
        position: const Duration(milliseconds: 1500),
        duration: const Duration(minutes: 1),
        buffered: const Duration(seconds: 9),
      ));

      final live = PlayerEvent.fromMessage(wire.TimelineMessage(positionMs: 0));
      expect((live as TimelineChanged).timeline, (
        position: Duration.zero,
        duration: null,
        buffered: null,
      ));
    });

    test('carries track ids, flags, and optional names', () {
      final event = PlayerEvent.fromMessage(
        wire.TracksMessage(
          audio: [
            wire.TrackMessage(
              id: '2',
              language: 'jpn',
              title: 'Japanese Audio',
              codec: 'aac',
              isDefault: false,
              isForced: false,
              selected: true,
            ),
          ],
          subtitles: [
            wire.TrackMessage(
              id: '1',
              isDefault: true,
              isForced: true,
              selected: false,
            ),
          ],
        ),
      );
      final tracks = (event as TracksChanged).tracks;
      expect(tracks.audio.single, (
        id: '2',
        language: 'jpn',
        title: 'Japanese Audio',
        codec: 'aac',
        isDefault: false,
        isForced: false,
        selected: true,
      ));
      expect(tracks.subtitles.single.language, isNull);
      expect(tracks.subtitles.single.isForced, isTrue);
    });

    test('maps video size, frame rate, and engine', () {
      final video = PlayerEvent.fromMessage(
        wire.VideoMessage(width: 3840, height: 2160, frameRate: 59.94),
      );
      expect((video as VideoChanged).video, (
        width: 3840,
        height: 2160,
        frameRate: 59.94,
      ));
      expect(
        (PlayerEvent.fromMessage(
          wire.ActiveEngineMessage(engine: wire.EngineMessage.media3),
        ) as EngineChanged).engine,
        PlayerEngine.media3,
      );
    });
  });

  group('reducePlayback', () {
    test('each event replaces only its own part', () {
      final before = _state();
      final status = reducePlayback(
        before,
        const StatusChanged((
          phase: PlaybackPhase.buffering,
          playing: false,
          message: null,
        )),
      );
      expect(status.phase, PlaybackPhase.buffering);
      expect(status.timeline, before.timeline);
      expect(status.tracks, before.tracks);
      expect(status.video, before.video);
      expect(status.engine, PlayerEngine.mpv);

      final timeline = reducePlayback(
        before,
        const TimelineChanged((
          position: Duration(seconds: 9),
          duration: null,
          buffered: null,
        )),
      );
      expect(timeline.timeline.position, const Duration(seconds: 9));
      expect(timeline.timeline.duration, isNull);
      expect(timeline.status, before.status);

      expect(
        reducePlayback(before, const EngineChanged(PlayerEngine.media3)).engine,
        PlayerEngine.media3,
      );
    });

    test('idle forgets the old source', () {
      final idle = reducePlayback(
        _state(),
        const StatusChanged((
          phase: PlaybackPhase.idle,
          playing: false,
          message: null,
        )),
      );
      expect(idle.phase, PlaybackPhase.idle);
      expect(idle.timeline.position, Duration.zero);
      expect(idle.tracks.audio, isEmpty);
      expect(idle.video, isNull);
      expect(idle.engine, isNull);
    });

    test('an error keeps the last picture facts and carries its message', () {
      final failed = reducePlayback(
        _state(),
        const StatusChanged((
          phase: PlaybackPhase.error,
          playing: false,
          message: 'Media3 playback failed (ERROR_CODE_IO_UNSPECIFIED).',
        )),
      );
      expect(failed.status.message, contains('Media3'));
      expect(failed.video, isNotNull);
      expect(failed.isOpen, isFalse);
    });
  });

  group('PlaybackState.isOpen', () {
    test('is false only when idle or failed', () {
      for (final phase in PlaybackPhase.values) {
        expect(
          _state(phase: phase).isOpen,
          phase != PlaybackPhase.idle && phase != PlaybackPhase.error,
          reason: phase.name,
        );
      }
    });
  });

  group('seekTarget', () {
    const timeline = (
      position: Duration(seconds: 30),
      duration: Duration(seconds: 60),
      buffered: null,
    );

    test('moves by the step', () {
      expect(
        seekTarget(timeline, const Duration(seconds: 10)),
        const Duration(seconds: 40),
      );
      expect(
        seekTarget(timeline, const Duration(seconds: -10)),
        const Duration(seconds: 20),
      );
    });

    test('stops at the start and at the end', () {
      expect(seekTarget(timeline, const Duration(seconds: -45)), Duration.zero);
      expect(
        seekTarget(timeline, const Duration(seconds: 45)),
        const Duration(seconds: 60),
      );
    });

    test('has no end to stop at while the length is unknown', () {
      expect(
        seekTarget((
          position: const Duration(seconds: 30),
          duration: null,
          buffered: null,
        ), const Duration(seconds: 10)),
        const Duration(seconds: 40),
      );
    });
  });
}
