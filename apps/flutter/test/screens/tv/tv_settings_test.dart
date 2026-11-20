import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/tv/tv_settings.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../home_backend.dart';
import 'tv_harness.dart';

JsonMap _session(String id, {bool current = false, String? name}) => {
  'id': id,
  'current': current,
  'client': 'app',
  'deviceName': name,
  'platform': 'androidtv',
  'browser': null,
  'createdAt': '2026-03-14T09:00:00.000Z',
  'lastSeenAt': '2026-11-20T09:00:00.000Z',
  'expiresAt': '2027-03-14T09:00:00.000Z',
};

HomeBackend _backend() => HomeBackend()
  ..answers.addAll({
    '/api/v1/playback/options': {
      'qualities': <Object>[],
      'maxBitrate': null,
      'downloads': false,
      'downloadVideoPresets': <Object>[],
      'skipSteps': [5, 10, 15, 30],
      'videoCodecs': <Object>[],
      'audioCodecs': <Object>[],
      'audioLanguages': ['en', 'de'],
      'subtitleLanguages': ['en', 'de'],
    },
    '/api/v1/account/sessions': [
      _session('s1', current: true, name: 'Living room'),
      _session('s2', name: 'Bedroom'),
    ],
  });

Future<void> _open(WidgetTester tester, String path, {Size? size}) async {
  await pumpTv(tester, _backend(), size: size ?? const Size(960, 540));
  final context = tester.element(find.byType(TvShell));
  GoRouter.of(context).go(path);
  await settle(tester);
}

void main() {
  loadTvFont();
  setUpAll(initializeDateFormatting);

  testWidgets('focusing a category shows its rows; Right goes into them', (
    tester,
  ) async {
    await _open(tester, Routes.settings);
    expect(find.byType(TvSettingsScreen), findsOneWidget);
    expect(focusedKey(), 'category/playback');
    expect(find.text('Match frame rate'), findsOneWidget);
    await down(tester);
    expect(focusedKey(), 'category/subtitles');
    expect(find.text("Use the system's caption style"), findsOneWidget);
    expect(find.text('Size'), findsOneWidget);
    await down(tester);
    expect(focusedKey(), 'category/languages');
    expect(find.text('Audio'), findsOneWidget);
    expect(find.text('Match frame rate'), findsNothing);
    await right(tester);
    expect(focusedLabel(), 'Audio');
    await down(tester);
    expect(focusedLabel(), 'Subtitles');
    await left(tester);
    expect(focusedKey(), 'category/languages', reason: 'Left comes out');
    await right(tester);
    expect(focusedLabel(), 'Audio', reason: 'the rows start at the top');
  });

  testWidgets('Back in the rows goes to the category, then leaves', (
    tester,
  ) async {
    await _open(tester, Routes.settings);
    await right(tester);
    expect(focusedLabel(), 'Quality');
    await down(tester, 2);
    expect(focusedLabel(), 'Play the next episode');
    await back(tester);
    expect(focusedKey(), 'category/playback');
    expect(find.byType(TvSettingsScreen), findsOneWidget);
    await back(tester);
    expect(find.byType(TvSettingsScreen), findsNothing);
  });

  testWidgets('a switch flips in place; a picker returns to its row', (
    tester,
  ) async {
    await _open(tester, Routes.settings);
    await right(tester);
    await down(tester);
    expect(focusedLabel(), startsWith('Match frame rate'));
    final toggle = find.byType(TvListSwitch).first;
    expect(tester.widget<TvListSwitch>(toggle).checked, isTrue);
    await select(tester);
    expect(tester.widget<TvListSwitch>(toggle).checked, isFalse);
    expect(focusedLabel(), startsWith('Match frame rate'));
    await down(tester, 2);
    expect(focusedLabel(), 'Player');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), 'mpv', reason: 'the current choice');
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedLabel(), 'Player');
  });

  testWidgets('the settings page path opens on its category', (tester) async {
    await _open(tester, '${Routes.settings}/about');
    expect(focusedKey(), 'category/about');
    expect(find.text('Version'), findsOneWidget);
    // Nothing played yet, so the report has nothing to show.
    expect(find.text('Playback report'), findsOneWidget);
    expect(find.textContaining('Nothing played since'), findsOneWidget);
  });

  testWidgets('a subtitle style opens its picker and keeps the pick', (
    tester,
  ) async {
    await _open(tester, '${Routes.settings}/subtitles');
    expect(focusedKey(), 'category/subtitles');
    await right(tester);
    expect(focusedLabel(), startsWith("Use the system's caption style"));
    await down(tester);
    expect(focusedLabel(), 'Size');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), '100%', reason: 'the current choice');
    await down(tester);
    await select(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedLabel(), 'Size');
    expect(find.text('125%'), findsOneWidget);
  });

  testWidgets('a device asks before signing out, on Sign out as Kotlin', (
    tester,
  ) async {
    await _open(tester, Routes.settings);
    await down(tester, 3);
    expect(focusedKey(), 'category/account');
    await right(tester);
    expect(focusedLabel(), startsWith('Living room'));
    await down(tester);
    expect(focusedLabel(), startsWith('Bedroom'));
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), 'Sign out');
    await down(tester);
    expect(focusedLabel(), 'Cancel');
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedLabel(), startsWith('Bedroom'));
  });

  testWidgets('Change server opens the server panel on the active one', (
    tester,
  ) async {
    await _open(tester, '${Routes.settings}/server');
    await right(tester);
    await down(tester, 2);
    expect(focusedLabel(), 'Change server');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), startsWith('media.example.com'));
    await down(tester, 2);
    expect(focusedLabel(), 'Remove a server');
    await select(tester);
    expect(tvOpenPanels.value, 2);
    await select(tester);
    expect(tvOpenPanels.value, 3);
    expect(focusedLabel(), 'Cancel');
    await back(tester);
    expect(tvOpenPanels.value, 2);
    await back(tester);
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedLabel(), 'Change server');
  });

  for (final size in tvSizes) {
    final width = size.width.round();
    for (final (name, page) in [
      ('playback', 'playback'),
      ('subtitles', 'subtitles'),
      ('languages', 'languages'),
    ]) {
      testWidgets('settings $name at $width', (tester) async {
        await _open(tester, '${Routes.settings}/$page', size: size);
        await expectLater(
          find.byType(TvShell),
          matchesGoldenFile('../goldens/tv_settings_${name}_$width.png'),
        );
      });
    }
  }
}
