import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/link_opener.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/requests/catalog_browse.dart';
import 'package:matinee/screens/requests/catalog_cards.dart' show AskedCard;
import 'package:matinee/screens/requests/catalog_screen.dart';
import 'package:matinee/screens/requests/requests_hub.dart' show mostFollowed;
import 'package:matinee/screens/requests/requests_screen.dart';
import 'package:matinee/screens/search/search_data.dart';
import 'package:matinee/screens/search/search_screen.dart';

import '../core/fakes.dart' show userJson;
import '../media/fixtures.dart' show titleJson;
import '../media/harness.dart';
import 'requests_backend.dart';

final _admin = SignedIn(
  '$server',
  User.fromJson({...userJson('ada'), 'role': 'admin'}),
);

/// [screen] with the app's toasts over it, as the app shows them.
Widget _withToasts(Widget screen) => Consumer(
  builder: (context, ref, _) => Stack(
    children: [
      Positioned.fill(child: screen),
      Align(
        alignment: Alignment.bottomCenter,
        child: ToastHost(state: ref.watch(toastProvider)),
      ),
    ],
  ),
);

/// Lets the toasts' Undo run out, which sends what they held.
Future<void> _undoRunsOut(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 7));
  await tester.pumpAndSettle();
}

final _dune = summaryJson(
  'd2',
  'Dune: Part Two',
  availability: stateJson(
    'asked',
    action: 'cancel',
    requestId: 'r1',
    askedBySelf: true,
  ),
);

RequestsBackend _explore() => RequestsBackend()
  ..answers['/api/v1/discover/rails'] = {
    'enabled': true,
    'rails': [
      discoverRailJson('popularFilms'),
      discoverRailJson('popularShows', kind: 'show'),
    ],
    'browse': ['movie', 'show'],
  }
  ..rows['popularFilms'] = {
    'items': [
      browseTitleJson(
        'd2',
        'Dune: Part Two',
        availability: _dune['availability']! as JsonMap,
      ),
      browseTitleJson('a1', 'Anora'),
      browseTitleJson(
        'c1',
        'Conclave',
        availability: stateJson('coming', progress: .4, requestId: 'r2'),
      ),
    ],
    'stale': false,
    'detail': null,
  }
  ..rows['popularShows'] = {
    'items': [
      browseTitleJson('s1', 'Severance', kind: 'show'),
      browseTitleJson('s2', 'Shogun', kind: 'show'),
    ],
    'stale': false,
    'detail': null,
  };

/// One request to answer, one that failed, and one on its way.
JsonMap _queue() => queueJson(
  waiting: [
    queueItemJson(
      'q1',
      summaryJson(
        'a1',
        'Anora',
        availability: stateJson('asked', requestId: 'q1'),
      ),
      followers: [
        followerJson('ben'),
        followerJson('cleo', at: daysAgo(1)),
      ],
    ),
    queueItemJson(
      'q2',
      summaryJson(
        's1',
        'Severance',
        kind: 'show',
        availability: stateJson('asked', requestId: 'q2'),
      ),
      connected: false,
    ),
  ],
  needsAttention: [
    queueItemJson(
      'q3',
      summaryJson('c1', 'Conclave'),
      status: 'approved',
      error: 'Radarr said the root folder is missing',
    ),
  ],
  onTheWay: [
    queueItemJson(
      'q4',
      summaryJson('n1', 'Nosferatu'),
      status: 'approved',
      availability: stateJson('coming', progress: .62),
    ),
  ],
);

void main() {
  setUpAll(loadFont);

  group('Explore', () {
    testWidgets('lists Discover under the empty field', (tester) async {
      final backend = _explore();
      await pumpScreen(tester, const SearchScreen(), client: backend.client);
      expect(find.text('Popular movies'), findsOneWidget);
      expect(find.text('Popular shows'), findsOneWidget);
      expect(find.text('Anora'), findsWidgets);
      // Only an admin has the way to the queue.
      expect(find.text('Requests'), findsNothing);
      expect(backend.asked, isNot(contains('/api/v1/admin/requests/live')));
      // The heading opens the row's browse.
      await tester.tap(find.text('Popular movies'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('/catalog-browse/movie?filters='),
        findsOneWidget,
      );
    });

    testWidgets('a row names its cards\' kind only when it can hold both', (
      tester,
    ) async {
      final backend = _explore();
      (backend.answers['/api/v1/discover/rails']! as JsonMap)['rails'] = [
        discoverRailJson('popularFilms'),
        {
          ...discoverRailJson('trending'),
          'browse': {
            'kinds': ['movie', 'show'],
            'filters': <String, Object?>{},
            'sort': 'popular',
          },
        },
      ];
      backend.rows['trending'] = {
        'items': [
          // One the library has, as its own card, beside the catalog's.
          browseTitleJson(
            'h1',
            'Arrival',
            availability: stateJson('here', libraryTitleId: 'm1'),
            title: titleJson('m1', name: 'Arrival', year: 2016),
          ),
          browseTitleJson('s3', 'Andor', kind: 'show'),
        ],
        'stale': false,
        'detail': null,
      };
      await pumpScreen(tester, const SearchScreen(), client: backend.client);
      // Films only: the year alone, as the library's cards say it.
      expect(find.text('2024'), findsWidgets);
      expect(find.text('2024 · Movie'), findsNothing);
      // Films and shows: every card says which, the library's too.
      expect(find.text('2016 · Movie'), findsOneWidget);
      expect(find.text('2024 · Show'), findsOneWidget);
    });

    testWidgets('an admin sees the requests that wait on them first', (
      tester,
    ) async {
      final backend = _explore()..queue = _queue();
      await pumpScreen(
        tester,
        const SearchScreen(),
        client: backend.client,
        auth: _admin,
      );
      expect(find.text('Requests'), findsOneWidget);
      // Two waiting and one that needs attention.
      expect(find.text('3'), findsOneWidget);
      await tester.tap(find.text('Requests'));
      await tester.pumpAndSettle();
      expect(find.text('/requests/waiting'), findsOneWidget);
    });

    testWidgets('Discover off leaves the page empty', (tester) async {
      final backend = RequestsBackend()
        ..answers['/api/v1/discover/rails'] = {
          'enabled': false,
          'rails': <Object>[],
          'browse': <Object>[],
        };
      await pumpScreen(tester, const SearchScreen(), client: backend.client);
      expect(find.byType(Rail), findsNothing);
      expect(backend.asked, isNot(contains('/api/v1/discover/row')));
    });

    for (final (name, size, colors, auth) in [
      ('phone_dark', const Size(412, 915), matineeDark, null),
      ('tablet_light_admin', const Size(1280, 800), matineeLight, _admin),
    ]) {
      testWidgets('Explore on a $name', (tester) async {
        final backend = _explore()..queue = _queue();
        await pumpScreen(
          tester,
          const SearchScreen(),
          client: backend.client,
          size: size,
          colors: colors,
          auth: auth,
        );
        await expectLater(
          find.byType(SearchScreen),
          matchesGoldenFile('goldens/explore_$name.png'),
        );
      });
    }
  });

  group('catalog search', () {
    RequestsBackend backend({List<JsonMap> library = const []}) => _explore()
      ..answers['/api/v1/libraries'] = <Object>[]
      ..answers['/api/v1/search'] = {
        'users': <Object>[],
        'titles': library,
        'people': <Object>[],
        'genres': <Object>[],
        'studios': <Object>[],
      }
      ..answers['/api/v1/catalog/search'] = {
        'items': [
          summaryJson('b1', 'Blade Runner 2049', year: 2017),
          summaryJson(
            'b2',
            'Blade Runner',
            year: 1982,
            availability: stateJson('asked', requestId: 'r5'),
          ),
          // Requests are off for this one, so it isn't offered.
          summaryJson(
            'b3',
            'Blade',
            availability: stateJson('none', disabledReason: 'off'),
          ),
        ],
        'nextPage': null,
        'stale': false,
      };

    Future<void> type(WidgetTester tester, String text) async {
      await tester.enterText(find.byType(EditableText), text);
      await tester.pump(searchDebounce);
      await tester.pumpAndSettle();
    }

    testWidgets('with nothing in the library, the catalog comes unheaded', (
      tester,
    ) async {
      final server = backend();
      await pumpScreen(tester, const SearchScreen(), client: server.client);
      await type(tester, 'blade');
      expect(find.text('Blade Runner 2049'), findsWidgets);
      expect(find.text('Blade Runner'), findsWidgets);
      expect(find.text('Blade'), findsNothing);
      expect(find.text('Not here yet'), findsNothing);
      expect(find.textContaining('No match'), findsNothing);
      await tester.tap(find.text('Blade Runner 2049').last);
      await tester.pumpAndSettle();
      expect(find.text('/catalog/movie/tmdb/b1'), findsOneWidget);
    });

    testWidgets('under the library, "Not here yet" with a count', (
      tester,
    ) async {
      final server = backend(
        library: [
          {
            'id': 't1',
            'libraryId': 'lib-movie',
            'kind': 'movie',
            'name': 'Blade Runner: The Final Cut',
            'year': 2007,
            'overview': null,
            'images': {'poster': null, 'backdrop': null, 'logo': null},
            'genres': <String>[],
            'rating': null,
            'contentRating': null,
            'runtimeMinutes': null,
            'originalLanguage': null,
            'favorite': false,
            'watched': false,
          },
        ],
      );
      await pumpScreen(tester, const SearchScreen(), client: server.client);
      await type(tester, 'blade');
      await tester.scrollUntilVisible(
        find.text('Not here yet'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Not here yet'), findsOneWidget);
      expect(find.text('2 titles'), findsOneWidget);
    });
  });

  group('a catalog title', () {
    RequestsBackend movie() => RequestsBackend()
      ..answers['/api/v1/catalog/details'] = detailJson(
        'm9',
        'Arrival',
        overview: 'A linguist works with the military to talk to aliens.',
      )
      ..answers['/api/v1/catalog/related'] = {
        'rails': [
          {'id': 'similar', 'name': null},
        ],
        'stale': false,
      }
      ..answers['/api/v1/catalog/related/titles'] = {
        'items': [
          {...summaryJson('x1', 'Contact', year: 1997), 'title': null},
        ],
        'stale': false,
      }
      ..answers['/api/v1/requests/ask'] = requestJson(
        'r9',
        summaryJson('m9', 'Arrival'),
        availability: stateJson(
          'asked',
          action: 'cancel',
          requestId: 'r9',
          askedBySelf: true,
        ),
      );

    const key = (
      kind: 'movie',
      provider: 'tmdb',
      providerId: 'm9',
      libraryId: null,
    );

    testWidgets('a movie is requested at once, and Undo takes it back', (
      tester,
    ) async {
      final backend = movie();
      await pumpScreen(
        tester,
        _withToasts(const CatalogScreen(catalogKey: key)),
        client: backend.client,
      );
      expect(find.text('Arrival'), findsOneWidget);
      await tester.tap(find.text('Request'));
      await tester.pumpAndSettle();
      expect(backend.sentPaths, ['/api/v1/requests/ask']);
      expect(find.text('Requested Arrival'), findsOneWidget);
      // The page shows the request at once.
      expect(find.text('Cancel request'), findsOneWidget);
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(backend.sentPaths, [
        '/api/v1/requests/ask',
        '/api/v1/requests/cancel',
      ]);
      await _undoRunsOut(tester);
    });

    testWidgets('arriving swaps in the library title', (tester) async {
      final backend = movie();
      await pumpScreen(
        tester,
        const CatalogScreen(catalogKey: key),
        client: backend.client,
      );
      backend.send([
        {
          'ref': catalogRefJson('m9'),
          'availability': stateJson('here', libraryTitleId: 't9'),
          'seasons': <Object>[],
        },
      ]);
      await tester.pumpAndSettle();
      expect(find.text('/title/t9'), findsOneWidget);
    });

    testWidgets('a show opens the sheet with the seasons', (tester) async {
      final backend = RequestsBackend()
        ..answers['/api/v1/catalog/details'] = detailJson(
          'sv',
          'Severance',
          kind: 'show',
          seasons: [
            seasonJson(1, state: 'here', action: null, here: 9, aired: 9),
            seasonJson(2, selected: true),
            seasonJson(3, state: 'release', action: null, aired: 0),
          ],
        )
        ..answers['/api/v1/catalog/related'] = {
          'rails': <Object>[],
          'stale': false,
        }
        ..answers['/api/v1/requests/ask'] = requestJson(
          'r10',
          summaryJson('sv', 'Severance', kind: 'show'),
          availability: stateJson('asked', action: 'cancel', requestId: 'r10'),
        );
      await pumpScreen(
        tester,
        _withToasts(
          const CatalogScreen(
            catalogKey: (
              kind: 'show',
              provider: 'tmdb',
              providerId: 'sv',
              libraryId: null,
            ),
          ),
        ),
        client: backend.client,
      );
      await tester.tap(find.text('Request'));
      await tester.pumpAndSettle();
      expect(find.text('Request Severance'), findsOneWidget);
      expect(find.text('New seasons as they air'), findsOneWidget);
      await expectLater(
        find.byType(Overlay).first,
        matchesGoldenFile('goldens/request_sheet_phone_dark.png'),
      );
      await tester.tap(find.text('Request season 2'));
      await tester.pumpAndSettle();
      final (path, body) = backend.sent.single;
      expect(path, '/api/v1/requests/ask');
      expect((body! as Map)['scope'], {
        'seasons': [2],
        'future': true,
      });
      // The sheet closed once the server took it.
      expect(find.text('Request Severance'), findsNothing);
      await _undoRunsOut(tester);
    });

    for (final (name, size, colors, auth) in [
      ('phone_dark', const Size(412, 915), matineeDark, null),
      ('tablet_light_admin', const Size(1280, 800), matineeLight, _admin),
    ]) {
      testWidgets('the page on a $name', (tester) async {
        final backend = movie();
        if (auth != null) {
          // An admin answers the waiting request from the page.
          backend
            ..answers['/api/v1/catalog/details'] = detailJson(
              'm9',
              'Arrival',
              overview: 'A linguist works with the military to talk to aliens.',
              availability: stateJson('asked', requestId: 'q9'),
            )
            ..queue = queueJson(
              waiting: [
                queueItemJson(
                  'q9',
                  summaryJson('m9', 'Arrival'),
                  followers: [followerJson('ben')],
                ),
              ],
            );
        }
        await pumpScreen(
          tester,
          const CatalogScreen(catalogKey: key),
          client: backend.client,
          size: size,
          colors: colors,
          auth: auth,
        );
        if (auth != null) {
          expect(find.text('Add'), findsOneWidget);
          expect(find.text('Decline'), findsOneWidget);
        }
        await expectLater(
          find.byType(CatalogScreen),
          matchesGoldenFile('goldens/catalog_$name.png'),
        );
      });
    }
  });

  group('browse', () {
    RequestsBackend browse() => RequestsBackend()
      ..answers['/api/v1/discover/browse/options'] = browseOptionsJson()
      ..answers['/api/v1/discover/browse'] = {
        'items': [
          for (var i = 0; i < 8; i++) browseTitleJson('b$i', 'Movie $i'),
        ],
        'nextPage': null,
        'stale': false,
        'voteFloor': 100,
        'detail': 'score',
      };

    testWidgets('lists the catalog, with filters in a sheet', (tester) async {
      final backend = browse();
      await pumpScreen(
        tester,
        const CatalogBrowseScreen(kind: 'movie'),
        client: backend.client,
      );
      expect(find.text('Movie 0'), findsWidgets);
      await expectLater(
        find.byType(CatalogBrowseScreen),
        matchesGoldenFile('goldens/browse_phone_dark.png'),
      );
      await tester.tap(find.bySemanticsLabel('Filters'));
      await tester.pumpAndSettle();
      expect(find.text('Genres'), findsOneWidget);
      expect(find.text('Drama'), findsOneWidget);
    });

    testWidgets("a row's filters come from the route", (tester) async {
      final backend = browse();
      await pumpScreen(
        tester,
        const CatalogBrowseScreen(
          kind: 'movie',
          filters: '{"genres":[18]}',
          sort: 'scoreHigh',
        ),
        client: backend.client,
      );
      expect(find.bySemanticsLabel('Filters, 1 on'), findsOneWidget);
    });
  });

  group('requests', () {
    RequestsBackend mine() => RequestsBackend()
      ..answers['/api/v1/requests/mine'] = {
        'items': [
          requestJson('r1', _dune),
          requestJson(
            'r2',
            summaryJson(
              'c1',
              'Conclave',
              availability: stateJson('coming', progress: .4, requestId: 'r2'),
            ),
          ),
          requestJson(
            'r3',
            summaryJson(
              'a1',
              'Anora',
              availability: stateJson(
                'unavailable',
                requestId: 'r3',
                disabledReason: 'declined',
                reason: {
                  'kind': 'declined',
                  'code': 'alreadyHere',
                  'note': 'It is on the shelf in the living room.',
                },
              ),
            ),
          ),
        ],
        'nextCursor': null,
      };

    testWidgets('a plain account sees its own, with why one was declined', (
      tester,
    ) async {
      final backend = mine()..queue = _queue();
      await pumpScreen(
        tester,
        // The queue's route sends them to their own.
        const RequestsScreen(list: 'waiting'),
        client: backend.client,
      );
      expect(find.text('My requests'), findsOneWidget);
      expect(find.text('Waiting'), findsNothing);
      expect(find.text('Dune: Part Two'), findsWidgets);
      expect(find.textContaining('Already have it.'), findsOneWidget);
      expect(backend.asked, isNot(contains('/api/v1/admin/requests/live')));
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      expect(
        backend.asked.where((path) => path == '/api/v1/requests/mine').length,
        2,
      );
    });

    testWidgets('a row is as tall as its cards, and a note has its lines', (
      tester,
    ) async {
      final backend = mine();
      await pumpScreen(
        tester,
        const RequestsScreen(),
        client: backend.client,
        size: const Size(412, 915),
      );
      final cards = find.byType(AskedCard);
      // A card without a note: its art and two lines.
      final row = tester.getSize(cards.at(0)).height;
      expect(
        row,
        lessThanOrEqualTo(
          CardMetrics.height(
            tester.getSize(cards.at(0)).width,
            CardMetrics.poster,
            TextScaler.noScaling,
          ),
        ),
      );
      // Two to a row: Dune and Conclave, then Anora, which was declined.
      final first = tester.getTopLeft(cards.at(0));
      expect(tester.getTopLeft(cards.at(1)).dy, first.dy);
      expect(
        tester.getTopLeft(cards.at(2)).dy - first.dy,
        row + CardGrid.runSpacing,
        reason: 'the first row has no note, so no room for one',
      );
      // Why, and the admin's note, each on lines of their own.
      final why = find.text('Already have it.');
      final note = find.text('It is on the shelf in the living room.');
      expect(why, findsOneWidget);
      expect(note, findsOneWidget);
      expect(
        tester.getTopLeft(note).dy,
        greaterThanOrEqualTo(tester.getBottomLeft(why).dy),
      );
    });

    testWidgets('a long list follows the cards near the screen', (
      tester,
    ) async {
      final backend = RequestsBackend()
        ..answers['/api/v1/requests/mine'] = {
          'items': [
            for (var i = 0; i < 150; i++)
              requestJson(
                'r$i',
                summaryJson(
                  'm$i',
                  'Movie $i',
                  availability: stateJson('asked', requestId: 'r$i'),
                ),
              ),
          ],
          'nextCursor': null,
        };
      await pumpScreen(
        tester,
        const RequestsScreen(),
        client: backend.client,
        size: const Size(412, 915),
      );
      // The first cards, not the whole list, which one stream can't take.
      expect(backend.followed.last, contains('m0'));
      expect(backend.followed.last, isNot(contains('m149')));
      await tester.scrollUntilVisible(
        find.byWidgetPredicate(
          (widget) => widget is AskedCard && widget.item.id == 'r149',
        ),
        600,
        scrollable: find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.pumpAndSettle();
      final last = backend.followed.last;
      expect(last, contains('m149'));
      expect(last, isNot(contains('m0')));
      expect(last.length, lessThanOrEqualTo(mostFollowed));
      // A card down there changes with the stream.
      backend.send([
        {
          'ref': catalogRefJson('m149'),
          'availability': stateJson('coming', progress: .5, requestId: 'r149'),
          'seasons': <Object>[],
        },
      ]);
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(RegExp(r'^Movie 149, On its way')),
        findsOneWidget,
      );
    });

    testWidgets('an admin adds one, held for Undo', (tester) async {
      final backend = RequestsBackend()..queue = _queue();
      await pumpScreen(
        tester,
        _withToasts(const RequestsScreen(list: 'waiting')),
        client: backend.client,
        auth: _admin,
      );
      expect(find.text('Add all 2'), findsOneWidget);
      expect(find.text('Radarr'), findsNothing);
      expect(find.text('No connection'), findsOneWidget);
      await tester.tap(find.text('Add').first);
      await tester.pumpAndSettle();
      // Held: gone from the list, nothing sent yet.
      expect(find.text('Anora'), findsNothing);
      expect(backend.sent, isEmpty);
      await _undoRunsOut(tester);
      expect(backend.sent.single.$1, '/api/v1/admin/requests/approve');
      expect((backend.sent.single.$2! as Map)['id'], 'q1');
    });

    group('an admin with libraries to choose from', () {
      JsonMap choosing() => queueJson(
        waiting: [
          queueItemJson(
            'q1',
            summaryJson(
              'a1',
              'Anora',
              availability: stateJson('asked', requestId: 'q1'),
            ),
            destinations: [
              destinationJson('lib1', 'Movies', selected: true),
              destinationJson('lib2', 'Movies in 4K', connection: 'Radarr 4K'),
            ],
          ),
          queueItemJson(
            'q2',
            summaryJson(
              'c1',
              'Conclave',
              availability: stateJson('asked', requestId: 'q2'),
            ),
          ),
        ],
      );

      Future<void> chooseFourK(WidgetTester tester) async {
        await tester.tap(find.text('Anora'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Goes to'));
        await tester.pumpAndSettle();
        // The libraries, each with what fills it, the current one ticked.
        expect(find.text('Radarr 4K'), findsOneWidget);
        await tester.tap(find.text('Movies in 4K'));
        await tester.pumpAndSettle();
      }

      testWidgets('sends Add to the library chosen under Goes to', (
        tester,
      ) async {
        final backend = RequestsBackend()..queue = choosing();
        await pumpScreen(
          tester,
          _withToasts(const RequestsScreen(list: 'waiting')),
          client: backend.client,
          auth: _admin,
        );
        await chooseFourK(tester);
        expect(find.textContaining('Movies in 4K'), findsOneWidget);
        await tester.tap(find.text('Add').first);
        await tester.pumpAndSettle();
        await _undoRunsOut(tester);
        expect(backend.sent.single.$1, '/api/v1/admin/requests/approve');
        expect(backend.sent.single.$2, {'id': 'q1', 'libraryId': 'lib2'});
      });

      testWidgets('Add all sends a moved one on its own', (tester) async {
        final backend = RequestsBackend()..queue = choosing();
        await pumpScreen(
          tester,
          _withToasts(const RequestsScreen(list: 'waiting')),
          client: backend.client,
          auth: _admin,
        );
        await chooseFourK(tester);
        await tester.tap(find.text('Add all 2'));
        await tester.pumpAndSettle();
        await _undoRunsOut(tester);
        expect(backend.sentPaths, [
          '/api/v1/admin/requests/approve',
          '/api/v1/admin/requests/approve-all',
        ]);
        expect(backend.sent[0].$2, {'id': 'q1', 'libraryId': 'lib2'});
        expect(backend.sent[1].$2, {
          'ids': ['q2'],
        });
      });

      testWidgets('the title page says where Add sends it', (tester) async {
        final backend = RequestsBackend()
          ..queue = choosing()
          ..answers['/api/v1/catalog/details'] = detailJson(
            'a1',
            'Anora',
            availability: stateJson('asked', requestId: 'q1'),
          )
          ..answers['/api/v1/catalog/related'] = {
            'rails': <Object>[],
            'stale': false,
          };
        await pumpScreen(
          tester,
          const CatalogScreen(
            catalogKey: (
              kind: 'movie',
              provider: 'tmdb',
              providerId: 'a1',
              libraryId: null,
            ),
          ),
          client: backend.client,
          auth: _admin,
        );
        expect(find.text('Add to Movies'), findsOneWidget);
        await tester.tap(
          find.bySemanticsLabel('Change where Anora goes, now Movies'),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Movies in 4K'));
        await tester.pumpAndSettle();
        expect(find.text('Add to Movies in 4K'), findsOneWidget);
        await expectLater(
          find.byType(CatalogScreen),
          matchesGoldenFile('goldens/catalog_goes_to_phone_dark.png'),
        );
      });

      testWidgets('the Goes to sheet', (tester) async {
        final backend = RequestsBackend()..queue = choosing();
        await pumpScreen(
          tester,
          const RequestsScreen(list: 'waiting'),
          client: backend.client,
          auth: _admin,
          size: const Size(412, 915),
        );
        await tester.tap(find.text('Anora'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Goes to'));
        await tester.pumpAndSettle();
        await expectLater(
          find.byType(Overlay).first,
          matchesGoldenFile('goldens/goes_to_sheet_phone_dark.png'),
        );
      });
    });

    testWidgets('a row opens its request in the connection, and what it says', (
      tester,
    ) async {
      final opened = <Uri>[];
      final backend = RequestsBackend()
        ..queue = queueJson(
          needsAttention: [
            queueItemJson(
              'q3',
              summaryJson('c1', 'Conclave'),
              status: 'approved',
              error: 'Radarr said the root folder is missing',
              remoteUrl: 'https://radarr.example/movie/12',
              diagnostics: [
                {'label': 'Queue status', 'value': 'warning'},
                {'label': 'Indexer', 'value': 'No results for 2160p'},
              ],
            ),
          ],
        );
      await pumpScreen(
        tester,
        const RequestsScreen(list: 'needsAttention'),
        client: backend.client,
        auth: _admin,
        overrides: [
          linkOpenerProvider.overrideWithValue((url) async => opened.add(url)),
        ],
      );
      await tester.tap(find.text('Conclave'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('What the connection reports'));
      await tester.pumpAndSettle();
      expect(find.text('Queue status'), findsOneWidget);
      expect(find.text('No results for 2160p'), findsOneWidget);
      // Away from the sheet, over the page.
      await tester.tapAt(const Offset(20, 20));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Conclave'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open in Radarr'));
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse('https://radarr.example/movie/12')]);
    });

    testWidgets('Undo keeps an answer from being sent', (tester) async {
      final backend = RequestsBackend()..queue = _queue();
      await pumpScreen(
        tester,
        _withToasts(const RequestsScreen(list: 'waiting')),
        client: backend.client,
        auth: _admin,
      );
      await tester.tap(find.text('Add').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(find.text('Anora'), findsWidgets);
      await _undoRunsOut(tester);
      expect(backend.sent, isEmpty);
    });

    testWidgets('an admin declines one with a reason and a note', (
      tester,
    ) async {
      final backend = RequestsBackend()..queue = _queue();
      await pumpScreen(
        tester,
        _withToasts(const RequestsScreen(list: 'waiting')),
        client: backend.client,
        auth: _admin,
      );
      await tester.tap(find.text('Anora').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decline'));
      await tester.pumpAndSettle();
      expect(find.text('Decline Anora'), findsOneWidget);
      await tester.tap(find.text('Not for this server'));
      await tester.enterText(find.byType(EditableText), 'Not this one');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decline').last);
      await tester.pumpAndSettle();
      await _undoRunsOut(tester);
      final (path, body) = backend.sent.single;
      expect(path, '/api/v1/admin/requests/decline');
      expect(body, containsPair('reason', 'notForServer'));
      expect(body, containsPair('note', 'Not this one'));
    });

    testWidgets('a failed request can be tried again', (tester) async {
      final backend = RequestsBackend()..queue = _queue();
      await pumpScreen(
        tester,
        const RequestsScreen(list: 'needsAttention'),
        client: backend.client,
        auth: _admin,
      );
      expect(
        find.text('Radarr said the root folder is missing'),
        findsOneWidget,
      );
      await tester.tap(find.bySemanticsLabel('Retry Conclave'));
      await tester.pumpAndSettle();
      expect(backend.sentPaths, ['/api/v1/admin/requests/retry']);
    });

    for (final (name, size, colors, auth, list) in [
      ('mine_phone_dark', const Size(412, 915), matineeDark, null, null),
      (
        'waiting_phone_dark',
        const Size(412, 915),
        matineeDark,
        _admin,
        'waiting',
      ),
      (
        'on_the_way_tablet_light',
        const Size(1280, 800),
        matineeLight,
        _admin,
        'onTheWay',
      ),
    ]) {
      testWidgets('requests, $name', (tester) async {
        final backend = mine()..queue = _queue();
        await pumpScreen(
          tester,
          RequestsScreen(list: list),
          client: backend.client,
          size: size,
          colors: colors,
          auth: auth,
        );
        await expectLater(
          find.byType(RequestsScreen),
          matchesGoldenFile('goldens/requests_$name.png'),
        );
      });
    }
  });
}
