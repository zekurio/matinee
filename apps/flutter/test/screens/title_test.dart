import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/media/format.dart';
import 'package:matinee/media/watched_at.dart';
import 'package:matinee/screens/home/home_screen.dart';
import 'package:matinee/screens/title/episode_screen.dart';
import 'package:matinee/screens/title/season_screen.dart';
import 'package:matinee/screens/title/title_data.dart';
import 'package:matinee/screens/title/title_screen.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'home_backend.dart';
import 'title_backend.dart';

Finder _page() => find
    .byWidgetPredicate(
      (widget) =>
          widget is Scrollable && widget.axisDirection == AxisDirection.down,
    )
    .first;

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: _page());
  await tester.pumpAndSettle();
}

final _arrival = titleJson('m1', name: 'Arrival');
final _sicario = titleJson('m9', name: 'Sicario', year: 2015);

/// A movie with two files, the first half watched, two languages of
/// subtitles, its crew and cast, and a row of related titles.
TitleBackend _movie({bool watched = false}) {
  final first = fileJson(
    'f1',
    title: _arrival,
    probe: probeJson(subtitles: ['en', 'de']),
    position: 1800,
  );
  final second = fileJson(
    'f2',
    title: _arrival,
    probe: probeJson(
      resolution: '1080p',
      format: 'H.264',
      range: null,
      layout: 'Stereo',
    ),
    size: 2000000000,
  );
  return TitleBackend()
    ..answers.addAll({
      '/api/v1/titles/m1': fullTitleJson(
        'm1',
        name: 'Arrival',
        overview: 'A linguist works with the military to talk to aliens.',
        tagline: 'Why are they here?',
        next: first,
        watched: watched,
        studios: ['Lava Bear Films'],
        credits: [
          creditJson('actor', 'Amy Adams', role: 'Louise', tmdb: '9273'),
          creditJson('director', 'Denis Villeneuve', tmdb: '137427'),
        ],
        trailers: [
          {
            'url': 'https://youtu.be/tFMo3UJ4B4g',
            'name': 'Trailer',
            'language': 'en',
          },
        ],
      ),
      '/api/v1/media/f1/audio': [
        {
          'index': 1,
          'label': 'English',
          'language': 'en',
          'title': null,
          'codec': 'eac3',
          'format': 'E-AC-3',
          'channels': 6,
          'layout': '5.1',
          'primary': true,
        },
      ],
      '/api/v1/media/f1/subtitles': {
        'tracks': [
          for (final (language, label) in [('en', 'English'), ('de', 'German')])
            {
              'id': language,
              'label': label,
              'language': language,
              'title': null,
              'forced': false,
              'sdh': false,
              'default': false,
              'source': 'embedded',
              'format': 'srt',
              'delivery': null,
            },
        ],
        'audioLanguage': null,
      },
    })
    ..items['m1'] = {
      null: [first, second],
    }
    ..related = {
      'rails': [
        {'id': 'moreLikeThis', 'name': null},
      ],
      'stale': false,
    }
    ..relatedTitles['moreLikeThis'] = [
      {
        'ref': refJson('273481'),
        'name': 'Sicario',
        'year': 2015,
        'poster': null,
        'availability': hereJson('m9'),
        'title': _sicario,
      },
      {
        'ref': refJson('181886'),
        'name': 'Enemy',
        'year': 2013,
        'poster': null,
        'availability': availabilityJson('none'),
        'title': null,
      },
    ];
}

final _expanse = titleJson('s1', kind: 'show', name: 'The Expanse');

JsonMap _episode(
  int season,
  int number,
  String name, {
  double? position,
  bool completed = false,
}) => fileJson(
  'e$season$number',
  title: _expanse,
  season: season,
  episode: number,
  episodeTitle: name,
  position: position,
  completed: completed,
  overview: 'What happens in $name.',
);

/// A show of two seasons, the first watched, the second's second episode
/// in progress.
TitleBackend _show({bool oneSeason = false}) {
  final first = [
    _episode(1, 1, 'Dulcinea', completed: true),
    _episode(1, 2, 'The Big Empty', completed: true),
    _episode(1, 3, 'Remember the Cant', completed: true),
  ];
  final second = [
    _episode(2, 1, 'Safe', completed: true),
    _episode(2, 2, 'Doors & Corners', position: 1200),
    _episode(2, 3, 'Static'),
  ];
  return TitleBackend()
    ..answers.addAll({
      '/api/v1/titles/s1': fullTitleJson(
        's1',
        kind: 'show',
        name: 'The Expanse',
        overview: 'A detective and a ship captain find a conspiracy.',
        next: second[1],
        itemCount: oneSeason ? 3 : 6,
        seasons: [
          if (!oneSeason) seasonJson(1, watched: 3),
          seasonJson(2, watched: 1, overview: 'The war comes to Ganymede.'),
        ],
        credits: [
          creditJson('creator', 'Mark Fergus'),
          creditJson('actor', 'Steven Strait', role: 'James Holden'),
        ],
      ),
      '/api/v1/media/e22': second[1],
    })
    ..items['s1'] = {1: first, 2: second};
}

void main() {
  setUpAll(loadFont);

  testWidgets('a movie shows its heading, its file, and its crew', (
    tester,
  ) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    expect(find.text('Arrival'), findsOneWidget);
    expect(find.text('2016 · 1h 56m'), findsOneWidget);
    for (final badge in ['PG-13', '7.9', '2160p', 'HDR10', '5.1']) {
      expect(find.text(badge), findsOneWidget, reason: badge);
    }
    expect(
      find.textContaining('Why are they here?', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Denis Villeneuve'), findsOneWidget);
    expect(find.text('Lava Bear Films'), findsOneWidget);
    expect(find.text('2160p · HEVC · HDR10'), findsOneWidget);
    expect(find.text('English · 5.1'), findsOneWidget);
    expect(find.text('English, German'), findsOneWidget);
    expect(find.bySemanticsLabel('Resume, 30 min left'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Watch the trailer on YouTube'),
      findsOneWidget,
    );
  });

  testWidgets('a 360 wide phone fits Resume beside every round button', (
    tester,
  ) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
      size: const Size(360, 800),
    );
    // An overflow would have failed the pump; the button still reads whole.
    expect(find.bySemanticsLabel('Resume, 30 min left'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Watch the trailer on YouTube'),
      findsOneWidget,
    );
  });

  testWidgets('Resume plays the file the server names', (tester) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    await tester.tap(find.bySemanticsLabel('Resume, 30 min left'));
    await tester.pumpAndSettle();
    expect(find.text('/play/f1'), findsOneWidget);
  });

  testWidgets('the file picker picks what Play starts', (tester) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    await tester.tap(find.bySemanticsLabel(RegExp('^Choose a file, ')));
    await tester.pumpAndSettle();
    expect(find.text('2160p · HEVC · HDR10 · 5.1 · 4.2 GB'), findsNWidgets(2));
    await tester.tap(find.text('1080p · H.264 · Stereo · 2.0 GB'));
    await tester.pumpAndSettle();
    expect(find.text('1080p · H.264'), findsOneWidget);
    expect(find.text('HDR10'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Play'));
    await tester.pumpAndSettle();
    expect(find.text('/play/f2'), findsOneWidget);
  });

  testWidgets('marking watched asks when, sends it, and fetches again', (
    tester,
  ) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    await tester.tap(find.bySemanticsLabel('Mark watched'));
    await tester.pumpAndSettle();
    expect(find.text('Release date'), findsOneWidget);
    // The server has it watched from now on.
    backend.answers['/api/v1/titles/m1'] = _movie(watched: true)
        .answers['/api/v1/titles/m1'];
    await tester.tap(find.text('Release date'));
    await tester.pumpAndSettle();
    expect(backend.sent, hasLength(1));
    final (method, path, body) = backend.sent.single;
    expect((method, path), ('PUT', '/api/v1/titles/m1/watched'));
    expect(body, {'watched': true, 'watchedAt': 'released'});
    expect(find.bySemanticsLabel('Mark unwatched'), findsOneWidget);
    expect(backend.asked.where((p) => p == '/api/v1/titles/m1').length, 2);
  });

  testWidgets('a favorite the server refused goes back', (tester) async {
    final backend = _movie()..failing['/api/v1/titles/m1/favorite'] = 'No.';
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    await tester.tap(find.bySemanticsLabel('Add to favorites'));
    await tester.pumpAndSettle();
    expect(backend.asked, contains('/api/v1/titles/m1/favorite'));
    expect(find.bySemanticsLabel('Add to favorites'), findsOneWidget);
  });

  testWidgets('the cast opens a person, and related titles follow', (
    tester,
  ) async {
    final backend = _movie();
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    await _scrollTo(tester, find.text('More like this'));
    expect(find.text('Sicario'), findsWidgets);
    expect(find.text('Enemy'), findsWidgets);
    await _scrollTo(tester, find.text('Amy Adams'));
    await tester.tap(find.text('Amy Adams'));
    await tester.pumpAndSettle();
    expect(find.text('/person/Amy%20Adams?tmdb=9273'), findsOneWidget);
  });

  testWidgets('a title that failed says so and tries again', (tester) async {
    final backend = _movie()..failing['/api/v1/titles/m1'] = 'Gone.';
    await pumpScreen(
      tester,
      const TitleScreen(id: 'm1'),
      client: backend.client,
    );
    expect(find.text("Couldn't load this title"), findsOneWidget);
    expect(find.text('Gone.'), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Arrival'), findsOneWidget);
  });

  testWidgets('a show leads with what is next, then its seasons', (
    tester,
  ) async {
    final backend = _show();
    await pumpScreen(
      tester,
      const TitleScreen(id: 's1'),
      client: backend.client,
    );
    expect(find.text('2016 · 6 episodes · Ended'), findsOneWidget);
    expect(find.text('Mark Fergus'), findsOneWidget);
    expect(find.bySemanticsLabel('Mark all watched'), findsNothing);
    await _scrollTo(tester, find.text('Continue watching'));
    expect(find.text('Episode 2: Doors & Corners'), findsOneWidget);
    // The unwatched count on its poster follows the name.
    final second = find.bySemanticsLabel(RegExp(r'^Season 2, 3 episodes\s+2$'));
    await _scrollTo(tester, second);
    expect(find.text('Seasons'), findsOneWidget);
    await tester.tap(second);
    await tester.pumpAndSettle();
    expect(find.text('/title/s1/season/2'), findsOneWidget);
  });

  testWidgets("a one-season show lists its episodes on the show's page", (
    tester,
  ) async {
    final backend = _show(oneSeason: true);
    await pumpScreen(
      tester,
      const TitleScreen(id: 's1'),
      client: backend.client,
    );
    await _scrollTo(tester, find.text('Episodes'));
    expect(find.text('Seasons'), findsNothing);
    expect(find.text('Episode 2: Doors & Corners'), findsWidgets);
  });

  testWidgets('a season lists its episodes and plays the one in progress', (
    tester,
  ) async {
    final backend = _show();
    await pumpScreen(
      tester,
      const SeasonScreen(titleId: 's1', season: 2),
      client: backend.client,
    );
    expect(find.text('Season 2'), findsOneWidget);
    expect(find.text('3 episodes · 1 watched'), findsOneWidget);
    expect(
      find.text('The war comes to Ganymede.', findRichText: true),
      findsOneWidget,
    );
    await _scrollTo(tester, find.text('Static'));
    expect(find.text('Safe'), findsOneWidget);
    await _scrollTo(tester, find.text('More seasons'));
    expect(find.bySemanticsLabel('Season 1, 3 episodes'), findsOneWidget);
    await tester.tap(find.text('Static'));
    await tester.pumpAndSettle();
    expect(find.text('/episode/e23'), findsOneWidget);
  });

  testWidgets("a season's Play resumes its episode in progress", (
    tester,
  ) async {
    final backend = _show();
    await pumpScreen(
      tester,
      const SeasonScreen(titleId: 's1', season: 2),
      client: backend.client,
    );
    await tester.tap(find.bySemanticsLabel(RegExp('^Resume, ')));
    await tester.pumpAndSettle();
    expect(find.text('/play/e22'), findsOneWidget);
  });

  testWidgets('a season the show lacks says so', (tester) async {
    final backend = _show();
    await pumpScreen(
      tester,
      const SeasonScreen(titleId: 's1', season: 7),
      client: backend.client,
    );
    expect(find.text('The Expanse has no such season'), findsOneWidget);
  });

  testWidgets('an episode shows where it is and the rest of its season', (
    tester,
  ) async {
    final backend = _show();
    await pumpScreen(
      tester,
      const EpisodeScreen(id: 'e22'),
      client: backend.client,
    );
    expect(find.text('Season 2 · Episode 2'), findsOneWidget);
    expect(find.text('Doors & Corners'), findsOneWidget);
    await _scrollTo(tester, find.text('More from Season 2'));
    expect(find.text('Episode 3: Static'), findsOneWidget);
    expect(find.text('Episode 2: Doors & Corners'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Season 2').first);
    await tester.pumpAndSettle();
    expect(find.text('/title/s1/season/2'), findsOneWidget);
  });

  testWidgets('a long press on a Home card opens its menu', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    await tester.longPress(
      find.bySemanticsLabel('The Expanse, S2, E5: Home · 12 min left'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Play from the start'), findsOneWidget);
    expect(find.text('Go to The Expanse'), findsOneWidget);
    await tester.tap(find.text('Mark watched'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Just now'));
    await tester.pumpAndSettle();
    expect(backend.asked, contains('/api/v1/media/e1/watched'));
  });

  test('what the pages work out from what the server sends', () {
    final l = AppLocalizationsEn();
    expect(formatRuntime(116, l), '1h 56m');
    expect(formatRuntime(45, l), '45m');
    expect(
      trackLanguages([
        (language: 'en', title: 'Commentary', label: 'English (Commentary)'),
        (language: 'en-US', title: null, label: 'English'),
        (language: 'ja', title: 'Signs', label: 'Japanese (Signs)'),
        (language: null, title: null, label: 'Track 3'),
      ]),
      'English, JA',
    );
    final items = [
      for (final json in [
        _episode(1, 1, 'A', completed: true),
        _episode(1, 2, 'B'),
        _episode(1, 3, 'C', position: 60),
      ])
        MediaItem.fromJson(json),
    ];
    expect(seasonNext(items, null)?.id, 'e13');
    expect(seasonNext(items, items.first)?.id, 'e11');
    expect(seasonWatched(items), isFalse);
    final now = DateTime(2026, 11, 20, 9);
    expect(
      watchedAtOn(DateTime(2026, 11, 20), now: now),
      now.toUtc().toIso8601String(),
    );
    expect(
      watchedAtOn(DateTime(2026, 11, 1), now: now),
      DateTime(2026, 11, 1, 12).toUtc().toIso8601String(),
    );
  });

  for (final (name, screen, backend, size, colors)
      in <(String, Widget, TitleBackend Function(), Size, KitColors)>[
        (
          'movie_phone_dark',
          const TitleScreen(id: 'm1'),
          _movie,
          const Size(412, 915),
          matineeDark,
        ),
        (
          'show_tablet_light',
          const TitleScreen(id: 's1'),
          _show,
          const Size(1280, 800),
          matineeLight,
        ),
        (
          'season_phone_dark',
          const SeasonScreen(titleId: 's1', season: 2),
          _show,
          const Size(412, 915),
          matineeDark,
        ),
        (
          'episode_tablet_dark',
          const EpisodeScreen(id: 'e22'),
          _show,
          const Size(1280, 800),
          matineeDark,
        ),
      ]) {
    testWidgets('the $name', (tester) async {
      await pumpScreen(
        tester,
        screen,
        client: backend().client,
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byWidget(screen),
        matchesGoldenFile('goldens/title_$name.png'),
      );
    });
  }
}
