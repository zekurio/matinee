import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/app.dart';
import 'package:matinee/screens/home/home_data.dart';
import 'package:matinee/screens/tv/tv_browse.dart';
import 'package:matinee/screens/tv/tv_detail.dart';
import 'package:matinee/screens/tv/tv_home.dart';
import 'package:matinee/screens/tv/tv_media.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../../media/fixtures.dart';
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

  testWidgets("the header's episode line keeps clear of the logo", (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await down(tester);
    expect(focusedKey(), 'continue/e1');
    final mark = tester.getRect(find.byType(TvTitleLogo));
    final line = tester.getRect(
      find.descendant(
        of: find.byKey(const Key('hero/subtitle')),
        matching: find.byType(Text),
      ),
    );
    expect(line.top - mark.bottom, inInclusiveRange(8, 12));
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

  testWidgets("the drawer's Home from another page gives Home its place", (
    tester,
  ) async {
    await pumpTv(tester, HomeBackend());
    await right(tester);
    await back(tester);
    await down(tester);
    await select(tester);
    expect(find.byType(TvFavoritesScreen), findsOneWidget);
    await left(tester);
    expect(focusedLabel(), 'Favorites');
    await up(tester);
    await select(tester);
    expect(find.byType(TvHomeScreen), findsOneWidget);
    expect(focusedKey(), 'featured/m2', reason: 'on the page, not the drawer');
    expect(find.text('Favorites'), findsNothing, reason: 'the drawer closed');
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

  testWidgets('a row whose card left while away still takes focus', (
    tester,
  ) async {
    final backend = HomeBackend();
    await pumpTv(tester, backend);
    await down(tester);
    expect(focusedKey(), 'continue/e1');
    await select(tester);
    expect(find.byType(TvEpisodeScreen), findsOneWidget);
    // Watched to the end meanwhile, the episode leaves Continue watching.
    final show = titleJson('s1', kind: 'show', name: 'The Expanse');
    backend.answers['/api/v1/home/continue-watching'] = [
      itemJson(
        'e9',
        title: show,
        season: 1,
        episode: 3,
        duration: 1800,
        position: 600,
      ),
    ];
    ProviderScope.containerOf(tester.element(find.byType(MatineeApp)))
        .invalidate(continueWatchingProvider);
    expect(await back(tester), isTrue);
    expect(find.byType(TvHomeScreen), findsOneWidget);
    await down(tester);
    expect(focusedKey(), 'continue/e9');
  });

  testWidgets("a row's Try again gives focus to the row it loads", (
    tester,
  ) async {
    final backend = HomeBackend();
    backend.answers['/api/v1/libraries'] = [
      libraryJson('lib1', name: 'Movies'),
      libraryJson('lib2', name: 'Shows'),
    ];
    backend.answers['/api/v1/libraries/lib2/shelf'] = [
      shelfJson(titleJson('s2', kind: 'show', name: 'Severance')),
    ];
    backend.down.add('/api/v1/libraries/lib2/shelf');
    await pumpTv(tester, backend);
    for (var i = 0; i < 10 && focusedLabel() != 'Try again'; i++) {
      await down(tester);
    }
    expect(focusedLabel(), 'Try again');
    backend.down.clear();
    await select(tester);
    // On its first card, not back on the row above.
    expect(focusedKey(), 'shelf-lib2/s2');
  });

  testWidgets("a watched show's actions ask before marking it unwatched", (
    tester,
  ) async {
    final backend = HomeBackend();
    final show = titleJson('s1', kind: 'show', name: 'The Expanse');
    backend.answers['/api/v1/home/featured'] = [
      featuredJson({...show, 'watched': true}),
    ];
    backend.answers['/api/v1/titles/s1/watched'] = null;
    await pumpTv(tester, backend);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.select);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.select);
    await settle(tester);
    await down(tester);
    expect(focusedLabel(), 'Mark all unwatched');
    await select(tester);
    // A summary doesn't count the episodes, so the question doesn't.
    expect(
      find.text(
        'Mark every episode of The Expanse as unwatched? This also removes '
        'where you stopped.',
      ),
      findsOneWidget,
    );
    expect(focusedLabel(), 'Cancel');
    await select(tester);
    expect(backend.asked, isNot(contains('/api/v1/titles/s1/watched')));
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
