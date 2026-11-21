import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/library/library_screen.dart';
import 'package:matinee/screens/shell/header.dart';
import 'package:matinee/screens/shell/shell.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/harness.dart' show server;
import 'home_backend.dart';

const _tabs = ['Home', 'Shows', 'Movies', 'Downloads', 'Profile'];

Future<void> _pump(
  WidgetTester tester,
  Size size, {
  double textScale = 1,
}) async {
  final backend = HomeBackend();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(
    ProviderScope(
      // Signed in, so the router leaves the sign-in screens for the tabs.
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.example.com', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(
          MatineeApi(base: server, client: backend.client),
        ),
        artworkLoaderProvider.overrideWithValue(
          ArtworkLoader(backend.client, const NoArtworkCache()),
        ),
        // Settings names the server in use, which the session would keep.
        savedServersProvider.overrideWithValue([
          SavedServer(
            origin: '$server/',
            address: '$server',
            name: null,
            user: User.fromJson(userJson('ada')),
            active: true,
          ),
        ]),
      ],
      child: const MatineeApp(),
    ),
  );
  await tester.pumpAndSettle();
}

/// The tab bar's labels that are showing.
Iterable<String> _labels(WidgetTester tester) => _tabs.where(
  (tab) => find
      .descendant(of: find.byType(TabBar), matching: find.text(tab))
      .evaluate()
      .isNotEmpty,
);

void main() {
  // The labels fit by their measured width, which the test font's square
  // glyphs would make far wider.
  setUpAll(() async {
    await (FontLoader(
      KitText.family,
    )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
  });

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  testWidgets('a phone gets the header and five named tabs that switch', (
    tester,
  ) async {
    await _pump(tester, const Size(412, 915));
    expect(find.byType(ShellHeader), findsOneWidget);
    expect(_labels(tester), _tabs);
    expect(find.text('Continue watching'), findsOneWidget);
    await tester.tap(
      find.descendant(of: find.byType(TabBar), matching: find.text('Movies')),
    );
    await tester.pumpAndSettle();
    expect(find.byType(KindScreen), findsOneWidget);
    expect(find.byType(ShellHeader), findsOneWidget);
    // Back on Home, it's where it was.
    await tester.tap(
      find.descendant(of: find.byType(TabBar), matching: find.text('Home')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Continue watching'), findsOneWidget);
  });

  testWidgets('back on another tab goes to Home, and on Home leaves', (
    tester,
  ) async {
    await _pump(tester, const Size(412, 915));
    await tester.tap(
      find.descendant(of: find.byType(TabBar), matching: find.text('Shows')),
    );
    await tester.pumpAndSettle();
    expect(find.byType(KindScreen), findsOneWidget);
    // A page over the tabs goes first.
    await tester.tap(find.bySemanticsLabel('Settings'));
    await tester.pumpAndSettle();
    expect(find.byType(ShellHeader), findsNothing);
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(find.byType(KindScreen), findsOneWidget);
    // Then the tab, as the Kotlin app has Home under every other tab.
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(find.text('Continue watching'), findsOneWidget);
    expect(find.byType(KindScreen), findsNothing);
    // Home has nothing under it, so back leaves the app.
    expect(await tester.binding.handlePopRoute(), isFalse);
  });

  testWidgets("a card's menu opens over the tabs, at most 640 wide", (
    tester,
  ) async {
    await _pump(tester, const Size(1280, 800));
    await tester.longPress(
      find.bySemanticsLabel('The Expanse, S2, E5: Home · 12 min left'),
    );
    await tester.pumpAndSettle();
    final cancel = find.text('Go to The Expanse');
    expect(cancel, findsOneWidget);
    // On the root navigator, not the tab's, so the tab bar can't cover it.
    expect(
      find.ancestor(of: cancel, matching: find.byType(HandsetShell)),
      findsNothing,
    );
    expect(tester.getSize(find.byType(Sheet)).width, lessThanOrEqualTo(640));
  });

  testWidgets('a tablet in landscape keeps the tabs along the bottom', (
    tester,
  ) async {
    await _pump(tester, const Size(1280, 800));
    final bottom = tester.getBottomLeft(find.byType(TabBar)).dy;
    expect(bottom, greaterThan(700));
    expect(find.byType(ShellHeader), findsOneWidget);
  });

  testWidgets('the tabs drop every label when one does not fit', (
    tester,
  ) async {
    await _pump(tester, const Size(320, 640), textScale: 2);
    expect(_labels(tester), isEmpty);
    // Screen readers still get the names.
    expect(find.bySemanticsLabel('Downloads'), findsOneWidget);
  });

  testWidgets('the header opens search and settings', (tester) async {
    await _pump(tester, const Size(412, 915));
    expect(find.bySemanticsLabel('Requests'), findsNothing);
    for (final label in ['Search', 'Settings']) {
      await tester.tap(find.bySemanticsLabel(label));
      await tester.pumpAndSettle();
      // The page covers the tabs, header and all.
      expect(find.byType(ShellHeader), findsNothing);
      await tester.tap(find.bySemanticsLabel('Back'));
      await tester.pumpAndSettle();
      expect(find.byType(ShellHeader), findsOneWidget);
    }
  });

  test('routes build their paths', () {
    expect(Routes.title('t1'), '/title/t1');
    expect(Routes.season('t1', 2), '/title/t1/season/2');
    expect(Routes.requests(), '/requests');
    expect(Routes.requests('approved'), '/requests/approved');
    expect(Routes.browse(genre: 'Drama'), '/browse?genre=Drama');
    expect(Routes.person('Ana de Armas'), '/person/Ana%20de%20Armas');
  });
}
