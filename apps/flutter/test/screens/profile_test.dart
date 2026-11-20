import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/profile/lists_screens.dart';
import 'package:matinee/screens/profile/profile_data.dart';
import 'package:matinee/screens/profile/profile_screen.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';
import '../media/harness.dart';
import 'home_backend.dart';

JsonMap _statsJson({String range = 'all', int plays = 12}) => {
  'range': range,
  'unit': 'month',
  'totals': {
    'watchSeconds': plays == 0 ? 0 : 45000,
    'plays': plays,
    'movies': plays == 0 ? 0 : 3,
    'episodes': plays == 0 ? 0 : 9,
    'shows': plays == 0 ? 0 : 2,
  },
  'buckets': [
    for (final (month, seconds) in [(9, 9000), (10, 0), (11, 36000)])
      {
        'start': '2026-${'$month'.padLeft(2, '0')}-01',
        'watchSeconds': seconds,
        'plays': 1,
      },
  ],
  'activity': plays == 0
      ? <Object>[]
      : [
          {'weekday': 5, 'hour': 21, 'watchSeconds': 7200},
          {'weekday': 6, 'hour': 14, 'watchSeconds': 1800},
        ],
  'genres': plays == 0
      ? <Object>[]
      : [
          {'name': 'Drama', 'watchSeconds': 30000},
        ],
  'titles': plays == 0
      ? <Object>[]
      : [
          {
            'title': titleJson('m1', name: 'Arrival'),
            'watchSeconds': 6960,
            'plays': 2,
          },
        ],
};

JsonMap _profileUser(String name, {String? avatar}) => {
  'id': 'id-$name',
  'username': name,
  'displayName': null,
  'role': 'user',
  'avatarId': avatar,
  'createdAt': '2025-11-03T10:00:00.000Z',
};

HomeBackend _backend({bool favorites = true}) {
  final show = titleJson('s1', kind: 'show', name: 'The Expanse');
  return HomeBackend()
    ..answers.addAll({
      '/api/v1/profiles/ada': {
        'user': _profileUser('ada'),
        'self': true,
        'sharing': {'favorites': false, 'stats': false},
        'favorites': favorites
            ? [
                {'kind': 'movie', 'title': titleJson('m1', name: 'Arrival')},
                {
                  'kind': 'showSeason',
                  'title': show,
                  'season': {
                    'number': 2,
                    'name': 'Season 2',
                    'overview': null,
                    'poster': null,
                    'itemCount': 13,
                    'watchedCount': 4,
                    'favorite': true,
                  },
                },
              ]
            : <Object>[],
        'recent': [
          {
            'item': itemJson(
              'e1',
              title: show,
              season: 2,
              episode: 5,
              episodeTitle: 'Home',
              position: 600,
            ),
            'watchedAt': '2026-11-19T20:00:00.000Z',
            'completed': false,
          },
        ],
      },
      '/api/v1/profiles/ada/stats': _statsJson(),
      '/api/v1/stats/leaderboard': {
        'range': 'all',
        'sharing': true,
        'boards': [
          {
            'metric': 'watchTime',
            'entries': [
              {
                'rank': 1,
                'user': _profileUser('grace'),
                'value': 90000,
                'self': false,
              },
              {
                'rank': 2,
                'user': _profileUser('ada'),
                'value': 40000,
                'self': true,
              },
            ],
          },
        ],
      },
      '/api/v1/profiles/ada/favorites': {
        'shows': <Object>[],
        'seasons': <Object>[],
        'episodes': <Object>[],
        'movies': [titleJson('m1', name: 'Arrival')],
      },
      '/api/v1/profiles/ada/recent': [
        {
          'item': itemJson('e1', title: show, season: 2, episode: 5),
          'watchedAt': '2026-11-19T20:00:00.000Z',
          'completed': false,
        },
      ],
    });
}

/// The server list the account rows name, which the session would keep.
final _servers = <Override>[
  savedServersProvider.overrideWithValue([
    SavedServer(
      origin: '$server/',
      address: '$server',
      name: null,
      user: User.fromJson(userJson('ada')),
      active: true,
    ),
  ]),
];

Finder _list() => find
    .descendant(
      of: find.byType(ProfileScreen),
      matching: find.byType(Scrollable),
    )
    .first;

void main() {
  setUpAll(() async {
    await loadFont();
    // The app's Material localizations load these; the harness has none.
    await initializeDateFormatting();
  });

  testWidgets('the profile shows the person, favorites, and statistics', (
    tester,
  ) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
    );
    expect(find.text('ada'), findsOneWidget);
    expect(find.text('Joined November 2025'), findsOneWidget);
    expect(find.text('Favorites'), findsOneWidget);
    expect(find.text('Season 2'), findsOneWidget);
    expect(find.text('12h 30m'), findsOneWidget);
    for (final text in [
      'Most watched',
      'Leaderboard',
      'ada (you)',
      'Viewing times',
      'Recently watched',
      'Switch server or account',
      'Sign out',
    ]) {
      await tester.scrollUntilVisible(
        find.text(text),
        200,
        scrollable: _list(),
      );
      expect(find.text(text), findsOneWidget);
    }
    // The hour comes from the locale's data, which may space it narrowly.
    expect(
      find.textContaining('Most often on Fridays around 9'),
      findsOneWidget,
    );
  });

  testWidgets('a range asks for its statistics', (tester) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
    );
    backend.answers['/api/v1/profiles/ada/stats'] = _statsJson(
      range: '30d',
      plays: 0,
    );
    await tester.scrollUntilVisible(
      find.text('30 days'),
      200,
      scrollable: _list(),
    );
    await tester.tap(find.text('30 days'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing watched in the last 30 days'), findsOneWidget);
    backend.answers['/api/v1/profiles/ada/stats'] = _statsJson();
    await tester.tap(find.text('Show all time'));
    await tester.pumpAndSettle();
    expect(find.text('12h 30m'), findsOneWidget);
  });

  testWidgets('touching a bar reads its month out', (tester) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
    );
    await tester.scrollUntilVisible(
      find.text('Watch time · All time'),
      200,
      scrollable: _list(),
    );
    final box = tester.getRect(
      find.byWidgetPredicate(
        (widget) =>
            widget is CustomPaint &&
            widget.painter.runtimeType.toString() == '_BarsPainter',
      ),
    );
    final gesture = await tester.startGesture(
      box.centerRight - const Offset(8, 0),
    );
    await tester.pump();
    expect(find.text('November 2026'), findsOneWidget);
    expect(find.text('10h'), findsOneWidget);
    await gesture.up();
    await tester.pump();
    expect(find.text('Watch time · All time'), findsOneWidget);
  });

  testWidgets('with no favorites it says how to make one', (tester) async {
    final backend = _backend(favorites: false);
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
    );
    expect(find.text('No favorites yet'), findsOneWidget);
  });

  testWidgets('a failed profile offers Try again', (tester) async {
    final backend = _backend()
      ..failing['/api/v1/profiles/ada'] = 'The database is down.';
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
    );
    expect(find.text("Couldn't load your profile"), findsOneWidget);
    // Signing out still works without the profile.
    expect(find.text('Sign out'), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Favorites'), findsOneWidget);
  });

  testWidgets('offline it is the person and the account', (tester) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const ProfileScreen(),
      client: backend.client,
      overrides: _servers,
      auth: Offline('$server', User.fromJson(userJson('ada'))),
    );
    expect(find.text('ada'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
    expect(backend.asked, isNot(contains('/api/v1/profiles/ada')));
  });

  testWidgets('Favorites lists each kind', (tester) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const FavoritesScreen(),
      client: backend.client,
      overrides: _servers,
    );
    expect(find.text('Movies'), findsOneWidget);
    expect(find.text('Shows'), findsNothing);
    await tester.tap(find.text('Arrival').first);
    await tester.pumpAndSettle();
    expect(find.text('/title/m1'), findsOneWidget);
  });

  testWidgets('Recently watched lists what was watched', (tester) async {
    final backend = _backend();
    await pumpScreen(
      tester,
      const RecentScreen(),
      client: backend.client,
      overrides: _servers,
    );
    expect(find.text('Recently watched'), findsOneWidget);
    expect(find.text('The Expanse'), findsOneWidget);
  });

  test('watch time and the scale read as the web has them', () {
    expect(scaleTop(0), 60);
    expect(scaleTop(25 * 60), 30 * 60);
    expect(scaleTop(7 * 3600), 10 * 3600);
    expect(scaleTop(130 * 3600), 200 * 3600);
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('the profile on a $name', (tester) async {
      final backend = _backend();
      await pumpScreen(
        tester,
        const ProfileScreen(),
        client: backend.client,
        size: size,
        colors: colors,
        overrides: _servers,
      );
      await expectLater(
        find.byType(ProfileScreen),
        matchesGoldenFile('goldens/profile_$name.png'),
      );
    });
  }
}
