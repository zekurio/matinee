import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/download_settings.dart';
import 'package:matinee/downloads/download_tracks.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/downloads/pending_progress.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../media/fixtures.dart';
import 'fake_downloads.dart';

AudioTrack _audio(
  int index, {
  String? language,
  String codec = 'aac',
  int channels = 2,
  bool primary = false,
  String label = 'Audio',
}) => AudioTrack(
  index: index,
  label: label,
  language: language,
  title: null,
  codec: codec,
  format: codec.toUpperCase(),
  channels: channels,
  layout: null,
  primary: primary,
);

SubtitleTrack _subtitle(
  String id, {
  String? language,
  bool forced = false,
  bool sdh = false,
  bool isDefault = false,
  String delivery = SubtitleDelivery.webvtt,
  String format = 'SRT',
  String source = SubtitleSource.embedded,
}) => SubtitleTrack(
  id: id,
  label: id,
  language: language,
  title: null,
  forced: forced,
  sdh: sdh,
  defaultValue: isDefault,
  source: source,
  format: format,
  delivery: delivery,
);

PlaybackPreferences _prefs(String mode, {String? language}) =>
    PlaybackPreferences(
      audioLanguage: null,
      subtitleMode: mode,
      subtitleLanguage: language,
      rememberSubtitles: false,
    );

const _server = 'https://media.example.com/';

void main() {
  group('downloadAudio', () {
    test('picks the language asked for, by the most channels', () {
      final tracks = [
        _audio(1, language: 'en', primary: true),
        _audio(2, language: 'de'),
        _audio(3, language: 'de', channels: 6),
        _audio(4, language: 'de', channels: 8, label: 'Commentary'),
      ];
      final picked = downloadAudio(tracks, 'de', null, decodes: (_) => true);
      expect(picked?.index, 3);
    });

    test('original means the title language', () {
      final tracks = [
        _audio(1, language: 'en', primary: true),
        _audio(2, language: 'ja'),
      ];
      final picked = downloadAudio(
        tracks,
        originalLanguage,
        'ja',
        decodes: (_) => true,
      );
      expect(picked?.index, 2);
    });

    test('stands in a track this device decodes', () {
      final tracks = [
        _audio(1, language: 'en', codec: 'truehd', channels: 8, primary: true),
        _audio(2, language: 'en', codec: 'ac3', channels: 6),
      ];
      final picked = downloadAudio(
        tracks,
        null,
        null,
        decodes: (codec) => codec != 'truehd',
      );
      expect(picked?.index, 2);
    });
  });

  group('downloadSubtitle', () {
    final tracks = [
      _subtitle('stream-3', language: 'en', isDefault: true),
      _subtitle('stream-4', language: 'en', forced: true),
      _subtitle('stream-5', language: 'de'),
      _subtitle('stream-6', language: 'de', delivery: SubtitleDelivery.pgs),
    ];

    test('off is off', () {
      expect(
        downloadSubtitle(
          tracks,
          'en',
          _prefs(SubtitleMode.off),
          deviceLanguage: 'en',
        ),
        isNull,
      );
    });

    test('always picks the language, drawable only', () {
      final picked = downloadSubtitle(
        tracks,
        'en',
        _prefs(SubtitleMode.always, language: 'de'),
        deviceLanguage: 'en',
      );
      expect(picked?.id, 'stream-5');
    });

    test('foreign shows only for audio in another language', () {
      expect(
        downloadSubtitle(
          tracks,
          'en',
          _prefs(SubtitleMode.foreign, language: 'en'),
          deviceLanguage: 'en',
        )?.id,
        'stream-4',
      );
      expect(
        downloadSubtitle(
          tracks,
          'ja',
          _prefs(SubtitleMode.foreign, language: 'de'),
          deviceLanguage: 'en',
        )?.id,
        'stream-5',
      );
    });

    test('default takes the forced track, then the default flag', () {
      expect(
        downloadSubtitle(
          tracks,
          'en',
          _prefs(SubtitleMode.defaultValue),
          deviceLanguage: 'en',
        )?.id,
        'stream-4',
      );
      final unforced = [
        _subtitle('a', language: 'en', isDefault: true),
        _subtitle('b', language: 'de', isDefault: true),
      ];
      expect(
        downloadSubtitle(
          unforced,
          'ja',
          _prefs(SubtitleMode.defaultValue),
          deviceLanguage: 'en',
        ),
        isNull,
      );
    });
  });

  group('downloadSubtitleShow', () {
    test('a picture track in the file is drawn by the engine', () {
      final pgs = _subtitle('stream-6', delivery: SubtitleDelivery.pgs);
      final show = downloadSubtitleShow(pgs, mpv: false, inFile: true);
      expect(show, isA<SubtitleInFile>());
      expect((show as SubtitleInFile).stream, 6);
      expect(
        downloadSubtitleShow(pgs, mpv: false, inFile: false),
        isA<SubtitleOff>(),
      );
    });

    test('mpv draws styled tracks, the screen the rest', () {
      final ass = _subtitle('stream-2', format: 'ASS');
      expect(
        downloadSubtitleShow(ass, mpv: true, inFile: true),
        isA<SubtitleInFile>(),
      );
      expect(
        downloadSubtitleShow(ass, mpv: false, inFile: true),
        isA<SubtitleOnScreen>(),
      );
      expect(
        downloadSubtitleShow(null, mpv: true, inFile: true),
        isA<SubtitleOff>(),
      );
    });
  });

  group('OfflineItem', () {
    test('reads the platform entry and the meta Dart kept', () {
      final entry = downloadEntry(
        itemJson('e1', season: 1, episode: 2),
        server: _server,
        state: wire.DownloadStateMessage.running,
        bytes: 250,
        subtitles: [
          _subtitle('s1', language: 'en'),
          _subtitle('s2'),
        ],
      );
      final item = OfflineItem.of(
        wire.DownloadEntryMessage(
          id: entry.id,
          server: entry.server,
          kind: entry.kind,
          file: entry.file,
          name: entry.name,
          meta: entry.meta,
          state: entry.state,
          bytes: entry.bytes,
          segment: 0,
          // Only the first came so far.
          subtitles: entry.subtitles.take(1).toList(),
          addedAt: 0,
          totalBytes: 1000,
        ),
      )!;
      expect(item.item.id, 'e1');
      expect(item.progress, 0.25);
      expect(item.moving, isTrue);
      expect(item.done, isFalse);
      expect(item.subtitles.map((s) => s.file), ['e1/subtitles/0.vtt']);
    });

    test("meta that can't be read hides the entry", () {
      final entry = downloadEntry(itemJson('e1'), server: _server);
      expect(
        OfflineItem.of(
          wire.DownloadEntryMessage(
            id: entry.id,
            server: entry.server,
            kind: entry.kind,
            file: entry.file,
            name: entry.name,
            meta: '{"item": 3}',
            state: entry.state,
            bytes: 0,
            segment: 0,
            subtitles: const [],
            addedAt: 0,
          ),
        ),
        isNull,
      );
    });
  });

  group('Downloads', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    ProviderContainer container(
      FakeDownloadsPlatform platform,
      http.Client client,
    ) {
      final container = ProviderContainer(
        overrides: [
          downloadsPlatformProvider.overrideWithValue(platform),
          apiProvider.overrideWithValue(
            MatineeApi(
              base: Uri.parse('https://media.example.com'),
              client: client,
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('shows only the downloads of the server in use', () async {
      final platform = FakeDownloadsPlatform([
        downloadEntry(itemJson('a'), server: _server),
        downloadEntry(itemJson('b'), server: 'https://other.example.com/'),
      ]);
      final c = container(
        platform,
        MockClient((_) async => http.Response('', 500)),
      );
      c.listen(downloadsProvider, (_, _) {});
      await pumpEventQueue();
      expect(c.read(shownDownloadsProvider).keys, ['a']);
      expect(c.read(finishedDownloadProvider('a')), isNotNull);
      platform.put(
        downloadEntry(
          itemJson('c'),
          server: _server,
          state: wire.DownloadStateMessage.running,
        ),
      );
      await pumpEventQueue();
      expect(c.read(shownDownloadsProvider).keys, unorderedEquals(['a', 'c']));
      expect(c.read(finishedDownloadProvider('c')), isNull);
    });

    test('forgetting a server sends what waited, then lets go', () async {
      final sent = <String>[];
      final platform = FakeDownloadsPlatform([
        downloadEntry(itemJson('a'), server: _server),
      ]);
      final c = container(
        platform,
        MockClient((request) async {
          sent.add('${request.method} ${request.url.path}');
          return http.Response('', 204);
        }),
      );
      c.listen(downloadsProvider, (_, _) {});
      final pending = c.read(pendingProgressProvider.notifier);
      await pending.put(_server, 'a', const PendingReport(30, 60));
      await pumpEventQueue();
      await c
          .read(downloadsProvider.notifier)
          .forgetServer(_server, c.read(apiProvider));
      expect(sent, ['POST /api/v1/media/a/progress']);
      expect(platform.calls, contains('forget $_server'));
      expect(
        c.read(pendingProgressProvider.notifier).of(_server).isEmpty,
        isTrue,
      );
    });

    test('the wishes follow the settings', () {
      const settings = DownloadSettings(
        unmeteredOnly: true,
        defaultVersion: DefaultVersion.original,
        subtitles: DownloadSubtitles.all,
        videoCodec: 'hevc',
      );
      final wishes = Downloads.wishes(settings, audio: [2]);
      expect(wishes.codec, 'hevc');
      expect(wishes.audio, 'selected');
      expect(wishes.audioIndices, [2]);
      expect(wishes.subtitles, 'all');
      expect(
        Downloads.wishes(
          const DownloadSettings(
            unmeteredOnly: true,
            defaultVersion: DefaultVersion.original,
            subtitles: DownloadSubtitles.used,
            videoCodec: automaticCodec,
          ),
        ).codec,
        isNull,
      );
    });
  });

  group('PendingProgress', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    PlaybackOfflineInputPlay play(String session) => PlaybackOfflineInputPlay(
      sessionId: session,
      itemId: 'a',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:10:00.000Z',
      playedSeconds: 600,
      positionSeconds: 600,
    );

    test('keeps what waited across runs', () async {
      final first = ProviderContainer();
      await first
          .read(pendingProgressProvider.notifier)
          .put(_server, 'a', const PendingReport(12, 100));
      await first
          .read(pendingProgressProvider.notifier)
          .putPlay(_server, play('s1'));
      await pumpEventQueue();
      first.dispose();
      final second = ProviderContainer();
      addTearDown(second.dispose);
      final pending = second.read(pendingProgressProvider.notifier);
      await pending.ready;
      expect(pending.report(_server, 'a')?.positionSeconds, 12);
      expect(pending.of(_server).plays.keys, ['s1']);
      expect(pending.of('other/').isEmpty, isTrue);
    });

    test('flush sends the plays first and keeps what failed', () async {
      final sent = <String>[];
      var down = false;
      final api = MatineeApi(
        base: Uri.parse('https://media.example.com'),
        client: MockClient((request) async {
          sent.add('${request.method} ${request.url.path}');
          if (down) return http.Response('', 503);
          if (request.url.path.endsWith('/b/progress')) {
            return http.Response(
              jsonEncode({'message': 'gone'}),
              404,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('', 204);
        }),
      );
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final pending = c.read(pendingProgressProvider.notifier);
      await pending.putPlay(_server, play('s1'));
      await pending.put(_server, 'a', const PendingReport(10, 20));
      await pending.put(_server, 'b', const PendingReport(10, 20));
      down = true;
      await pending.flush(_server, api);
      expect(sent, ['POST /api/v1/playback/offline']);
      expect(pending.of(_server).plays, hasLength(1));
      down = false;
      sent.clear();
      await pending.flush(_server, api);
      expect(sent, [
        'POST /api/v1/playback/offline',
        'POST /api/v1/media/a/progress',
        'POST /api/v1/media/b/progress',
      ]);
      // b's file is gone from the server, so it doesn't wait either.
      expect(pending.of(_server).isEmpty, isTrue);
    });
  });
}
