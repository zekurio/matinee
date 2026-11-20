import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/player/playback_session.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/web_vtt.dart';

import 'playback_fakes.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

void main() {
  late FakePlaybackApi backend;
  late FakePlayer player;
  late PlaybackSession session;
  late Duration elapsed;

  setUp(() {
    backend = FakePlaybackApi();
    player = FakePlayer();
    elapsed = Duration.zero;
    session = backend.session(player, elapsed: () => elapsed);
  });

  tearDown(() async {
    await session.close();
    session.dispose();
  });

  test(
    'uses server resume, options, tracks, and signed media headers',
    () async {
      backend.start = (_) => FakePlaybackApi.answer(plan(start: 54.25));
      await session.start();
      final input = backend.starts.single;
      expect(input.itemId, itemId);
      expect(input.sessionId, sittingId);
      expect(input.position, isNull);
      expect(input.audio, isNull);
      expect(input.subtitle, isNull);
      expect(input.quality, isNull);
      expect(input.device.language, 'de');
      final source = player.opens.single;
      expect(source.url, 'https://matinee.example/source/direct');
      expect(source.position, const Duration(milliseconds: 54250));
      expect(source.kind, PlayerSourceKind.file);
      expect(source.headers['Authorization'], 'Bearer test');
      expect(source.tracks?.audioIndex, audioOne.index);
      expect(session.skipBack, 5);
      expect(session.skipForward, 30);
      expect(session.qualities.map((preset) => preset.id), [quality.id]);
      await session.skip(30);
      expect(player.seeks, [const Duration(milliseconds: 84250)]);
      expect(backend.seeks, isEmpty);
    },
  );

  test(
    'seeks a copied stream through the server and uses its snapped offset',
    () async {
      backend.start = (_) => FakePlaybackApi.answer(
        plan(method: PlaybackMethod.remux, offset: 28),
      );
      await session.start();
      expect(session.position, 28);
      expect(player.opens.single.kind, PlayerSourceKind.mp4);
      expect(player.opens.single.tracks?.audioIndex, isNull);
      await session.seek(41);
      final input = backend.seeks.single;
      expect(input.sessionId, sittingId);
      expect(input.position, 41);
      expect(input.snap, PlaybackSnap.nearest);
      expect(input.audio, audioOne.index);
      expect(input.audioCodecs, session.device.streamAudio);
      expect(player.seeks, isEmpty);
      expect(player.opens.last.url, 'https://matinee.example/seeked');
      expect(player.opens.last.position, Duration.zero);
      expect(session.position, 39);
      player.emit(PlaybackPhase.ready, 3, playing: true);
      await flush();
      expect(session.position, 42);
    },
  );

  test(
    'seeks HLS locally and asks for a new plan for a non-HLS encode',
    () async {
      var hls = true;
      backend.start = (input) => FakePlaybackApi.answer(
        plan(
          method: PlaybackMethod.transcode,
          start: input.position ?? 0,
          hls: hls,
        ),
      );
      await session.start();
      expect(player.opens.single.kind, PlayerSourceKind.hls);
      await session.seek(12);
      expect(player.seeks.single, const Duration(seconds: 12));
      hls = false;
      await session.retry();
      expect(player.opens.last.kind, PlayerSourceKind.mp4);
      await session.seek(40);
      expect(backend.seeks, isEmpty);
      expect(backend.starts.last.position, 40);
      expect(backend.starts.last.snap, PlaybackSnap.nearest);
    },
  );

  test(
    'sends user track picks and applies only the tracks the server answers',
    () async {
      backend.start = (input) => FakePlaybackApi.answer(
        plan(audio: input.audio == audioTwo.index ? audioTwo : audioOne),
      );
      await session.start();
      await session.pickAudio(audioTwo);
      expect(backend.starts.last.audio, audioTwo.index);
      expect(backend.picks.single.audio, audioTwo.index);
      expect(player.trackChanges.single.audioIndex, audioTwo.index);
      expect(player.trackChanges.single.audioOrdinal, 1);
      expect(player.opens.length, 1);
    },
  );

  test(
    'a stale local seek acknowledgement cannot overwrite a newer seek',
    () async {
      final player = _DelayedSeekPlayer();
      final session = backend.session(player);
      addTearDown(session.dispose);
      await session.start();
      final first = session.seek(20);
      final second = session.seek(80);
      player.pending.last.complete();
      await second;
      player.pending.first.complete();
      await first;
      expect(session.position, 80);
      await session.close();
      expect(backend.reports.last.positionSeconds, 80);
    },
  );

  test('a restricted stream seek closes the current source', () async {
    backend.start = (_) =>
        FakePlaybackApi.answer(plan(method: PlaybackMethod.remux));
    backend.seek = (_) => FakePlaybackApi.reject(403, playbackRestricted);
    await session.start();
    await session.seek(60);
    expect(session.refused, isTrue);
    expect(player.disposed, isTrue);
    expect(backend.reports.last.closed, isTrue);
  });

  test('replay keeps playing after a remux seek opens a new source', () async {
    backend.start = (_) =>
        FakePlaybackApi.answer(plan(method: PlaybackMethod.remux));
    await session.start();
    player.emit(PlaybackPhase.ended, 120);
    await flush();
    await session.togglePlay();
    expect(player.state.status.playing, isTrue);
    expect(player.pauses, 0);
  });

  test('WebVTT stays on the file clock across a seek', () async {
    backend.start = (_) => FakePlaybackApi.answer(
      plan(
        method: PlaybackMethod.remux,
        offset: 28,
        subtitle: captions,
        subtitleMode: PlaybackSubtitleMode.client,
        subtitleUrl: '/caption',
      ),
    );
    await session.start();
    await flush();
    expect(session.captions?.at(session.position), isEmpty);
    await session.seek(41);
    player.emit(PlaybackPhase.ready, 3, playing: true);
    await flush();
    expect(
      session.captions?.at(session.position).single.toPlainText(),
      'Ahoy!',
    );
    expect(backend.subtitleRequests.length, 1);
    expect(player.opens.last.tracks?.subtitleOffset, 39);
    expect(player.opens.last.tracks?.subtitleUrl, isNull);
  });

  test('passes embedded IDs and PGS sidecars to the engine', () async {
    final picture = SubtitleTrack.fromJson({
      ...captions.toJson(),
      'delivery': SubtitleDelivery.pgs,
    });
    var embedded = true;
    backend.start = (_) => FakePlaybackApi.answer(
      plan(
        subtitle: picture,
        subtitleMode: embedded
            ? PlaybackSubtitleMode.player
            : PlaybackSubtitleMode.client,
        subtitleUrl: embedded ? null : '/bitmap',
      ),
    );
    await session.start();
    expect(player.opens.single.tracks?.subtitleIndex, 6);
    embedded = false;
    await session.retry();
    expect(player.opens.last.tracks?.subtitleIndex, isNull);
    expect(
      player.opens.last.tracks?.subtitleUrl,
      'https://matinee.example/bitmap',
    );
    expect(backend.subtitleRequests, isEmpty);
  });

  test(
    'only excludes methods that actually failed and stops when exhausted',
    () async {
      backend.start = (input) => switch (input.failed!.length) {
        0 => FakePlaybackApi.answer(plan(start: 15)),
        1 => FakePlaybackApi.answer(
          plan(method: PlaybackMethod.remux, offset: 20),
        ),
        2 => FakePlaybackApi.answer(
          plan(method: PlaybackMethod.transcode, hls: true),
        ),
        _ => FakePlaybackApi.reject(422, playbackUnplayable),
      };
      await session.start();
      player.emit(PlaybackPhase.error, 22);
      await flush();
      expect(backend.starts.last.position, 22);
      expect(backend.starts.last.failed, [PlaybackMethod.direct]);
      player.emit(PlaybackPhase.error, 8);
      await flush();
      expect(backend.starts.last.position, 28);
      expect(backend.starts.last.failed, [
        PlaybackMethod.direct,
        PlaybackMethod.remux,
      ]);
      player.emit(PlaybackPhase.error, 28);
      await flush();
      expect(backend.starts.last.failed, PlaybackMethod.all);
      expect(session.error, isA<ApiException>());
      await session.retry();
      expect(backend.starts.last.failed, isEmpty);
      expect(player.opens.last.kind, PlayerSourceKind.file);
    },
  );

  test(
    'keeps method on a network error and stops on an account refusal',
    () async {
      await session.start();
      player.emit(PlaybackPhase.error, 13, serverUnavailable: true);
      await flush();
      expect(backend.starts.length, 1);
      expect(session.error, isA<PlaybackServerUnavailable>());
      backend.start = (_) =>
          FakePlaybackApi.reject(429, playbackBusy, data: {'playing': 2});
      await session.retry();
      expect(backend.starts.last.failed, isEmpty);
      expect(session.refused, isTrue);
      await session.retry();
      expect(backend.starts.length, 2);
    },
  );

  test('switches off a failed burned-in subtitle for the sitting', () async {
    final picture = SubtitleTrack.fromJson({
      ...captions.toJson(),
      'delivery': SubtitleDelivery.pgs,
    });
    backend.start = (input) {
      if (input.subtitle?.trackId == picture.id && input.failed!.isEmpty) {
        return FakePlaybackApi.answer(
          plan(
            method: PlaybackMethod.transcode,
            hls: true,
            subtitle: picture,
            subtitleMode: PlaybackSubtitleMode.burnIn,
          ),
        );
      }
      return FakePlaybackApi.answer(plan());
    };
    await session.start();
    await session.pickSubtitle(picture);
    expect(player.opens.last.kind, PlayerSourceKind.hls);
    expect(player.opens.last.tracks?.subtitleUrl, isNull);
    expect(player.opens.last.tracks?.subtitleIndex, isNull);
    player.emit(PlaybackPhase.error, 8);
    await flush();
    expect(backend.starts.last.failed, [PlaybackMethod.transcode]);
    expect(session.notice?.$1, PlaybackNotice.burnInFailed);
    await session.pickAudio(audioTwo);
    expect(backend.starts.last.subtitle?.toJson(), {'trackId': null});
  });

  test(
    'keeps the current source and its selection when a switch fails',
    () async {
      backend.start = (input) => input.audio == audioTwo.index
          ? FakePlaybackApi.reject(422, playbackUnplayable)
          : FakePlaybackApi.answer(plan());
      await session.start();
      await session.pickAudio(audioTwo);
      expect(session.plan?.audio?.index, audioOne.index);
      expect(session.notice?.$1, PlaybackNotice.switchFailed);
      expect(player.trackChanges, isEmpty);
      await session.pickQuality(quality.id);
      expect(backend.starts.last.audio, isNull);
      expect(backend.starts.last.quality, quality.id);
    },
  );

  test(
    'reports play, seek, pause and close in order with cumulative time',
    () async {
      final sending = Completer<http.Response>();
      backend.pendingReport = (_) {
        if (backend.reports.length == 1) return sending.future;
        return Future.value(http.Response('', 204));
      };
      await session.start();
      await flush();
      expect(backend.reports.single.paused, isFalse);
      elapsed = const Duration(seconds: 5);
      await session.seek(43);
      await session.togglePlay();
      await flush();
      final closed = session.close();
      await flush();
      expect(backend.reports.single.closed, isNull);
      sending.complete(http.Response('', 204));
      await closed;
      final finalReport = backend.reports.last;
      expect(finalReport.sessionId, sittingId);
      expect(finalReport.positionSeconds, 43);
      expect(finalReport.playedSeconds, 5);
      expect(finalReport.paused, isTrue);
      expect(finalReport.closed, isTrue);
      expect(player.disposed, isTrue);
    },
  );

  test('ignores a start answer after leaving', () async {
    final answer = Completer<http.Response>();
    backend.pendingStart = (_) => answer.future;
    final opening = session.start();
    await flush();
    await session.close();
    answer.complete(FakePlaybackApi.answer(plan()));
    await opening;
    expect(player.opens, isEmpty);
    expect(backend.reports, isEmpty);
  });

  test('reports where an ended source stopped on the file timeline', () async {
    await session.start();
    player.emit(PlaybackPhase.ended, 19);
    await flush();
    expect(backend.reports.last.positionSeconds, 19);
    expect(backend.reports.last.durationSeconds, 120);
    expect(backend.reports.last.paused, isTrue);
  });

  testWidgets('reports every 10 seconds playing and every 30 seconds paused', (
    tester,
  ) async {
    final clock = tester.binding.clock;
    final started = clock.now();
    final playback = backend.session(
      FakePlayer(),
      elapsed: () => clock.now().difference(started),
    );
    await playback.start();
    await tester.pump();
    expect(backend.reports, hasLength(1));
    await tester.pump(const Duration(seconds: 9));
    expect(backend.reports, hasLength(1));
    await tester.pump(const Duration(seconds: 1));
    expect(backend.reports.last.playedSeconds, closeTo(10, .01));
    expect(backend.reports, hasLength(2));
    await playback.togglePlay();
    await tester.pump();
    expect(backend.reports, hasLength(3));
    expect(backend.reports.last.paused, isTrue);
    await tester.pump(const Duration(seconds: 29));
    expect(backend.reports, hasLength(3));
    await tester.pump(const Duration(seconds: 1));
    expect(backend.reports, hasLength(4));
    expect(backend.reports.last.playedSeconds, closeTo(10, .01));
    await playback.close();
    playback.dispose();
  });

  test(
    'does not send native authorization to a URL on another origin',
    () async {
      backend.start = (_) =>
          FakePlaybackApi.answer(plan(url: 'https://elsewhere.example/video'));
      await session.start();
      expect(player.opens, isEmpty);
      expect(session.error, isA<FormatException>());
    },
  );

  test('reports actual rectangular Media3 limits and mpv software support', () {
    final codecs = wire.CodecCapabilitiesMessage(
      video: [
        wire.VideoDecoderMessage(
          codec: 'hevc',
          widest: wire.FrameSizeMessage(width: 4096, height: 2304),
          tallest: wire.FrameSizeMessage(width: 2304, height: 4096),
          tenBit: true,
        ),
      ],
      audio: ['aac'],
      dolbyVision: false,
    );
    final media3 = playbackDevice(PlayerEngine.media3, codecs, 'de');
    expect(
      media3.video.map((decoder) => (decoder.maxWidth, decoder.maxHeight)),
      [(4096, 2304), (2304, 4096)],
    );
    expect(media3.video.first.maxBitDepth, 10);
    expect(media3.video.first.dolbyVisionProfiles, isNot(contains(5)));
    expect(media3.audio, ['aac', 'pcm_*']);
    expect(media3.encodeVideo, ['hevc']);
    expect(media3.sidecarSubtitles, isEmpty);
    final mpv = playbackDevice(PlayerEngine.mpv, codecs, 'en');
    expect(mpv.audio, ['*']);
    expect(mpv.video.single.codec, '*');
    expect(mpv.sidecarSubtitles, [PlaybackSubtitleDelivery.pgs]);
  });

  test('reads overlapping WebVTT cues, markup, and entities', () {
    final cues = WebVtt.parse(
      'WEBVTT\r\n\r\n1\r\n00:01.100 --> 00:02.200 align:left\r\n'
      '<b>One &amp; only</b>\r\n\r\n00:02.000 --> 00:04.000\r\nTwo',
    );
    expect(cues.at(1.09), isEmpty);
    final overlap = cues.at(2.1);
    expect(overlap.map((cue) => cue.toPlainText()), ['One & only', 'Two']);
    expect(cues.at(2.2).single.toPlainText(), 'Two');
    expect(cues.at(4), isEmpty);
  });
}

class _DelayedSeekPlayer extends FakePlayer {
  final pending = <Completer<void>>[];

  @override
  Future<void> seekTo(Duration position) {
    final ack = Completer<void>();
    pending.add(ack);
    return ack.future;
  }
}
