import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/media/cards.dart';

import 'fixtures.dart';
import 'harness.dart';

/// Answers every picture with 404, recording what was asked.
MockClient noPictures(List<Uri> asked) => MockClient((request) async {
  asked.add(request.url);
  return http.Response('', 404);
});

Widget _column(List<Widget> cards) => ColoredBox(
  color: matineeDark.background,
  child: SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [for (final card in cards) SizedBox(width: 120, child: card)],
    ),
  ),
);

void main() {
  setUpAll(loadFont);

  testWidgets('a shelf card says what a show got and opens it', (tester) async {
    final show = titleJson('s1', kind: 'show', name: 'The Expanse');
    final episode = itemJson(
      'e9',
      title: show,
      season: 2,
      episode: 5,
      episodeTitle: 'Home',
    );
    final season = {
      'number': 2,
      'name': 'Season 2',
      'overview': null,
      'poster': null,
      'itemCount': 13,
      'watchedCount': 0,
      'favorite': false,
    };
    final entries = [
      shelfJson(titleJson('m1', name: 'Arrival')),
      shelfJson(show, added: {'count': 1, 'item': episode, 'season': season}),
      shelfJson(
        titleJson('s2', kind: 'show', name: 'Severance'),
        added: {'count': 3, 'item': episode, 'season': season},
      ),
      shelfJson(titleJson('s3', kind: 'show', name: 'Paterson'), count: 7),
    ].map(ShelfEntry.fromJson);
    await pumpScreen(
      tester,
      _column([for (final entry in entries) ShelfCard(entry: entry)]),
      client: noPictures([]),
    );
    expect(find.text('2016'), findsOneWidget);
    expect(find.text('S2, E5: Home'), findsOneWidget);
    expect(find.text('Season 2 · 3 new episodes'), findsOneWidget);
    expect(find.text('7 episodes'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('The Expanse, S2, E5: Home'));
    await tester.pumpAndSettle();
    expect(find.text('/episode/e9'), findsOneWidget);
  });

  testWidgets('an episode card names the show and the time left', (
    tester,
  ) async {
    final item = MediaItem.fromJson(
      itemJson(
        'e1',
        title: titleJson('s1', kind: 'show', name: 'The Expanse'),
        season: 2,
        episode: 5,
        episodeTitle: 'Home',
        position: 1800 - 12 * 60,
        duration: 1800,
      ),
    );
    await pumpScreen(
      tester,
      _column([EpisodeCard(item: item)]),
      client: noPictures([]),
    );
    expect(find.text('The Expanse'), findsOneWidget);
    expect(find.text('S2, E5: Home · 12 min left'), findsOneWidget);
    expect(find.byType(WatchProgressBar), findsOneWidget);
    await tester.tap(find.byType(WideCard));
    await tester.pumpAndSettle();
    expect(find.text('/episode/e1'), findsOneWidget);
  });

  testWidgets(
    'a person card fits the height a rail gives it at any text size',
    (tester) async {
      for (final scale in [1.0, 1.15, 1.3, 1.5, 2.0]) {
        final textScaler = TextScaler.linear(scale);
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: MediaQuery(
              data: MediaQueryData(textScaler: textScaler),
              child: MatineeTheme.wrap(
                matineeDark,
                Align(
                  alignment: Alignment.topLeft,
                  child: SizedBox(
                    width: 100,
                    height: PersonCard.height(100, textScaler),
                    child: const PersonCard(
                      name: 'Bradford Youngblood Junior the Third',
                      role: 'Director of Photography and Second Unit',
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull, reason: 'at $scale');
      }
    },
  );

  testWidgets('a picture tries the next source when one fails', (tester) async {
    final asked = <Uri>[];
    final item = MediaItem.fromJson(
      itemJson(
        'p1',
        title: titleJson('s1', kind: 'show', backdrop: 'bd'),
        season: 1,
        episode: 1,
        still: 'st',
      ),
    );
    await tester.runAsync(() async {
      await pumpScreen(
        tester,
        Center(
          child: SizedBox(
            width: 300,
            height: 169,
            child: Picture(landscapeSources(item)),
          ),
        ),
        client: noPictures(asked),
        settle: false,
      );
      // Each failed source makes way for the next on the event loop, so
      // wait for the third ask rather than for a time.
      final stop = DateTime.now().add(const Duration(seconds: 5));
      while (asked.length < 3 && DateTime.now().isBefore(stop)) {
        await Future<void>.delayed(Duration.zero);
        await tester.pump();
      }
    });
    expect(asked.map((url) => url.path), [
      '/api/artwork/st',
      '/api/media/p1/thumbnail',
      '/api/artwork/bd',
    ]);
    expect(asked.first.queryParameters['size'], 'small');
  });
}
