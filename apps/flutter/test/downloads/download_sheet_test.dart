import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/actions.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:matinee/screens/downloads/download_files_sheet.dart';
import 'package:matinee/screens/downloads/download_sheet.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'downloads_backend.dart';
import 'fake_downloads.dart';

const _server = 'https://media.example.com/';

final _movie = MediaItem.fromJson(
  itemJson(
    'm1',
    title: titleJson('m1', name: 'Arrival'),
    episodeTitle: 'Arrival',
  ),
);

final _show = titleJson('s1', kind: 'show', name: 'The Expanse');

List<Map<String, Object?>> _episodes() => [
  for (var episode = 1; episode <= 3; episode++)
    itemJson('e$episode', title: _show, season: 1, episode: episode),
];

/// The toasts asked for, without showing them.
final class _Toasts extends ToastState {
  final shown = <String>[];

  @override
  Future<ToastResult> show(
    String message, {
    String? description,
    ToastKind kind = ToastKind.message,
    String? actionLabel,
    String? closeLabel,
    ToastDuration? duration,
  }) {
    shown.add(message);
    return Completer<ToastResult>().future;
  }
}

/// A screen with one button that opens [open].
Future<(FakeDownloadsPlatform, DownloadsBackend)> _pump(
  WidgetTester tester,
  Future<void> Function(BuildContext context) open, {
  DownloadsBackend? backend,
  List<wire.DownloadEntryMessage> entries = const [],
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
  ToastState? toasts,
}) async {
  final platform = FakeDownloadsPlatform(entries);
  final server = backend ?? DownloadsBackend();
  server.answers['/api/v1/downloads/resolve'] ??= resolver(
    unavailableAt: {480},
  );
  await pumpScreen(
    tester,
    Builder(
      builder: (context) => Center(
        child: MatineeButton(
          onPressed: () => unawaited(open(context)),
          child: const Text('Open'),
        ),
      ),
    ),
    client: server.client,
    size: size,
    colors: colors,
    overrides: [
      downloadsPlatformProvider.overrideWithValue(platform),
      if (toasts != null) toastProvider.overrideWithValue(toasts),
    ],
  );
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
  return (platform, server);
}

void main() {
  setUpAll(loadFont);

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  group('the download sheet', () {
    testWidgets('offers the versions the server can make, with sizes', (
      tester,
    ) async {
      await _pump(tester, (context) => showDownloadSheet(context, _movie));
      expect(find.text('Download Arrival'), findsOneWidget);
      expect(find.text('Full quality'), findsOneWidget);
      // The file's own video stays as it is.
      expect(find.text('HEVC, unchanged'), findsOneWidget);
      expect(find.text('About 1.2 GB · 1080p HEVC'), findsOneWidget);
      expect(find.text('English'), findsNWidgets(2));
      expect(find.text('Deutsch'), findsNWidgets(2));

      await tester.tap(find.text('Quality'));
      await tester.pumpAndSettle();
      expect(find.text('1080p, 8 Mbps'), findsOneWidget);
      expect(find.text('720p, 4 Mbps'), findsOneWidget);
      // The server can't make this one for the file.
      expect(find.text('480p, 1.5 Mbps'), findsNothing);
      await tester.tap(find.text('720p, 4 Mbps'));
      await tester.pumpAndSettle();
      expect(find.text('About 820 MB · 720p H.264'), findsOneWidget);
    });

    testWidgets('starts a version for this device with what was picked', (
      tester,
    ) async {
      final (platform, _) = await _pump(
        tester,
        (context) => showDownloadSheet(context, _movie),
      );
      // German audio as well, and no subtitles.
      await tester.tap(find.text('Deutsch').first);
      await tester.pumpAndSettle();
      expect(find.text('About 1.3 GB · 1080p HEVC'), findsOneWidget);
      await tester.tap(find.text('English').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Download').last);
      await tester.pumpAndSettle();
      expect(find.text('Download Arrival'), findsNothing);
      final request = platform.requests.single;
      expect(request.kind, wire.DownloadKindMessage.device);
      expect(request.server, _server);
      expect(request.file, 'm1/video.mp4');
      expect(request.totalBytes, 1280000000);
      expect(request.subtitles, isEmpty);
      final meta = DownloadMeta.decode(request.meta)!;
      expect(meta.audio.map((track) => track.index), [1, 2]);
      expect(request.spec, contains('"subtitles":[]'));
    });

    testWidgets('without audio, says so and starts nothing', (tester) async {
      final (platform, _) = await _pump(
        tester,
        (context) => showDownloadSheet(context, _movie),
      );
      await tester.tap(find.text('English').first);
      await tester.pumpAndSettle();
      expect(find.text('Pick at least one audio track.'), findsOneWidget);
      await tester.tap(find.text('Download').last);
      await tester.pumpAndSettle();
      expect(platform.requests, isEmpty);
    });

    testWidgets('the original keeps every track', (tester) async {
      final (platform, _) = await _pump(
        tester,
        (context) => showDownloadSheet(context, _movie),
      );
      await tester.tap(find.text('Quality'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Original'));
      await tester.pumpAndSettle();
      expect(find.text('Audio tracks'), findsNothing);
      expect(find.text('1.0 B · MKV · May not play on this device'), findsOne);
      await tester.tap(find.text('Download').last);
      await tester.pumpAndSettle();
      final request = platform.requests.single;
      expect(request.kind, wire.DownloadKindMessage.original);
      expect(request.file, 'm1/video.mkv');
      expect(request.subtitles.map((s) => s.trackId), ['stream-3']);
      expect(
        request.subtitles.single.url,
        'https://media.example.com/api/media/m1/subtitles/stream-3',
      );
    });

    testWidgets("the server's refusal shows in its words", (tester) async {
      final backend = DownloadsBackend();
      backend.answers['/api/v1/downloads/resolve'] = (_) => [
        const DownloadResolutionUnavailable(
          id: 'm1',
          message: 'Transcoding is off',
        ).toJson(),
      ];
      await _pump(
        tester,
        (context) => showDownloadSheet(context, _movie),
        backend: backend,
      );
      expect(find.text("Couldn't get this file's tracks"), findsOneWidget);
      expect(find.text('Transcoding is off'), findsOneWidget);
    });

    for (final (name, size, colors) in [
      ('download_sheet_phone_dark', const Size(412, 915), matineeDark),
      ('download_sheet_tablet_light', const Size(1280, 800), matineeLight),
    ]) {
      testWidgets(name, (tester) async {
        await _pump(
          tester,
          (context) => showDownloadSheet(context, _movie),
          size: size,
          colors: colors,
        );
        await expectLater(
          find.byType(DownloadSheet),
          matchesGoldenFile('goldens/$name.png'),
        );
      });
    }
  });

  group('the files sheet', () {
    testWidgets('downloads the files not here yet', (tester) async {
      final backend = DownloadsBackend();
      final toasts = _Toasts();
      backend.answers['/api/v1/titles/s1/items'] = (_) => _episodes();
      final (platform, _) = await _pump(
        tester,
        (context) => showDownloadFilesSheet(
          context,
          FileSet(TitleSummary.fromJson(_show)),
        ),
        backend: backend,
        toasts: toasts,
        entries: [downloadEntry(_episodes().first, server: _server)],
      );
      expect(find.text('Download The Expanse'), findsOneWidget);
      expect(find.text('2 files · 1 already downloaded'), findsOneWidget);
      expect(find.text('About 2.4 GB'), findsOneWidget);
      await tester.tap(find.text('Download').last);
      await tester.pumpAndSettle();
      expect(platform.requests.map((request) => request.id), ['e2', 'e3']);
      expect(toasts.shown, ['Downloading 2 files']);
    });

    testWidgets('a preset asks the server again', (tester) async {
      final asked = <DownloadWishes>[];
      final backend = DownloadsBackend();
      backend.answers['/api/v1/titles/s1/items'] = (_) => _episodes();
      backend.answers['/api/v1/downloads/resolve'] = resolver(asked: asked);
      await _pump(
        tester,
        (context) => showDownloadFilesSheet(
          context,
          FileSet(TitleSummary.fromJson(_show)),
        ),
        backend: backend,
      );
      expect(find.text('3 files'), findsOneWidget);
      await tester.tap(find.text('Quality'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('720p, 4 Mbps'));
      await tester.pumpAndSettle();
      expect(asked.last.preset?.height, 720);
      expect(find.text('About 2.5 GB'), findsOneWidget);
    });
  });

  group('the menus', () {
    testWidgets("a file's menu downloads it", (tester) async {
      await _pump(
        tester,
        (context) => showActions(context, ItemActions(_movie)),
      );
      await tester.tap(find.text('Download'));
      await tester.pumpAndSettle();
      expect(find.text('Download Arrival'), findsOneWidget);
    });

    testWidgets("a file on the device can go, even if the account can't "
        'download', (tester) async {
      final (platform, _) = await _pump(
        tester,
        (context) => showActions(context, ItemActions(_movie)),
        backend: DownloadsBackend(downloads: false),
        entries: [downloadEntry(itemJson('m1'), server: _server)],
      );
      expect(find.text('Download'), findsNothing);
      await tester.tap(find.text('Remove download'));
      await tester.pumpAndSettle();
      expect(platform.calls, ['remove m1']);
    });

    testWidgets("a show's and a season's menus download all their files", (
      tester,
    ) async {
      final backend = DownloadsBackend();
      backend.answers['/api/v1/titles/s1/items'] = (_) => _episodes();
      final title = TitleSummary.fromJson(_show);
      await _pump(
        tester,
        (context) => showActions(context, TitleActions(title)),
        backend: backend,
      );
      await tester.tap(find.text('Download'));
      await tester.pumpAndSettle();
      expect(find.text('Download The Expanse'), findsOneWidget);
      expect(find.text('3 files'), findsOneWidget);
    });

    test('a menu on its own page holds the downloads', () {
      final here = ItemActions(_movie, here: true);
      expect(hasActions(here), isFalse);
      expect(hasActions(here, mayDownload: true), isTrue);
      expect(hasActions(here, stored: {'m1'}), isTrue);
    });
  });
}
