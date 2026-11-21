import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/downloads/pending_progress.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;
import 'package:matinee/player/offline_playback_screen.dart';
import 'package:matinee/player/offline_session.dart';
import 'package:matinee/player/playback_report.dart';
import 'package:matinee/player/playback_screen.dart';
import 'package:matinee/player/player.dart';
import 'package:matinee/player/player_system.dart';
import 'package:matinee/player/seek_bar.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../downloads/fake_downloads.dart';
import '../media/fixtures.dart';
import '../media/harness.dart';
import 'playback_fakes.dart';

const _server = 'https://media.example.com/';

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

    test('has no buffered band, the whole file being here', () async {
      final player = FakePlayer();
      final session = _session(player);
      await session.start();
      player.emit(PlaybackPhase.ready, 50, playing: true, buffered: 90);
      await pumpEventQueue();
      expect(session.position, 50);
      expect(session.buffered, isNull);
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

  group('the offline player', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    Future<(ProviderContainer, List<FakePlayer>, List<String>)> pump(
      WidgetTester tester, {
      required AuthState auth,
      bool reachable = true,
      List<Override> extra = const [],
      List<wire.DownloadEntryMessage>? entries,
      String id = 'm1',
      ValueNotifier<String>? which,
      KitColors colors = matineeDark,
    }) async {
      final players = <FakePlayer>[];
      final sent = <String>[];
      final client = MockClient((request) async {
        sent.add('${request.method} ${request.url.path}');
        if (!reachable) throw http.ClientException('offline', request.url);
        if (request.url.path.endsWith('/items')) {
          return http.Response('[]', 200);
        }
        return http.Response('', 404);
      });
      final platform = FakeDownloadsPlatform(
        entries ??
            [
              downloadEntry(
                itemJson(
                  'm1',
                  title: titleJson('m1', name: 'Arrival'),
                  episodeTitle: 'Arrival',
                  position: 600,
                ),
                server: _server,
              ),
            ],
      );
      // Opened over a page, as from the downloads, so Back leaves it.
      final screen = Builder(
        builder: (context) => GestureDetector(
          onTap: () => unawaited(
            Navigator.of(context).push(
              PageRouteBuilder<void>(
                // A changing id is the router moving the page to another
                // file, which it keeps, as Next does.
                pageBuilder: (_, _, _) => which == null
                    ? PlayRoute(id: id)
                    : ValueListenableBuilder(
                        valueListenable: which,
                        builder: (context, id, _) => PlayRoute(id: id),
                      ),
              ),
            ),
          ),
          child: const Text('Open'),
        ),
      );
      await pumpScreen(
        tester,
        screen,
        client: client,
        size: const Size(850, 400),
        colors: colors,
        auth: auth,
        overrides: [
          downloadsPlatformProvider.overrideWithValue(platform),
          playbackPlayerFactoryProvider.overrideWithValue((engine, prefs) {
            final player = FakePlayer();
            players.add(player);
            return player;
          }),
          playbackFullscreenProvider.overrideWithValue((_, _) async {}),
          ...extra,
        ],
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(PlayRoute)),
      );
      return (container, players, sent);
    }

    final ada = User.fromJson(userJson('ada'));

    testWidgets('offline, plays the download and keeps where it got to', (
      tester,
    ) async {
      final (container, players, sent) = await pump(
        tester,
        auth: Offline(_server, ada),
      );
      // Waiting from an earlier sitting.
      final opened = players.single.opens.single;
      expect(opened.url, 'file:///data/offline/m1/video.mkv');
      expect(opened.position, const Duration(seconds: 600));
      expect(find.text('Arrival'), findsOneWidget);
      // No quality to pick from a download.
      expect(find.bySemanticsLabel('Quality'), findsNothing);
      players.single.emit(PlaybackPhase.ready, 700, playing: true);
      await tester.pump();
      await tester.tap(find.bySemanticsLabel('Back').first);
      await tester.pumpAndSettle();
      final pending = container.read(pendingProgressProvider.notifier);
      expect(pending.report(_server, 'm1')?.positionSeconds, 700);
      expect(sent, isEmpty);
    });

    testWidgets('offline, Previous and Next go to the downloads either side', (
      tester,
    ) async {
      final show = titleJson('s1', kind: 'show', name: 'The Expanse');
      wire.DownloadEntryMessage episode(int number) => downloadEntry(
        itemJson(
          'e$number',
          title: show,
          season: 1,
          episode: number,
          episodeTitle: 'Episode $number',
        ),
        server: _server,
      );
      final (_, players, sent) = await pump(
        tester,
        auth: Offline(_server, ada),
        entries: [episode(1), episode(2), episode(3)],
        id: 'e2',
      );
      players.single.emit(PlaybackPhase.ready, 60, playing: true);
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Previous episode'), findsOneWidget);
      expect(find.bySemanticsLabel('Next episode'), findsOneWidget);
      expect(sent, isEmpty);
      await tester.tap(find.bySemanticsLabel('Next episode'));
      await tester.pumpAndSettle();
      expect(find.text('/play/e3'), findsOneWidget);
    });

    testWidgets('the same page moved to another file plays that file', (
      tester,
    ) async {
      final show = titleJson('s1', kind: 'show', name: 'The Expanse');
      wire.DownloadEntryMessage episode(int number) => downloadEntry(
        itemJson('e$number', title: show, season: 1, episode: number),
        server: _server,
      );
      final which = ValueNotifier('e2');
      addTearDown(which.dispose);
      final (_, players, _) = await pump(
        tester,
        auth: Offline(_server, ada),
        entries: [episode(2), episode(3)],
        which: which,
      );
      expect(players.single.opens.single.url, contains('/e2/'));
      which.value = 'e3';
      await tester.pumpAndSettle();
      expect(players, hasLength(2));
      expect(players.first.disposed, isTrue);
      expect(players.last.opens.single.url, contains('/e3/'));
      await tester.tap(find.bySemanticsLabel('Back').first);
      await tester.pumpAndSettle();
    });

    testWidgets("plays in the theme's dark half, the server's accent on it", (
      tester,
    ) async {
      final rose = withThemeAccent(matineeDark, const Color(0xFFF43F5E));
      await pump(tester, auth: Offline(_server, ada), colors: rose);
      final seek = tester.element(find.byType(SeekBar));
      expect(MatineeTheme.of(seek).accent, rose.accent);
      expect(rose.accent, isNot(matineeDark.accent));
      await tester.tap(find.bySemanticsLabel('Back').first);
      await tester.pumpAndSettle();
    });

    testWidgets('online but unreachable, it keeps it for later', (
      tester,
    ) async {
      final (container, players, sent) = await pump(
        tester,
        auth: SignedIn(_server, ada),
        reachable: false,
      );
      expect(
        players.single.opens.single.position,
        const Duration(seconds: 600),
      );
      await tester.tap(find.bySemanticsLabel('Back').first);
      await tester.pumpAndSettle();
      expect(sent, contains('POST /api/v1/media/m1/progress'));
      final pending = container.read(pendingProgressProvider.notifier);
      expect(pending.report(_server, 'm1'), isNotNull);
    });

    testWidgets('has the stream\'s keys, lock, system controls, and report', (
      tester,
    ) async {
      final media = FakeMediaControls();
      final pip = FakePictureInPicture();
      final (container, players, _) = await pump(
        tester,
        auth: Offline(_server, ada),
        extra: [
          pictureInPictureProvider.overrideWithValue(pip),
          mediaControlsProvider.overrideWithValue(media),
        ],
      );
      final player = players.single;
      player.emit(PlaybackPhase.ready, 600, playing: true);
      await tester.pumpAndSettle();
      // In the shade and on the lock screen, without the server's artwork.
      expect(media.shown.single.title, 'Arrival');
      expect(media.shown.single.artworkUrl, isNull);
      expect(media.states.last.playing, isTrue);
      // Leaving the app while it plays shrinks it into picture in picture.
      expect(pip.autos.last, isTrue);

      await tester.sendKeyEvent(LogicalKeyboardKey.mediaPlayPause);
      await tester.pumpAndSettle();
      expect(player.pauses, 1);
      media.press(MediaCommandKind.play);
      await tester.pumpAndSettle();
      expect(player.plays, 1);

      await tester.tap(find.bySemanticsLabel('Lock controls'));
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Unlock'), findsOneWidget);
      // Once the button has gone, system Back brings it back rather than
      // leaving the video.
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      double unlockOpacity() => tester
          .widget<AnimatedOpacity>(
            find.ancestor(
              of: find.bySemanticsLabel('Unlock'),
              matching: find.byType(AnimatedOpacity),
            ),
          )
          .opacity;
      expect(unlockOpacity(), 0);
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pump();
      expect(find.byType(PlayRoute), findsOneWidget);
      expect(unlockOpacity(), 1);
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel('Unlock'));
      await tester.pumpAndSettle();

      final report = container.read(playbackReportProvider)!;
      expect(report.attempts.single.mode, SourceMode.local);
      expect(report.attempts.single.startAt, 600);
      expect(report.attempts.single.outcome, AttemptOutcome.playing);
      await tester.tap(find.bySemanticsLabel('Back').first);
      await tester.pumpAndSettle();
    });

    testWidgets('a pending report is where it starts', (tester) async {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.withData({
            'matinee.pending.reports:$_server':
                '{"m1":{"positionSeconds":1200,"durationSeconds":3600}}',
          });
      final (_, players, _) = await pump(tester, auth: Offline(_server, ada));
      expect(
        players.single.opens.single.position,
        const Duration(seconds: 1200),
      );
    });
  });
}
