import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/player.dart';

const _codec = wire.PlayerApi.pigeonChannelCodec;
const _host = 'dev.flutter.pigeon.matinee.PlayerApi';
const _events = 'dev.flutter.pigeon.matinee.PlayerEventsApi.onEvent';

/// The native side, as far as the Dart half can tell: it records each call
/// by name and answers with success.
class _Native {
  _Native(this.messenger);

  final TestDefaultBinaryMessenger messenger;
  final List<(String, List<Object?>)> calls = [];

  void install() {
    for (final name in [
      'open',
      'play',
      'pause',
      'seekTo',
      'setRate',
      'selectAudioTrack',
      'selectSubtitleTrack',
      'setSourceTracks',
      'setSubtitleUrl',
      'setVideoFit',
      'setViewport',
      'dispose',
    ]) {
      messenger.setMockMessageHandler('$_host.$name', (message) async {
        calls.add((name, _codec.decodeMessage(message)! as List<Object?>));
        return _codec.encodeMessage(<Object?>[null]);
      });
    }
  }

  List<List<Object?>> named(String name) => [
    for (final (call, args) in calls)
      if (call == name) args,
  ];

  int get lastSession => named('open').last[0]! as int;

  Future<void> emit(int session, wire.PlaybackEventMessage event) async {
    await messenger.handlePlatformMessage(
      '$_events.$session',
      _codec.encodeMessage(<Object?>[event]),
      (_) {},
    );
  }
}

void main() {
  late _Native native;

  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    native = _Native(binding.defaultBinaryMessenger)..install();
  });

  test(
    'mpv receives loopback URLs and no credentials for video or sidecars',
    () async {
      final player = Player();
      addTearDown(player.dispose);
      await player.open(
        'https://media.example/video?signature=test',
        headers: const {'Authorization': 'Bearer test'},
        tracks: const SourceTracks(
          subtitleUrl: 'https://media.example/sub.sup?signature=test',
        ),
      );
      final request = native.named('open').single[1]! as wire.OpenMessage;
      expect(request.headers, isEmpty);
      final video = Uri.parse(request.url);
      final subtitle = Uri.parse(request.tracks!.subtitleUrl!);
      expect(video.host, '127.0.0.1');
      expect(subtitle.origin, video.origin);
      expect(video.hasQuery || subtitle.hasQuery, isFalse);
    },
  );

  test(
    'a command reaches the native side only once a source is open',
    () async {
      final player = Player();
      await player.seekTo(const Duration(seconds: 12));
      expect(native.calls, isEmpty);

      await player.open('https://example.test/a.mkv');
      await player.seekTo(const Duration(seconds: 12));
      expect(native.named('seekTo').single, [native.lastSession, 12000]);
      await player.dispose();
    },
  );

  test('a new open drops what the old source still sends', () async {
    final player = Player();
    await player.open('https://example.test/a.mkv');
    final first = native.lastSession;
    await player.open('https://example.test/b.mkv');
    final second = native.lastSession;
    expect(second, isNot(first));

    await native.emit(
      first,
      wire.StateMessage(phase: wire.PhaseMessage.ready, playing: true),
    );
    await Future<void>.delayed(Duration.zero);
    expect(player.state.phase, PlaybackPhase.buffering);

    await native.emit(
      second,
      wire.StateMessage(phase: wire.PhaseMessage.ready, playing: true),
    );
    await Future<void>.delayed(Duration.zero);
    expect(player.state.phase, PlaybackPhase.ready);
    await player.dispose();
  });

  test(
    'dispose tells the native side once and ends the state stream',
    () async {
      final player = Player();
      await player.open('https://example.test/a.mkv');
      final session = native.lastSession;

      final done = player.states.drain<void>();
      await player.dispose();
      await player.dispose();
      await done;

      expect(native.named('dispose'), [
        [session],
      ]);
      expect(player.state.phase, PlaybackPhase.idle);
      await expectLater(
        player.open('https://example.test/a.mkv'),
        throwsStateError,
      );
    },
  );
}
