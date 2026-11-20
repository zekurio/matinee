import 'dart:io';

import 'package:flutter/foundation.dart' show LicenseEntryWithLineBreaks;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/app_log.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/licenses.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/player/playback_report.dart';
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/player_state.dart';
import 'package:matinee/player/player_system.dart';
import 'package:matinee/player/subtitle_look.dart';
import 'package:matinee/screens/settings/about_page.dart';
import 'package:matinee/screens/settings/licenses_page.dart';
import 'package:matinee/screens/settings/settings_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/harness.dart';
import '../player/playback_fakes.dart' show plan;
import 'home_backend.dart';
import 'metadata_test.dart' show RecordedToasts;

final _overrides = <Override>[
  savedServersProvider.overrideWithValue([
    SavedServer(
      origin: '$server/',
      address: '$server',
      name: null,
      user: User.fromJson(userJson('ada')),
      active: true,
    ),
  ]),
  deviceProvider.overrideWithValue(
    const Device(
      formFactor: FormFactor.handset,
      name: 'Pixel Tablet',
      model: 'Pixel Tablet',
      osVersion: '16',
      appVersion: '1.4.0',
      platform: 'android',
    ),
  ),
];

Future<ProviderContainer> _pump(
  WidgetTester tester,
  Widget screen, {
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
  AuthState? auth,
  List<Override> overrides = const [],
}) async {
  await pumpScreen(
    tester,
    screen,
    client: HomeBackend().client,
    overrides: [..._overrides, ...overrides],
    size: size,
    colors: colors,
    auth: auth,
  );
  return ProviderScope.containerOf(tester.element(find.byWidget(screen)));
}

void main() {
  setUpAll(loadFont);

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  testWidgets('the first page lists the categories and the server', (
    tester,
  ) async {
    await _pump(tester, const SettingsScreen());
    for (final text in [
      'Settings',
      'Offline mode',
      'Account',
      'Appearance',
      'Playback',
      'Subtitles',
      'About',
      'media.example.com',
      'Matinee for Android 1.4.0',
    ]) {
      expect(find.text(text), findsOneWidget);
    }
    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();
    expect(find.text('/settings/appearance'), findsOneWidget);
  });

  testWidgets('offline, the account has nothing to show', (tester) async {
    await _pump(
      tester,
      const SettingsScreen(),
      auth: Offline('$server', User.fromJson(userJson('ada'))),
    );
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Account'), findsNothing);
  });

  testWidgets('an unknown page is the first page', (tester) async {
    await _pump(tester, const SettingsPageScreen(pageKey: 'nowhere'));
    expect(find.text('Offline mode'), findsOneWidget);
  });

  testWidgets('Appearance saves the color scheme', (tester) async {
    final container = await _pump(
      tester,
      const SettingsPageScreen(pageKey: 'appearance'),
    );
    expect(find.text('Color scheme'), findsOneWidget);
    expect(find.text('Theme'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(
      container.read(themeStoreProvider).value?.appearance,
      ThemeAppearance.dark,
    );
  });

  testWidgets('Playback picks the engine from a menu', (tester) async {
    final container = await _pump(
      tester,
      const SettingsPageScreen(pageKey: 'playback'),
    );
    expect(find.text('mpv'), findsOneWidget);
    await tester.tap(find.text('Player'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Media3'));
    await tester.pumpAndSettle();
    expect(container.read(playerEngineProvider).value, PlayerEngine.media3);
    expect(find.text('Media3'), findsOneWidget);
  });

  testWidgets('Playback keeps the device settings the player reads', (
    tester,
  ) async {
    final container = await _pump(
      tester,
      const SettingsPageScreen(pageKey: 'playback'),
      size: const Size(412, 2400),
      overrides: [
        playbackCodecsProvider.overrideWith(
          (ref) => wire.CodecCapabilitiesMessage(
            video: [wire.VideoDecoderMessage(codec: 'h264', tenBit: false)],
            audio: ['aac', 'ac3'],
            dolbyVision: false,
          ),
        ),
        pictureInPictureAvailableProvider.overrideWith((ref) => true),
      ],
    );
    await tester.pumpAndSettle();
    expect(find.text('Gestures'), findsOneWidget);
    // On, and its button in Player buttons; off, the button row goes.
    expect(find.text('Picture in picture'), findsNWidgets(2));
    await tester.tap(find.text('Picture in picture').first);
    await tester.pumpAndSettle();
    expect(find.text('Picture in picture'), findsOneWidget);
    expect(
      container.read(playerPrefsProvider).value!.pictureInPicture,
      isFalse,
    );
    expect(find.text('Player buttons'), findsOneWidget);
    // Only on a TV.
    expect(find.text('Match frame rate'), findsNothing);
    await tester.tap(find.text('Play the next episode'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('AC-3'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Decoders'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Software first'));
    await tester.pumpAndSettle();
    final prefs = container.read(playerPrefsProvider).value!;
    expect(prefs.autoplayNext, isFalse);
    expect(prefs.convertAudio, {'ac3'});
    expect(prefs.decoders, Decoders.software);
    // Saved, so a new start reads the same.
    container.invalidate(playerPrefsProvider);
    expect(await container.read(playerPrefsProvider.future), prefs);
  });

  testWidgets('Subtitles keeps the look and shows it in the sample', (
    tester,
  ) async {
    final container = await _pump(
      tester,
      const SettingsPageScreen(pageKey: 'subtitles'),
      size: const Size(412, 1200),
      overrides: [
        systemCaptionStyleProvider.overrideWith(
          (ref) => CaptionStyleMessage(
            foreground: 0xFFFFFF00,
            background: 0x00000000,
            window: 0xFF0000FF,
            edge: CaptionEdgeMessage.raised,
            edgeColor: 0xFF000000,
            scale: 1.5,
          ),
        ),
      ],
    );
    await tester.pumpAndSettle();
    SubtitleLook sample() =>
        tester.widget<SubtitleLine>(find.byType(SubtitleLine)).look;
    expect(find.text('This is how subtitles look.'), findsOneWidget);
    expect(sample(), SubtitleLook.own(const PlayerPrefs()));

    await tester.tap(find.text('Size'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('150%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Text color'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yellow'));
    await tester.pumpAndSettle();
    // Only the app's own edges: the system's raised one isn't offered.
    await tester.tap(find.text('Edge'));
    await tester.pumpAndSettle();
    expect(find.text('Outline'), findsOneWidget);
    await tester.tap(find.text('Outline'));
    await tester.pumpAndSettle();
    var prefs = container.read(playerPrefsProvider).value!;
    expect(prefs.subtitleScale, 1.5);
    expect(prefs.subtitleColor, SubtitleColor.yellow);
    expect(prefs.subtitleEdge, SubtitleEdge.outline);
    expect(sample().color, const Color(0xFFFFE14D));
    expect(sample().edge, SubtitleEdge.outline);

    // The system's style leaves only the way to its settings.
    await tester.tap(find.text("Use the system's caption style"));
    await tester.pumpAndSettle();
    prefs = container.read(playerPrefsProvider).value!;
    expect(prefs.subtitleSystemStyle, isTrue);
    expect(find.text('Caption preferences'), findsOneWidget);
    expect(find.text('Size'), findsNothing);
    expect(sample().edge, SubtitleEdge.raised);
    expect(sample().window, const Color(0xFF0000FF));
    expect(sample().scale, 1.5);
  });

  testWidgets('About tells the version and opens the licenses', (tester) async {
    await _pump(tester, const SettingsPageScreen(pageKey: 'about'));
    expect(find.text('1.4.0, debug'), findsOneWidget);
    expect(find.text('16'), findsOneWidget);
    expect(find.text('Pixel Tablet'), findsOneWidget);
    await tester.tap(find.text('Licenses'));
    await tester.pumpAndSettle();
    expect(find.text('/settings/licenses'), findsOneWidget);
  });

  testWidgets('About shows, copies, and clears the playback report', (
    tester,
  ) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          // SAFETY: Clipboard.setData always sends a map with its text.
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    final container = await _pump(
      tester,
      const SettingsPageScreen(pageKey: 'about'),
      size: const Size(412, 1400),
    );
    expect(find.text('Playback report'), findsOneWidget);
    expect(find.textContaining('Nothing played since'), findsOneWidget);

    DiagnosticsRecorder(
        PlaybackReport(
          settings: SettingsDiagnostics.of(
            PlayerEngine.mpv,
            const PlayerPrefs(),
          ),
        ),
        container.read(playbackReportProvider.notifier).publish,
      )
      ..attempt(plan(), AttemptReason.start)
      ..failed(ErrorDiagnostics.unknown);
    await tester.pumpAndSettle();
    expect(find.text('Failed (file as it is)'), findsOneWidget);

    await tester.tap(find.text('Show report'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Matinee playback report v1'), findsOneWidget);
    await tester.tap(find.text('Close').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Copy report'));
    await tester.pumpAndSettle();
    expect(copied.single, startsWith('Matinee playback report v1'));

    await tester.tap(find.text('Clear report'));
    await tester.pumpAndSettle();
    expect(container.read(playbackReportProvider), isNull);
    expect(find.textContaining('Nothing played since'), findsOneWidget);
  });

  group('the app log', () {
    const lines = [
      '--------- beginning of main',
      '11-20 09:00:00.000  4321  4350 W ServerData: GET '
          'https://media.example.com/api/v1/titles failed',
      '11-20 09:00:01.000  4321  4350 I flutter: signed in to '
          'media.example.com as ada',
    ];
    const scrubbed = [
      '11-20 09:00:00.000 W ServerData: GET <url> failed',
      '11-20 09:00:01.000 I flutter: signed in to <server> as <account>',
    ];

    Future<RecordedToasts> pumpAbout(
      WidgetTester tester, {
      void Function(String subject, String text)? onShare,
    }) async {
      final toasts = RecordedToasts();
      await _pump(
        tester,
        const SettingsPageScreen(pageKey: 'about'),
        overrides: [
          logReaderProvider.overrideWithValue((maxLines) async {
            expect(maxLines, maxLogLines * 2);
            return lines;
          }),
          textSharerProvider.overrideWithValue(
            (subject, text) async => onShare?.call(subject, text),
          ),
          toastProvider.overrideWithValue(toasts),
        ],
      );
      return toasts;
    }

    testWidgets('shows the log without the server or the account', (
      tester,
    ) async {
      await pumpAbout(tester);
      expect(find.text('App log'), findsOneWidget);
      expect(
        find.text(
          'Recent messages from this app, without addresses, accounts, or '
          'file names',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Show log'));
      await tester.pumpAndSettle();
      for (final line in scrubbed) {
        expect(find.text(line), findsOneWidget);
      }
      expect(find.text('Matinee app log v1'), findsOneWidget);
      expect(find.textContaining('beginning of main'), findsNothing);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      expect(find.text(scrubbed.first), findsNothing);
    });

    testWidgets('copies it, which Android 13 and up confirms itself', (
      tester,
    ) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            // SAFETY: Clipboard.setData always sends a map with its text.
            copied = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      final toasts = await pumpAbout(tester);
      await tester.tap(find.text('Copy log'));
      await tester.pumpAndSettle();
      expect(copied, endsWith('${scrubbed.join('\n')}\n'));
      expect(toasts.shown, isEmpty);
    });

    testWidgets('shares it', (tester) async {
      final shared = <(String, String)>[];
      await pumpAbout(
        tester,
        onShare: (subject, text) => shared.add((subject, text)),
      );
      await tester.tap(find.text('Share log'));
      await tester.pumpAndSettle();
      expect(shared.single.$1, 'App log');
      expect(shared.single.$2, startsWith('Matinee app log v1\n'));
      expect(shared.single.$2, contains(scrubbed.last));
    });
  });

  group('licenses', () {
    // What Flutter's NOTICES would hold for two Dart packages.
    final registry = licenseRegistryProvider.overrideWithValue(
      () => Stream.fromIterable([
        const LicenseEntryWithLineBreaks(['http'], 'Copyright the Dart team'),
        const LicenseEntryWithLineBreaks([
          'http',
          'crypto',
        ], 'BSD-style license'),
      ]),
    );

    // The texts are assets, which the test reads from disk in real time,
    // one after another.
    Future<void> loaded(WidgetTester tester) async {
      for (var turn = 0; turn < 500; turn++) {
        await tester.pump();
        if (find.byType(LoadingState).evaluate().isEmpty) break;
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 5)),
        );
      }
      expect(find.byType(LoadingState), findsNothing);
      await tester.pumpAndSettle();
    }

    Finder list() => find
        .descendant(
          of: find.byType(SettingsPageScreen),
          matching: find.byType(Scrollable),
        )
        .first;

    testWidgets('the page has the project, the notices, and each package', (
      tester,
    ) async {
      await _pump(
        tester,
        const SettingsPageScreen(pageKey: 'licenses'),
        overrides: [registry],
      );
      await loaded(tester);
      expect(find.text('This app'), findsOneWidget);
      expect(
        find.text('GNU General Public License, version 3'),
        findsOneWidget,
      );
      expect(find.text('Android player notices'), findsOneWidget);
      expect(find.text('MainActivity.kt'), findsOneWidget);
      for (final package in [
        'AndroidX Media3',
        'FFmpeg (Jellyfin Media3 FFmpeg decoder)',
        'libmpv (mpv-android)',
        'OkHttp',
        'Red Hat Text',
        'ZXing',
      ]) {
        await tester.scrollUntilVisible(
          find.text(package),
          200,
          scrollable: list(),
        );
        expect(find.text(package), findsOneWidget);
      }
      await tester.scrollUntilVisible(
        find.text('http'),
        200,
        scrollable: list(),
      );
      // Covered by both of its entries.
      expect(find.text('2 licenses'), findsOneWidget);
      await tester.ensureVisible(find.text('http'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('http'));
      await tester.pumpAndSettle();
      expect(find.text('/licenses/http'), findsOneWidget);
    });

    testWidgets("a license's page shows its text", (tester) async {
      await _pump(
        tester,
        const LicenseTextScreen(package: projectPackage),
        overrides: [registry],
      );
      await loaded(tester);
      expect(
        find.text('GNU General Public License, version 3'),
        findsOneWidget,
      );
      expect(find.textContaining('GNU GENERAL PUBLIC LICENSE'), findsOneWidget);
    });

    testWidgets('a native library says whose it is over its license', (
      tester,
    ) async {
      await _pump(
        tester,
        const LicenseTextScreen(package: 'AndroidX Media3'),
        overrides: [registry],
      );
      await loaded(tester);
      expect(
        find.textContaining('Copyright © The Android Open Source Project'),
        findsOneWidget,
      );
      expect(find.textContaining('Apache License'), findsOneWidget);
    });

    test('every library the Android build bundles has its license here', () {
      // Each dependency's group, and the entry that carries its license.
      const carried = {
        'edde746:mpv-android': 'libmpv (mpv-android)',
        'androidx.media3': 'AndroidX Media3',
        'org.jellyfin.media3': 'FFmpeg (Jellyfin Media3 FFmpeg decoder)',
        'org.jetbrains.kotlinx': 'kotlinx.coroutines',
        'androidx.camera': 'AndroidX CameraX',
        'com.google.zxing': 'ZXing',
        'androidx.work': 'AndroidX WorkManager',
        'com.squareup.okhttp3': 'OkHttp',
      };
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      final groups = [
        for (final match in RegExp(
          r'^\s*implementation\("([^":]+)(:[^":]+)?',
          multiLine: true,
        ).allMatches(gradle))
          match[1] == 'edde746' ? 'edde746${match[2]}' : match[1]!,
      ];
      expect(groups, isNotEmpty);
      final packages = {
        for (final license in androidLicenses) ...license.packages,
      };
      for (final group in groups) {
        expect(
          carried[group],
          isNotNull,
          reason: '$group is bundled; add its license to androidLicenses',
        );
        expect(packages, contains(carried[group]));
      }
    });

    for (final colors in [matineeDark]) {
      testWidgets('the licenses page', (tester) async {
        await _pump(
          tester,
          const SettingsPageScreen(pageKey: 'licenses'),
          overrides: [registry],
          colors: colors,
        );
        await loaded(tester);
        await expectLater(
          find.byType(SettingsPageScreen),
          matchesGoldenFile('goldens/licenses_phone_dark.png'),
        );
      });
    }
  });

  test('the notice reads as headings, paragraphs, and rows', () {
    final blocks = noticeBlocks('''
# Notices

Adapted from Plezy at `54f135f`, under the
[LICENSE](../../LICENSE).

| File | Source |
| ---- | ------ |
| `a.kt` | `b.kt`, the surface |

[Plezy revision](https://example.com/plezy/54f135f)
''');
    expect(blocks, hasLength(4));
    expect((blocks[0] as NoticeHeading).text, 'Notices');
    expect(
      (blocks[1] as NoticeParagraph).text,
      'Adapted from Plezy at 54f135f, under the LICENSE.',
    );
    expect((blocks[2] as NoticeRow).cells, ['a.kt', 'b.kt, the surface']);
    // A web link keeps where it goes, or the line says nothing.
    expect(
      (blocks[3] as NoticeParagraph).text,
      'Plezy revision (https://example.com/plezy/54f135f)',
    );
  });

  for (final (name, page, colors) in [
    ('settings_phone_dark', '', matineeDark),
    ('appearance_phone_light', 'appearance', matineeLight),
  ]) {
    testWidgets(name, (tester) async {
      await _pump(tester, SettingsPageScreen(pageKey: page), colors: colors);
      await expectLater(
        find.byType(SettingsPageScreen),
        matchesGoldenFile('goldens/$name.png'),
      );
    });
  }
}
