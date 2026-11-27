import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/title/title_data.dart';
import 'package:matinee/screens/title/title_parts.dart';
import 'package:matinee/screens/title/title_screen.dart';

import '../../core/fakes.dart';
import '../../media/fixtures.dart';

const _overview =
    'A long overview that goes on for a while, so the page has a paragraph '
    'to lay out beside the table of details or above it, as wide as the '
    'column lets it be.';

/// A movie with every detail the table shows, or with the lists [empty].
Title _title({bool empty = false}) => Title.fromJson({
  ...titleJson('t1', name: 'Arrival'),
  'overview': empty ? null : _overview,
  'genres': empty ? <String>[] : ['Drama', 'Mystery'],
  'originalName': null,
  'tagline': null,
  'releaseDate': empty ? null : '2016-11-11',
  'status': null,
  'path': '/movies/Arrival',
  'provider': null,
  'providerId': null,
  'externalIds': <String, String>{},
  'refreshedAt': null,
  'studios': empty ? <String>[] : ['Lava Bear'],
  'credits': [
    if (!empty)
      for (final name in ['Ada', 'Ben', 'Cid', 'Dee', 'Eve'])
        {
          'kind': 'director',
          'name': name,
          'role': null,
          'photo': null,
          'tmdbId': null,
        },
    {
      'kind': 'actor',
      'name': 'Amy',
      'role': 'Louise',
      'photo': null,
      'tmdbId': null,
    },
  ],
  'trailers': <Object?>[],
  'itemCount': 1,
  'seasons': <Object?>[],
  'specials': null,
  'next': null,
});

/// [home] at `/` in a window [size] wide and tall, with `/browse` and
/// `/person/...` saying where a link went.
Future<GoRouter> _pump(
  WidgetTester tester,
  Widget home, {
  Size size = const Size(427, 952),
  Title? title,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (context, state) => home),
      GoRoute(
        path: '/browse',
        builder: (context, state) =>
            Text('browse ${state.uri.queryParameters['genre']}'),
      ),
      GoRoute(
        path: '/person/:name',
        builder: (context, state) =>
            Text('person ${state.pathParameters['name']}'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', User.fromJson(userJson('viewer'))),
        ),
        apiProvider.overrideWithValue(null),
        mayDownloadProvider.overrideWithValue(false),
        shownDownloadsProvider.overrideWithValue(const {}),
        if (title != null) titleProvider.overrideWith((ref, id) async => title),
      ],
      child: MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: MatineeTheme.data(matineeDark),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Rect _rect(WidgetTester tester, Finder finder) => tester.getRect(finder.first);

void main() {
  group('the table of details', () {
    testWidgets('has a row for each detail, the crew cut at three', (
      tester,
    ) async {
      await _pump(tester, Center(child: TitleDetails(title: _title())));
      expect(find.text('Genres'), findsOneWidget);
      expect(find.text('Drama'), findsOneWidget);
      expect(find.text('Directors'), findsOneWidget);
      expect(find.text('Cid'), findsOneWidget);
      expect(find.text('Dee'), findsNothing);
      expect(find.text('2 more'), findsOneWidget);
      expect(find.text('Studio'), findsOneWidget);
      expect(find.text('Released'), findsOneWidget);
      expect(find.text('Nov 11, 2016'), findsOneWidget);
      // The cast has its own rail.
      expect(find.text('Amy'), findsNothing);
    });

    testWidgets('leaves out rows without a value, and itself without any', (
      tester,
    ) async {
      final empty = _title(empty: true);
      expect(TitleDetails.any(empty), isFalse);
      expect(TitleDetails.any(_title()), isTrue);
      await _pump(tester, Center(child: TitleDetails(title: empty)));
      expect(find.byType(Table), findsNothing);
      expect(find.text('Released'), findsNothing);
    });

    testWidgets('opens a genre and a person', (tester) async {
      final router = await _pump(
        tester,
        Center(child: TitleDetails(title: _title())),
      );
      await tester.tap(find.text('Mystery'));
      await tester.pumpAndSettle();
      expect(find.text('browse Mystery'), findsOneWidget);
      router.pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ben'));
      await tester.pumpAndSettle();
      expect(find.text('person Ben'), findsOneWidget);
    });
  });

  group('the page', () {
    testWidgets('on a phone: no poster, the name in the 16:9 backdrop', (
      tester,
    ) async {
      await _pump(tester, const TitleScreen(id: 't1'), title: _title());
      expect(find.byType(TitleAside), findsNothing);
      final name = _rect(tester, find.text('Arrival'));
      final play = _rect(tester, find.text('Play'));
      final overview = _rect(tester, find.textContaining('A long overview'));
      final table = _rect(tester, find.byType(Table));
      // Just inside the foot of the 16:9 backdrop.
      expect(name.top, moreOrLessEquals(427 * 9 / 16 - 32, epsilon: 1));
      expect(name.top, lessThan(play.top));
      expect(play.top, lessThan(overview.top));
      expect(overview.bottom, lessThanOrEqualTo(table.top));
      expect(table.left, overview.left);
    });

    testWidgets('on a tablet: the poster beside it all, the details under '
        'the overview', (tester) async {
      await _pump(
        tester,
        const TitleScreen(id: 't1'),
        size: const Size(800, 1280),
        title: _title(),
      );
      final poster = _rect(
        tester,
        find.descendant(
          of: find.byType(TitleAside),
          matching: find.byType(ArtFrame),
        ),
      );
      final name = _rect(tester, find.text('Arrival'));
      final overview = _rect(tester, find.textContaining('A long overview'));
      final table = _rect(tester, find.byType(Table));
      expect(poster.width, 176);
      expect(poster.left, 16);
      expect(name.left, 16 + 176 + 24);
      expect(name.top, poster.top + 96);
      expect(overview.left, name.left);
      expect(table.top, greaterThanOrEqualTo(overview.bottom));
    });

    testWidgets('on a tablet on its side: the details beside the overview', (
      tester,
    ) async {
      await _pump(
        tester,
        const TitleScreen(id: 't1'),
        size: const Size(1280, 800),
        title: _title(),
      );
      final name = _rect(tester, find.text('Arrival'));
      final overview = _rect(tester, find.textContaining('A long overview'));
      final table = _rect(tester, find.byType(Table));
      expect(name.left, 16 + 240 + 40);
      expect(table.top, overview.top);
      expect(table.width, OverviewDetails.detailsWidth);
      expect(table.left, greaterThan(overview.right));
    });
  });
}
