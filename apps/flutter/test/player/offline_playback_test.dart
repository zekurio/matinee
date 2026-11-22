import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/player/offline_session.dart';
import 'package:matinee/player/player.dart';

import 'playback_fakes.dart';

const _pgs = SubtitleTrack(
  id: 'stream-5',
  label: 'English (PGS)',
  language: 'en',
  title: null,
  forced: false,
  sdh: false,
  defaultValue: false,
  source: SubtitleSource.embedded,
  format: 'PGS',
  delivery: SubtitleDelivery.pgs,
);

OfflinePlaybackSession _session(
  FakePlayer player, {
  DownloadKind kind = DownloadKind.original,
  AudioTrack? audio = audioTwo,
  SubtitleTrack? subtitle,
  List<OfflineReport>? reports,
  Duration Function()? elapsed,
}) => OfflinePlaybackSession(
  item: item(itemId),
  path: '/data/offline/$itemId/video.mkv',
  kind: kind,
  audioTracks: const [audioOne, audioTwo],
  subtitles: const [
    SavedSubtitle(captions, '/data/offline/subtitles/0.vtt'),
    SavedSubtitle(_pgs, '/data/offline/subtitles/1.vtt'),
  ],
  player: player,
  mpv: true,
  audio: audio,
  subtitle: subtitle,
  startAt: 30,
  onReport: (report) => reports?.add(report),
  readText: (path) async =>
      'WEBVTT\n\n00:00:31.000 --> 00:00:35.000\nAhoy from $path',
  elapsed: elapsed,
);

void main() {
  group('a download playing', () {
    test('opens the file as it is with its own streams', () async {
      final player = FakePlayer();
      final session = _session(player, subtitle: _pgs);
      await session.start();
      final opened = player.opens.single;
      expect(opened.url, 'file:///data/offline/$itemId/video.mkv');
      expect(opened.position, const Duration(seconds: 30));
      expect(opened.headers, isEmpty);
      expect(opened.tracks?.audioIndex, 4);
      expect(opened.tracks?.audioOrdinal, 1);
      // A picture track in the file is the engine's to draw.
      expect(opened.tracks?.subtitleIndex, 5);
      expect(session.captions, isNull);
      await session.close();
    });

    test("a version for this device numbers its audio in the mp4's "
        'order', () async {
      final player = FakePlayer();
      final session = _session(player, kind: DownloadKind.device);
      await session.start();
      final opened = player.opens.single;
      expect(opened.tracks?.audioIndex, 2);
      expect(opened.tracks?.audioOrdinal, 1);
      expect(opened.tracks?.subtitleIndex, isNull);
      await session.close();
    });

    test('draws a text subtitle from the saved WebVTT', () async {
      final player = FakePlayer();
      final session = _session(player, subtitle: captions);
      await session.start();
      await pumpEventQueue();
      final cues = session.captions!.at(32);
      expect(
        cues.single.toPlainText(),
        'Ahoy from /data/offline/subtitles/0.vtt',
      );
      await session.pickSubtitle(null);
      expect(session.captions, isNull);
      await session.pickAudio(audioOne);
      expect(player.trackChanges.last.audioIndex, 1);
      await session.close();
    });

    test('reports on pause, on close, and the time played', () async {
      var clock = Duration.zero;
      final reports = <OfflineReport>[];
      final player = FakePlayer();
      final session = _session(player, reports: reports, elapsed: () => clock);
      await session.start();
      clock = const Duration(seconds: 20);
      player.emit(PlaybackPhase.ready, 50, playing: true);
      await session.togglePlay();
      await pumpEventQueue();
      expect(reports.last.paused, isTrue);
      expect(reports.last.position, 50);
      expect(reports.last.played, 20);
      await session.close();
      expect(reports.last.closed, isTrue);
      expect(player.disposed, isTrue);
    });
  });
}
