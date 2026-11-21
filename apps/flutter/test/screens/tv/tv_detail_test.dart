import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/screens/tv/tv_detail.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../../media/fixtures.dart';
import '../home_backend.dart';
import '../title_backend.dart';
import 'tv_harness.dart';

final _show = titleJson(
  's1',
  kind: 'show',
  name: 'The Expanse',
  backdrop: 'bd-s1',
);

JsonMap _episode(
  String id,
  int number, {
  double? position,
  bool done = false,
}) => itemJson(
  id,
  title: _show,
  season: 1,
  episode: number,
  episodeTitle: 'Episode $id',
  duration: 2400,
  position: position,
  completed: done,
);

/// A show of two seasons with one episode in progress, its cast, a movie,
/// and one of the cast's page.
HomeBackend _backend() => HomeBackend()
  ..answers.addAll({
    '/api/v1/titles/s1': fullTitleJson(
      's1',
      kind: 'show',
      name: 'The Expanse',
      overview: 'A detective and a ship captain find a conspiracy.',
      seasons: [seasonJson(1, watched: 1), seasonJson(2)],
      next: _episode('e2', 2, position: 600),
      credits: [
        creditJson('actor', 'Steven Strait', role: 'James Holden'),
        creditJson('actor', 'Dominique Tipper', role: 'Naomi Nagata'),
        creditJson('director', 'Terry McDonough'),
      ],
      studios: ['Alcon'],
      itemCount: 6,
    ),
    '/api/v1/titles/s1/items': [
      _episode('e1', 1, done: true),
      _episode('e2', 2, position: 600),
      _episode('e3', 3),
    ],
    '/api/v1/media/e2': _episode('e2', 2, position: 600),
    '/api/v1/people/Steven%20Strait': {
      'name': 'Steven Strait',
      'photo': null,
      'kind': 'actor',
      'titleCount': 8,
      'credits': [
        for (var i = 0; i < 8; i++)
          {
            'title': titleJson('p$i', name: 'Film $i'),
            'kind': 'actor',
            'role': 'Role $i',
          },
      ],
      'profile': null,
      'catalog': <Object>[],
      'stale': false,
    },
  });

Future<void> _open(WidgetTester tester, String path, {Size? size}) async {
  await pumpTv(tester, _backend(), size: size ?? const Size(960, 540));
  final context = tester.element(find.byType(TvShell));
  GoRouter.of(context).go(path);
  await settle(tester);
}

void main() {
  loadTvFont();

  group('Title', () {
    testWidgets('opens on Resume; the buttons run to their end', (
      tester,
    ) async {
      await _open(tester, '/title/s1');
      expect(find.byType(TvTitleScreen), findsOneWidget);
      expect(focusedKey(), 'actions/play');
      expect(focusedLabel(), startsWith('Resume'));
      await right(tester);
      expect(focusedKey(), 'actions/watched');
      await right(tester);
      expect(focusedKey(), 'actions/favorite');
      await right(tester);
      expect(focusedKey(), 'actions/favorite', reason: 'the end of the row');
    });

    testWidgets('Down walks the rows, Up comes back to where it left', (
      tester,
    ) async {
      await _open(tester, '/title/s1');
      await down(tester);
      expect(focusedKey(), 'nextUp/e2');
      await down(tester);
      expect(focusedKey(), 'seasons/1');
      await right(tester);
      expect(focusedKey(), 'seasons/2');
      await down(tester);
      // Nothing remembered there yet: the card under it, as Compose's.
      expect(focusedKey(), 'people/Dominique Tipper-Naomi Nagata');
      await down(tester);
      expect(focusedKey(), startsWith('links/'));
      await up(tester, 2);
      expect(focusedKey(), 'seasons/2', reason: 'the season it left');
      await up(tester, 2);
      expect(focusedKey(), 'actions/play');
      // With the header focused, the page is back at its top.
      final name = tester.getRect(find.text('The Expanse').first);
      expect(name.top, greaterThan(0));
    });

    testWidgets('one season lists its episodes, with no row of seasons', (
      tester,
    ) async {
      final backend = _backend();
      backend.answers['/api/v1/titles/s1'] = fullTitleJson(
        's1',
        kind: 'show',
        name: 'The Expanse',
        seasons: [seasonJson(1, watched: 1)],
        itemCount: 3,
      );
      await pumpTv(tester, backend, size: const Size(960, 540));
      GoRouter.of(tester.element(find.byType(TvShell))).go('/title/s1');
      await settle(tester);
      expect(find.text('Episodes'), findsOneWidget);
      expect(find.text('Seasons'), findsNothing);
    });

    testWidgets('a season opens on the episode Play starts, and Back returns', (
      tester,
    ) async {
      await _open(tester, '/title/s1');
      await down(tester, 2);
      expect(focusedKey(), 'seasons/1');
      await select(tester);
      expect(find.byType(TvSeasonScreen), findsOneWidget);
      expect(focusedKey(), 'episodes-1/e2');
      await back(tester);
      expect(find.byType(TvSeasonScreen), findsNothing);
      expect(focusedKey(), 'seasons/1');
    });

    testWidgets('the tick asks when in a panel, and gives focus back', (
      tester,
    ) async {
      await _open(tester, '/title/s1');
      await right(tester);
      expect(focusedLabel(), 'Mark watched');
      await select(tester);
      expect(tvOpenPanels.value, 1);
      await back(tester);
      expect(tvOpenPanels.value, 0);
      expect(focusedKey(), 'actions/watched');
    });
  });

  group('Season', () {
    testWidgets("a watched episode wears the phone's check, at a TV's size", (
      tester,
    ) async {
      await _open(tester, '/title/s1/season/1');
      final badge = find.byType(WatchedBadge);
      expect(badge, findsOneWidget, reason: 'e1 alone is done');
      expect(tester.getSize(badge), const Size.square(TvWatchedMark.size));
      expect(
        find.descendant(of: badge, matching: find.byType(KitIcon)),
        findsOneWidget,
      );
    });

    testWidgets("a season whose episodes don't load still gives focus", (
      tester,
    ) async {
      final backend = _backend();
      await pumpTv(tester, backend, size: const Size(960, 540));
      GoRouter.of(tester.element(find.byType(TvShell))).go('/title/s1');
      await settle(tester);
      await down(tester, 2);
      expect(focusedKey(), 'seasons/1');
      backend.down.add('/api/v1/titles/s1/items');
      await select(tester);
      expect(find.byType(TvSeasonScreen), findsOneWidget);
      // The page waits a moment for an episode, then focuses what it has.
      await tester.pump(const Duration(seconds: 3));
      await settle(tester);
      expect(focusedKey(), startsWith('tabs/'));
    });

    testWidgets('tabs change the season, and the show button goes up', (
      tester,
    ) async {
      await _open(tester, '/title/s1');
      await down(tester, 2);
      await select(tester);
      expect(focusedKey(), 'episodes-1/e2');
      await up(tester);
      expect(focusedKey(), startsWith('actions/'));
      await left(tester, 3);
      expect(focusedKey(), 'actions/play');
      await up(tester);
      // Resume, with its time left, is wide: the second tab is nearer.
      expect(focusedKey(), 'tabs/2');
      await select(tester);
      expect(focusedKey(), 'tabs/2');
      await down(tester);
      expect(focusedKey(), 'actions/play', reason: 'the button it left');
      await down(tester);
      expect(focusedKey(), 'episodes-2/e2', reason: "season 2's own row");
      await up(tester);
      expect(focusedKey(), 'actions/play');
      await right(tester, 3);
      expect(focusedLabel(), 'Go to The Expanse');
      await select(tester);
      expect(find.byType(TvSeasonScreen), findsNothing, reason: 'popped');
      expect(focusedKey(), 'seasons/1');
    });
  });

  group('Episode', () {
    testWidgets('Play, from the start, the marks, the season, the show', (
      tester,
    ) async {
      await _open(tester, '/episode/e2');
      expect(focusedKey(), 'actions/play');
      await right(tester);
      expect(focusedKey(), 'actions/restart');
      await right(tester, 4);
      expect(focusedKey(), 'actions/show');
      await down(tester);
      expect(focusedKey(), 'more/e3', reason: 'the card under it');
      expect(find.text('More from Season 1'), findsOneWidget);
      await up(tester);
      expect(focusedKey(), 'actions/show');
    });
  });

  group('Person', () {
    testWidgets('opens on the first title; the header steps away', (
      tester,
    ) async {
      await _open(tester, '/person/Steven%20Strait');
      expect(focusedKey(), 'grid/p0-actor');
      expect(find.text('Steven Strait'), findsOneWidget);
      await right(tester, 5);
      expect(focusedKey(), 'grid/p5-actor');
      await down(tester);
      expect(focusedKey(), 'grid/p7-actor', reason: 'the short last row');
      expect(find.text('Steven Strait'), findsNothing);
      await up(tester);
      expect(find.text('Steven Strait'), findsOneWidget);
    });

    testWidgets('a cast card opens their page', (tester) async {
      await _open(tester, '/title/s1');
      await down(tester, 3);
      expect(focusedKey(), 'people/Steven Strait-James Holden');
      await select(tester);
      expect(find.byType(TvPersonScreen), findsOneWidget);
      expect(focusedKey(), 'grid/p0-actor');
      await back(tester);
      expect(focusedKey(), 'people/Steven Strait-James Holden');
    });
  });

  for (final size in tvSizes) {
    final width = size.width.round();
    for (final (name, path) in [
      ('title', '/title/s1'),
      ('season', '/title/s1/season/1'),
      ('episode', '/episode/e2'),
      ('person', '/person/Steven%20Strait'),
    ]) {
      testWidgets('$name at $width', (tester) async {
        await _open(tester, path, size: size);
        await expectLater(
          find.byType(TvShell),
          matchesGoldenFile('../goldens/tv_${name}_$width.png'),
        );
      });
    }
  }
}
