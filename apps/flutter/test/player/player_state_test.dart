import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/player_events.dart';
import 'package:matinee/player/player_state.dart';
import 'package:matinee/player/player_system.dart';

PlaybackState _state({
  PlaybackPhase phase = PlaybackPhase.ready,
  bool playing = true,
}) => PlaybackState(
  status: (phase: phase, playing: playing, wantsPlay: playing, message: null),
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
          wire.StateMessage(
            phase: message,
            playing: true,
            wantsPlay: true,
            message: 'why',
          ),
        );
        expect(event, isA<StatusChanged>());
        expect((event as StatusChanged).status, (
          phase: phase,
          playing: true,
          // The viewer's wish holds while it buffers or plays; at the end,
          // or failed or closed, play means something else.
          wantsPlay:
              phase == PlaybackPhase.buffering || phase == PlaybackPhase.ready,
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
  });

  group('reducePlayback', () {
    test('each event replaces only its own part', () {
      final before = _state();
      final status = reducePlayback(
        before,
        const StatusChanged((
          phase: PlaybackPhase.buffering,
          playing: false,
          wantsPlay: false,
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
          wantsPlay: false,
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
          wantsPlay: false,
          message: 'Media3 playback failed (ERROR_CODE_IO_UNSPECIFIED).',
        )),
      );
      expect(failed.status.message, contains('Media3'));
      expect(failed.video, isNotNull);
      expect(failed.isOpen, isFalse);
    });
  });

  test('the system hears of a change, not of every tick', () {
    MediaStateMessage at(int ms, {bool playing = true}) => mediaState(
      playing: playing,
      phase: PlaybackPhase.ready,
      position: ms / 1000,
      duration: 600,
      rate: 1,
    );
    expect(mediaStateMoved(null, at(0), Duration.zero), isTrue);
    // Playing on as the system works it out.
    expect(
      mediaStateMoved(at(0), at(5000), const Duration(seconds: 5)),
      isFalse,
    );
    // A seek.
    expect(
      mediaStateMoved(at(0), at(60000), const Duration(seconds: 5)),
      isTrue,
    );
    expect(
      mediaStateMoved(at(0), at(0, playing: false), Duration.zero),
      isTrue,
    );
    // Paused, the position stays where it was.
    expect(
      mediaStateMoved(
        at(1000, playing: false),
        at(1000, playing: false),
        const Duration(minutes: 1),
      ),
      isFalse,
    );
  });
}
