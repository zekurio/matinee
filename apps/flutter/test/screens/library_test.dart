import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart' show User;
import 'package:matinee/core/display_names.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/actions.dart' show mediaChangesProvider;
import 'package:matinee/screens/library/library_screen.dart';
import 'package:matinee/screens/shell/shell.dart';

import '../core/fakes.dart' show userJson;
import '../downloads/fake_downloads.dart';
import '../media/fixtures.dart' show itemJson;
import '../media/harness.dart';
import 'library_backend.dart';

const _shows = KindScreen(kind: 'show');

/// The names the platform would give, in English.
final class _Names implements DisplayNameSource {
  @override
  Future<Map<String, String>> names(
    List<String> codes,
    DisplayNameKind kind,
    String language,
  ) async {
    const known = {'en': 'English', 'ja': 'Japanese', 'US': 'United States'};
    return {for (final code in codes) code: ?known[code]};
  }
}

Finder _grid() => find
    .descendant(of: find.byType(KindScreen), matching: find.byType(Scrollable))
    .first;

/// Presses the bar button a screen reader calls [label].
Future<void> _press(WidgetTester tester, String label) async {
  await tester.tap(find.bySemanticsLabel(label));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFont);

  testWidgets('Shows lists every show across the libraries', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    expect(find.text('Shows'), findsOneWidget);
    expect(find.text('3 titles'), findsOneWidget);
    expect(find.text('Show A0'), findsWidgets);
    expect(find.text('Movie 0'), findsNothing);
    final asked = backend.browsed.single;
    expect(asked['kind'], 'show');
    expect(asked['libraryId'], isNull);
    expect(asked['sort'], 'name');
    expect(asked['order'], 'asc');
    expect(backend.optionsAsked.single, {'kind': 'show'});
    // One library of the kind: no menu.
    expect(find.text('All libraries'), findsNothing);
  });

  for (final (name, entries, line) in [
    ('without downloads', <Object>[], ''),
    ('with downloads', [Object()], ' Your downloads still play.'),
  ]) {
    testWidgets('offline $name, it says what comes back', (tester) async {
      final backend = LibraryBackend();
      await pumpScreen(
        tester,
        _shows,
        client: backend.client,
        overrides: [
          savedServersProvider.overrideWithValue([
            SavedServer(
              origin: '$server/',
              address: '$server',
              name: null,
              user: User.fromJson(userJson('ada')),
              active: true,
            ),
          ]),
          downloadsPlatformProvider.overrideWithValue(
            FakeDownloadsPlatform([
              for (final _ in entries)
                downloadEntry(itemJson('m1'), server: '$server/'),
            ]),
          ),
        ],
        auth: Offline('$server', User.fromJson(userJson('ada'))),
      );
      expect(find.textContaining('Connect to a network'), findsNothing);
      expect(
        find.text(
          'Your shows and movies come back once the server can be '
          'reached.$line',
        ),
        findsOneWidget,
      );
      expect(
        find.text('Downloads'),
        entries.isEmpty ? findsNothing : findsOneWidget,
      );
      expect(backend.browsed, isEmpty);
    });
  }

  testWidgets('a card opens its title', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await tester.tap(find.bySemanticsLabel('Show B1, 2011'));
    await tester.pumpAndSettle();
    expect(find.text('/title/s1'), findsOneWidget);
  });

  testWidgets("a card's words under its poster open it, and its menu", (
    tester,
  ) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await tester.longPress(find.text('Show B1').last);
    await tester.pumpAndSettle();
    expect(find.byType(Sheet), findsOneWidget);
    await tester.tapAt(const Offset(4, 4));
    await tester.pumpAndSettle();
    expect(find.byType(Sheet), findsNothing);
    await tester.tap(find.text('2011'));
    await tester.pumpAndSettle();
    expect(find.text('/title/s1'), findsOneWidget);
  });

  testWidgets("a watched show's menu asks before it forgets", (tester) async {
    const question =
        'Mark every episode of Show B1 as unwatched? '
        'This also removes where you stopped.';
    final backend = LibraryBackend();
    backend.titles[1]['watched'] = true;
    await pumpScreen(tester, _shows, client: backend.client);
    await tester.longPress(find.text('Show B1').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark all unwatched'));
    await tester.pumpAndSettle();
    expect(find.text(question), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text(question), findsNothing);
    expect(
      backend.unanswered,
      isNot(contains('PUT /api/v1/titles/s1/watched')),
    );
    await tester.longPress(find.text('Show B1').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark all unwatched'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark all unwatched').last);
    await tester.pumpAndSettle();
    expect(find.text(question), findsNothing);
    expect(
      backend.unanswered.where((r) => r == 'PUT /api/v1/titles/s1/watched'),
      hasLength(1),
    );
  });

  testWidgets('the grid pages as it scrolls', (tester) async {
    final backend = LibraryBackend(shows: 130);
    await pumpScreen(tester, _shows, client: backend.client);
    expect(find.text('130 titles'), findsOneWidget);
    expect(backend.browsed, hasLength(1));
    await tester.scrollUntilVisible(
      find.bySemanticsLabel(RegExp(r'^Show .129, ')),
      2000,
      scrollable: _grid(),
      maxScrolls: 100,
    );
    expect([for (final body in backend.browsed) body['offset']], [0, 60, 120]);
    expect(find.bySemanticsLabel(RegExp(r'^Show .129, ')), findsOneWidget);
  });

  testWidgets('a phone takes two columns, a tablet more', (tester) async {
    final backend = LibraryBackend(shows: 12);
    await pumpScreen(tester, _shows, client: backend.client);
    double top(String name) =>
        tester.getTopLeft(find.bySemanticsLabel(RegExp('^$name, '))).dy;
    expect(top('Show A0'), top('Show B1'));
    expect(top('Show C2'), greaterThan(top('Show A0')));
    await pumpScreen(
      tester,
      _shows,
      client: backend.client,
      size: const Size(1280, 800),
    );
    expect(top('Show A0'), top('Show F5'));
    expect(top('Show G6'), greaterThan(top('Show A0')));
  });

  testWidgets('the sort menu orders the list and words the cards', (
    tester,
  ) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await _press(tester, 'Sort: Name, A to Z');
    // Runtime isn't offered: no title has one.
    expect(find.text('Longest'), findsNothing);
    await tester.tap(find.text('Highest score'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['sort'], 'score');
    expect(backend.browsed.last['order'], 'desc');
    // The star is the kit's icon before the words, read out as the score.
    expect(find.textContaining('8.4 · 2010'), findsOneWidget);
    expect(find.textContaining('★'), findsNothing);
    expect(find.bySemanticsLabel(RegExp(r'Score 8\.4, 2010$')), findsOneWidget);
    expect(find.bySemanticsLabel('Sort: Highest score'), findsOneWidget);
  });

  testWidgets('a filter narrows the list and shows as a chip', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await _press(tester, 'Filters');
    expect(find.text('Progress'), findsOneWidget);
    expect(find.text('Up to the rating you pick · US'), findsOneWidget);
    await tester.tap(find.text('Drama'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['filters'], containsPair('genres', ['Drama']));
    await tester.tap(find.text('Show titles'));
    await tester.pumpAndSettle();
    expect(find.text('2 titles'), findsOneWidget);
    expect(find.bySemanticsLabel('Filters, 1 on'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Remove filter Drama'));
    await tester.pumpAndSettle();
    expect(find.text('3 titles'), findsOneWidget);
    expect(find.bySemanticsLabel('Filters'), findsOneWidget);
  });

  testWidgets('the language filter names languages in the app language', (
    tester,
  ) async {
    final backend = LibraryBackend()
      ..options['languages'] = [
        {'language': 'en', 'titleCount': 2},
        {'language': 'ja', 'titleCount': 1},
      ];
    await pumpScreen(
      tester,
      _shows,
      client: backend.client,
      overrides: [displayNameSourceProvider.overrideWithValue(_Names())],
    );
    await _press(tester, 'Filters');
    expect(
      find.text('Up to the rating you pick · United States'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('Any language'),
      200,
      scrollable: find
          .descendant(of: find.byType(Sheet), matching: find.byType(Scrollable))
          .first,
    );
    await tester.tap(find.text('Any language'));
    await tester.pumpAndSettle();
    expect(find.text('Find a language'), findsOneWidget);
    expect(find.bySemanticsLabel('English, 2'), findsOneWidget);
    await expectLater(
      find.byType(Navigator).first,
      matchesGoldenFile('goldens/shows_languages_phone_dark.png'),
    );
    await tester.enterText(find.byType(EditableText).last, 'jap');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('English, 2'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Japanese, 1'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['filters'], containsPair('language', 'ja'));
    expect(
      find.descendant(of: find.byType(Sheet), matching: find.text('Japanese')),
      findsOneWidget,
    );
    await tester.tap(find.text('Show titles'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Filters, 1 on'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Remove filter Japanese'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['filters'], isNot(contains('language')));
  });

  testWidgets('the choices last after leaving the tab', (tester) async {
    final backend = LibraryBackend();
    final showing = ValueNotifier(true);
    addTearDown(showing.dispose);
    await pumpScreen(
      tester,
      ValueListenableBuilder(
        valueListenable: showing,
        builder: (context, on, child) => on ? _shows : const SizedBox(),
      ),
      client: backend.client,
    );
    await _press(tester, 'Sort: Name, A to Z');
    await tester.tap(find.text('Newest'));
    await tester.pumpAndSettle();
    showing.value = false;
    await tester.pumpAndSettle();
    showing.value = true;
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Sort: Newest'), findsOneWidget);
    expect(backend.browsed.last['sort'], 'year');
  });

  testWidgets('with two libraries of the kind, a menu picks one', (
    tester,
  ) async {
    final backend = LibraryBackend()
      ..libraries.add(showLibraryJson('anime', 'Anime'));
    await pumpScreen(tester, _shows, client: backend.client);
    await _press(tester, 'Library: All libraries');
    await tester.tap(find.text('Anime'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['libraryId'], 'anime');
    expect(backend.optionsAsked.last, {'libraryId': 'anime'});
    expect(find.text('No shows found'), findsOneWidget);
  });

  testWidgets('nothing matching offers to clear the filters', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await _press(tester, 'Filters');
    await tester.tap(find.text('Drama'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Comedy'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Show titles'));
    await tester.pumpAndSettle();
    expect(find.text('No shows match these filters'), findsOneWidget);
    await tester.tap(find.text('Clear filters'));
    await tester.pumpAndSettle();
    expect(find.text('3 titles'), findsOneWidget);
  });

  testWidgets('a failure says so and tries again', (tester) async {
    final backend = LibraryBackend()
      ..failing['/api/v1/titles/browse'] = 'The database is down.';
    await pumpScreen(tester, _shows, client: backend.client);
    expect(find.text("Couldn't load these titles"), findsOneWidget);
    expect(find.text('The database is down.'), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('3 titles'), findsOneWidget);
  });

  testWidgets('an unreachable server shows the cloud', (tester) async {
    final backend = LibraryBackend()..down.add('/api/v1/titles/browse');
    await pumpScreen(tester, _shows, client: backend.client);
    expect(find.bySemanticsLabel('Server not reachable'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('a change made elsewhere fetches the list again', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    expect(backend.browsed, hasLength(1));
    ProviderScope.containerOf(tester.element(find.byType(KindScreen)))
        .read(mediaChangesProvider.notifier)
        .changed();
    await tester.pumpAndSettle();
    expect(backend.browsed, hasLength(2));
    expect(backend.browsed.last['offset'], 0);
  });

  testWidgets('tapping the open tab scrolls to the top', (tester) async {
    final backend = LibraryBackend(shows: 40);
    await pumpScreen(tester, _shows, client: backend.client);
    await tester.drag(_grid(), const Offset(0, -1500));
    await tester.pumpAndSettle();
    final position = tester.state<ScrollableState>(_grid()).position;
    expect(position.pixels, greaterThan(0));
    ProviderScope.containerOf(tester.element(find.byType(KindScreen)))
        .read(tabReselectProvider.notifier)
        .tapped('/shows');
    await tester.pumpAndSettle();
    expect(position.pixels, 0);
  });

  testWidgets('Browse lists a genre from every library', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(
      tester,
      const BrowseScreen(genre: 'Drama'),
      client: backend.client,
    );
    expect(find.text('Drama'), findsOneWidget);
    expect(find.text('Genre · 4 titles'), findsOneWidget);
    expect(backend.browsed.last['filters'], containsPair('genres', ['Drama']));
    expect(backend.browsed.last['kind'], isNull);
    expect(backend.optionsAsked.last, {'genre': 'Drama'});
    await tester.tap(find.text('Movies'));
    await tester.pumpAndSettle();
    expect(backend.browsed.last['kind'], 'movie');
    expect(find.text('Genre · 2 titles'), findsOneWidget);
    expect(find.text('Movie 0'), findsWidgets);
  });

  testWidgets('Browse keeps the page genre when another is picked', (
    tester,
  ) async {
    final backend = LibraryBackend();
    await pumpScreen(
      tester,
      const BrowseScreen(genre: 'Drama'),
      client: backend.client,
    );
    await _press(tester, 'Filters');
    await tester.tap(find.text('Comedy'));
    await tester.pumpAndSettle();
    expect(
      backend.browsed.last['filters'],
      containsPair('genres', ['Drama', 'Comedy']),
    );
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('Shows on a $name', (tester) async {
      final backend = LibraryBackend(shows: 14)
        ..libraries.add(showLibraryJson('anime', 'Anime'));
      await pumpScreen(
        tester,
        _shows,
        client: backend.client,
        size: size,
        colors: colors,
      );
      await _press(tester, 'Filters');
      await tester.tap(find.text('Drama'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show titles'));
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(KindScreen),
        matchesGoldenFile('goldens/shows_$name.png'),
      );
    });
  }

  testWidgets('the filters on a phone', (tester) async {
    final backend = LibraryBackend();
    await pumpScreen(tester, _shows, client: backend.client);
    await _press(tester, 'Filters');
    await tester.tap(find.text('Unwatched'));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(Navigator).first,
      matchesGoldenFile('goldens/shows_filters_phone_dark.png'),
    );
  });

  testWidgets('a tablet opens the filters no wider than a phone sheet', (
    tester,
  ) async {
    final backend = LibraryBackend();
    await pumpScreen(
      tester,
      _shows,
      client: backend.client,
      size: const Size(1280, 800),
    );
    await _press(tester, 'Filters');
    expect(tester.getSize(find.byType(Sheet)).width, 640);
  });
}
