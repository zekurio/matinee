import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/player_state.dart';
import 'package:matinee/screens/settings/about_page.dart';
import 'package:matinee/screens/settings/settings_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/harness.dart';
import 'home_backend.dart';

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
}) async {
  await pumpScreen(
    tester,
    screen,
    client: HomeBackend().client,
    overrides: _overrides,
    size: size,
    colors: colors,
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
      'Appearance',
      'Playback',
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

  testWidgets('an unknown page is the first page', (tester) async {
    await _pump(tester, const SettingsPageScreen(pageKey: 'subtitles'));
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

  testWidgets('About tells the version and opens the licenses', (tester) async {
    await _pump(tester, const SettingsPageScreen(pageKey: 'about'));
    expect(find.text('1.4.0, debug'), findsOneWidget);
    expect(find.text('16'), findsOneWidget);
    expect(find.text('Pixel Tablet'), findsOneWidget);
    await tester.tap(find.text('Licenses'));
    await tester.pumpAndSettle();
    expect(find.text('/settings/licenses'), findsOneWidget);
  });

  testWidgets('Licenses shows NOTICE.md', (tester) async {
    await _pump(tester, const SettingsPageScreen(pageKey: 'licenses'));
    expect(find.text('Android player notices'), findsOneWidget);
    expect(find.text('MainActivity.kt'), findsOneWidget);
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
