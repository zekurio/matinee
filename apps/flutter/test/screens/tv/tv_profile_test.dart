import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/tv/tv_profile.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../../media/fixtures.dart';
import '../home_backend.dart';
import 'tv_harness.dart';

JsonMap _statsJson() => {
  'range': 'all',
  'unit': 'month',
  'totals': {
    'watchSeconds': 45000,
    'plays': 12,
    'movies': 3,
    'episodes': 9,
    'shows': 2,
  },
  'buckets': [
    for (final (month, seconds) in [(9, 9000), (10, 0), (11, 36000)])
      {
        'start': '2026-${'$month'.padLeft(2, '0')}-01',
        'watchSeconds': seconds,
        'plays': 1,
      },
  ],
  'activity': [
    {'weekday': 5, 'hour': 21, 'watchSeconds': 7200},
    {'weekday': 6, 'hour': 14, 'watchSeconds': 1800},
  ],
  'genres': [
    {'name': 'Drama', 'watchSeconds': 30000},
    {'name': 'Sci-Fi', 'watchSeconds': 9000},
  ],
  'titles': [
    {
      'title': titleJson('m1', name: 'Arrival'),
      'watchSeconds': 6960,
      'plays': 2,
    },
  ],
};

JsonMap _user(String name) => {
  'id': 'id-$name',
  'username': name,
  'displayName': null,
  'role': 'user',
  'avatarId': null,
  'createdAt': '2025-11-03T10:00:00.000Z',
};

HomeBackend _backend() {
  final show = titleJson('s1', kind: 'show', name: 'The Expanse');
  final watched = [
    for (final (id, episode) in [('e1', 5), ('e2', 4)])
      {
        'item': itemJson(
          id,
          title: show,
          season: 2,
          episode: episode,
          episodeTitle: 'Home',
          position: 600,
        ),
        'watchedAt': '2026-11-19T20:00:00.000Z',
        'completed': false,
      },
  ];
  return HomeBackend()
    ..answers.addAll({
      '/api/v1/profiles/ada': {
        'user': _user('ada'),
        'self': true,
        'sharing': {'favorites': false, 'stats': false},
        'favorites': <Object>[],
        'recent': watched,
      },
      '/api/v1/profiles/ada/stats': _statsJson(),
      '/api/v1/stats/leaderboard': {
        'range': 'all',
        'sharing': true,
        'boards': [
          for (final metric in ['watchTime', 'plays'])
            {
              'metric': metric,
              'entries': [
                {
                  'rank': 1,
                  'user': _user('grace'),
                  'value': 90000,
                  'self': false,
                },
                {'rank': 2, 'user': _user('ada'), 'value': 40000, 'self': true},
                {
                  'rank': 3,
                  'user': _user('linus'),
                  'value': 1000,
                  'self': false,
                },
              ],
            },
        ],
      },
      '/api/v1/profiles/ada/recent': watched,
    });
}

Future<void> _open(WidgetTester tester, String path, {Size? size}) async {
  await pumpTv(tester, _backend(), size: size ?? const Size(960, 540));
  final context = tester.element(find.byType(TvShell));
  GoRouter.of(context).go(path);
  await settle(tester);
}

void main() {
  loadTvFont();
  setUpAll(initializeDateFormatting);

  testWidgets('opens on the first card watched; Sign out is above', (
    tester,
  ) async {
    await _open(tester, Routes.profile);
    expect(find.byType(TvProfileScreen), findsOneWidget);
    expect(focusedKey(), 'recent/e1');
    await up(tester);
    expect(focusedKey(), 'actions/signOut');
    await down(tester);
    expect(focusedKey(), 'recent/e1', reason: 'the card it left');
    await right(tester, 2);
    expect(focusedKey(), 'recent/seeAll');
    await right(tester);
    expect(focusedKey(), 'recent/seeAll', reason: 'the end of the row');
  });

  testWidgets('Sign out asks first, with focus on Cancel', (tester) async {
    await _open(tester, Routes.profile);
    await up(tester);
    expect(focusedKey(), 'actions/signOut');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), 'Cancel');
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedKey(), 'actions/signOut');
    expect(find.byType(TvProfileScreen), findsOneWidget);
  });

  testWidgets("recent cards keep the row's width, as Kotlin's fixed cells", (
    tester,
  ) async {
    await _open(tester, Routes.recent);
    final cards = find.byType(TvWatchedCard);
    expect(cards, findsWidgets);
    expect(tester.getSize(cards.first).width, TvCards.landscapeWidth);
  });

  testWidgets('the chart takes the arrows until its edge', (tester) async {
    await _open(tester, Routes.profile);
    await down(tester);
    expect(focusedKey(), startsWith('ranges/'));
    await down(tester);
    expect(focusedKey(), 'watchTime/watchTime');
    // The newest bar first, read out over the chart.
    expect(find.textContaining('November 2026  ·'), findsOneWidget);
    expect(find.text('10h'), findsWidgets);
    await left(tester);
    expect(focusedKey(), 'watchTime/watchTime');
    expect(find.textContaining('October 2026  ·'), findsOneWidget);
    await right(tester);
    await right(tester);
    expect(focusedKey(), 'watchTime/watchTime', reason: 'nothing at right');
    await down(tester);
    expect(focusedKey(), 'top/m1', reason: 'the totals take no focus');
    await down(tester);
    expect(focusedKey(), 'genres/Drama');
  });

  testWidgets('a board opens in the panel on your place, and Back returns', (
    tester,
  ) async {
    await _open(tester, Routes.profile);
    await down(tester, 4);
    await down(tester);
    expect(focusedKey(), 'standing/watchTime');
    await select(tester);
    expect(tvOpenPanels.value, 1);
    expect(focusedLabel(), 'ada', reason: 'your own place');
    await up(tester);
    expect(focusedLabel(), 'grace');
    await back(tester);
    expect(tvOpenPanels.value, 0);
    expect(focusedKey(), 'standing/watchTime');
  });

  testWidgets('the viewing times move a mark by hour and by day', (
    tester,
  ) async {
    await _open(tester, Routes.profile);
    await down(tester, 6);
    expect(focusedKey(), 'viewingTimes/viewingTimes');
    expect(find.textContaining('Friday, 9'), findsOneWidget);
    await up(tester);
    expect(focusedKey(), 'viewingTimes/viewingTimes', reason: 'a day up');
    expect(find.textContaining('Thursday, 9'), findsOneWidget);
    await right(tester);
    expect(find.textContaining('Thursday, 10'), findsOneWidget);
  });

  testWidgets('See all opens the grid; Back returns to the card', (
    tester,
  ) async {
    await _open(tester, Routes.profile);
    await right(tester, 2);
    await select(tester);
    expect(find.byType(TvRecentScreen), findsOneWidget);
    expect(focusedKey(), 'grid/e1');
    await right(tester);
    expect(focusedKey(), 'grid/e2');
    await back(tester);
    expect(focusedKey(), 'recent/seeAll');
  });

  for (final size in tvSizes) {
    final width = size.width.round();
    testWidgets('the charts at $width', (tester) async {
      await _open(tester, Routes.profile, size: size);
      await down(tester, 2);
      await left(tester);
      await expectLater(
        find.byType(TvShell),
        matchesGoldenFile('../goldens/tv_profile_stats_$width.png'),
      );
    });
    for (final (name, path) in [
      ('profile', Routes.profile),
      ('recent', Routes.recent),
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
