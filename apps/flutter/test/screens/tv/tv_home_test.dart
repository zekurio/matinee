import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/tv/tv_browse.dart';
import 'package:matinee/screens/tv/tv_detail.dart';
import 'package:matinee/screens/tv/tv_home.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../home_backend.dart';
import 'tv_harness.dart';

void main() {
  loadTvFont();
  goldens();

  testWidgets('Home opens on the first card of its first row', (tester) async {
    await pumpTv(tester, HomeBackend());
    expect(find.byType(TvShell), findsOneWidget);
    expect(find.byType(TvHomeScreen), findsOneWidget);
    expect(focusedKey(), 'featured/s1');
    // The header names it.
    expect(find.text('The Expanse'), findsWidgets);
  });

  testWidgets('rows keep their cards as focus moves between them', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await right(tester);
    expect(focusedKey(), 'featured/m2');
    await right(tester);
    expect(focusedKey(), 'featured/m2', reason: 'the end of the row');
    await down(tester);
    expect(focusedKey(), 'continue/e1');
    await down(tester);
    expect(focusedKey(), 'nextUp/e2');
    await up(tester, 2);
    expect(focusedKey(), 'featured/m2', reason: 'the card it left');
    await up(tester);
    expect(focusedKey(), 'featured/m2', reason: 'nothing above');
  });

  testWidgets('Left from a first card opens the drawer, Right comes back', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await down(tester);
    expect(focusedKey(), 'continue/e1');
    await left(tester);
    expect(focusedLabel(), 'Home', reason: "the page's own entry");
    expect(find.text('Favorites'), findsOneWidget, reason: 'the labels show');
    await down(tester);
    expect(focusedLabel(), 'Favorites');
    await right(tester);
    expect(focusedKey(), 'continue/e1', reason: 'back where it was');
    expect(find.text('Favorites'), findsNothing);
  });

  testWidgets('Back on Home opens the drawer, and again leaves the app', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    expect(await back(tester), isTrue);
    expect(focusedLabel(), 'Home');
    expect(await back(tester), isFalse, reason: 'the app goes');
  });

  testWidgets('a drawer entry opens its page over Home, Back comes home', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await right(tester);
    await back(tester);
    expect(focusedLabel(), 'Home');
    await down(tester);
    expect(focusedLabel(), 'Favorites');
    await select(tester);
    expect(find.byType(TvFavoritesScreen), findsOneWidget);
    expect(await back(tester), isTrue);
    expect(find.byType(TvHomeScreen), findsOneWidget);
    expect(focusedKey(), 'featured/m2', reason: 'Home kept its place');
  });

  testWidgets('a card opens its page, and Back returns to the card', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await down(tester);
    await select(tester);
    expect(find.byType(TvEpisodeScreen), findsOneWidget);
    expect(await back(tester), isTrue);
    expect(focusedKey(), 'continue/e1');
  });

  testWidgets('holding Select opens the actions panel, Back closes it', (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await tester.sendKeyDownEvent(LogicalKeyboardKey.select);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.select);
    await settle(tester);
    expect(find.text('Mark all watched'), findsOneWidget);
    expect(focusedLabel(), 'Play', reason: 'its first entry');
    await down(tester, 10);
    await right(tester);
    await left(tester);
    expect(find.text('Mark all watched'), findsOneWidget, reason: 'stays');
    expect(await back(tester), isTrue);
    expect(find.text('Mark all watched'), findsNothing);
    expect(focusedKey(), 'featured/s1', reason: 'the card that opened it');
  });
}

void goldens() {
  for (final size in tvSizes) {
    testWidgets('Home at ${size.width.round()}', (tester) async {
      await pumpTv(tester, HomeBackend(), size: size);
      await down(tester);
      await expectLater(
        find.byType(TvShell),
        matchesGoldenFile('../goldens/tv_home_${size.width.round()}.png'),
      );
    });
  }
}
