import 'dart:async';
import 'dart:convert';

import 'package:flutter/rendering.dart' show RenderParagraph;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/requests/discover.dart' show QueueList;
import 'package:matinee/screens/tv/tv_browse.dart';
import 'package:matinee/screens/tv/tv_catalog.dart';
import 'package:matinee/screens/tv/tv_catalog_browse.dart';
import 'package:matinee/screens/tv/tv_discover.dart';
import 'package:matinee/screens/tv/tv_media.dart' show TvFocusLine;
import 'package:matinee/screens/tv/tv_requests.dart' show TvRequestPoster;
import 'package:matinee/screens/tv/tv_shell.dart';

import '../home_backend.dart';
import '../requests_backend.dart';
import 'tv_harness.dart';

/// The paths the requests' fake answers; Home's answers the rest.
const _requestPaths = [
  '/api/v1/requests',
  '/api/v1/admin/requests',
  '/api/v1/catalog',
  '/api/v1/discover',
  '/api/v1/recommendations/dismissed',
];

/// The last input sent to each path: a POST's body, a GET's query.
final _inputs = <String, Object?>{};

/// The viewer's requests after each cursor, answered in place of the
/// first page.
final _minePages = <String, JsonMap>{};

/// One server out of the two fakes, each path to the one that knows it.
http.Client _both(HomeBackend home, RequestsBackend requests) =>
    MockClient.streaming((request, body) async {
      final path = request.url.path;
      final to = _requestPaths.any(path.startsWith)
          ? requests.client
          : home.client;
      final bytes = await body.toBytes();
      final input = _inputs[path] = bytes.isEmpty
          ? request.url.queryParameters
          : jsonDecode(utf8.decode(bytes));
      final cursor = input is Map ? input['cursor'] : null;
      final page = path == '/api/v1/requests/mine' ? _minePages[cursor] : null;
      if (page != null) {
        return http.StreamedResponse(
          Stream.value(utf8.encode(jsonEncode(page))),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      final copy = http.Request(request.method, request.url)
        ..headers.addAll(request.headers)
        ..bodyBytes = bytes;
      return to.send(copy);
    });

JsonMap _rails({String? requests = 'mine', bool enabled = true}) => {
  'enabled': enabled,
  'requests': requests,
  'rails': enabled
      ? [discoverRailJson('popularFilms'), discoverRailJson('forYou')]
      : <Object>[],
  'browse': enabled ? ['movie', 'show'] : <Object>[],
};

JsonMap _row(List<JsonMap> items) => {
  'items': items,
  'stale': false,
  'detail': null,
};

JsonMap _mineJson(String id, String titleId, String name) => requestJson(
  id,
  summaryJson(
    titleId,
    name,
    availability: stateJson(
      'asked',
      action: 'cancel',
      requestId: id,
      askedBySelf: true,
    ),
  ),
);

/// Discover's server: the viewer's two requests, a row of films, and
/// Recommended for you.
RequestsBackend _discover({String? requests = 'mine'}) => RequestsBackend()
  ..answers['/api/v1/discover/rails'] = _rails(requests: requests)
  ..answers['/api/v1/catalog/related'] = {'rails': <Object>[], 'stale': false}
  ..mine = {
    'items': [
      _mineJson('r1', 'd2', 'Dune: Part Two'),
      _mineJson('r2', 'c1', 'Conclave'),
    ],
    'nextCursor': null,
  }
  ..rows['popularFilms'] = _row([
    browseTitleJson('d2', 'Dune: Part Two'),
    browseTitleJson('a1', 'Anora'),
  ])
  ..rows['forYou'] = _row([
    browseTitleJson('p1', 'Paterson'),
    browseTitleJson('p2', 'Past Lives'),
  ]);

/// The app on a TV at [path], with Home's server and [requests].
Future<HomeBackend> _open(
  WidgetTester tester,
  RequestsBackend requests, {
  String? path,
  bool admin = false,
  List<String> permissions = const [],
  HomeBackend? home,
}) async {
  final backend = home ?? HomeBackend();
  requests.answers.putIfAbsent(
    '/api/v1/requests/mine',
    () => backend.answers['/api/v1/requests/mine'],
  );
  await pumpTv(
    tester,
    backend,
    client: _both(backend, requests),
    admin: admin,
    permissions: permissions,
  );
  if (path != null) {
    GoRouter.of(tester.element(find.byType(TvShell))).go(path);
    await settle(tester);
  }
  return backend;
}

/// Lets the toasts run out.
Future<void> _toastsRunOut(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 10));
  await tester.pumpAndSettle();
}

void main() {
  loadTvFont();

  group('the drawer', () {
    for (final on in [true, false]) {
      testWidgets('Discover ${on ? 'shows' : "isn't there"} while it is '
          '${on ? 'on' : 'off'}', (tester) async {
        final requests = _discover()
          ..answers['/api/v1/discover/rails'] = _rails(enabled: on);
        await _open(tester, requests);
        await back(tester);
        expect(focusedLabel(), 'Home');
        await down(tester);
        expect(focusedLabel(), 'Favorites');
        await down(tester);
        if (!on) {
          expect(find.text('Discover'), findsNothing);
          expect(focusedLabel(), 'Movies');
          return;
        }
        expect(focusedLabel(), 'Discover', reason: 'after Favorites');
        await down(tester);
        expect(focusedLabel(), 'Movies', reason: 'before Movies');
        await up(tester);
        await select(tester);
        expect(find.byType(TvDiscoverScreen), findsOneWidget);
      });
    }
  });

  testWidgets('the rail holds its six pages at 960 by 540, closed and open', (
    tester,
  ) async {
    await _open(tester, _discover());
    const keys = [
      TvDrawerKeys.profile,
      TvDrawerKeys.search,
      TvDrawerKeys.home,
      TvDrawerKeys.favorites,
      TvDrawerKeys.discover,
      'kind-movie',
      'kind-show',
      TvDrawerKeys.settings,
    ];
    void expectFits(String state) {
      expect(tester.takeException(), isNull, reason: 'no overflow $state');
      final rects = [
        for (final key in keys)
          tester.getRect(
            find
                .descendant(
                  of: find.byType(TvDrawer),
                  matching: find.byKey(ValueKey(key)),
                )
                .first,
          ),
      ];
      for (var i = 1; i < rects.length; i++) {
        expect(
          rects[i].top,
          greaterThanOrEqualTo(rects[i - 1].bottom),
          reason: '${keys[i]} under ${keys[i - 1]} $state',
        );
      }
      expect(rects.first.top, greaterThanOrEqualTo(Overscan.vertical));
      expect(
        rects.last.bottom,
        lessThanOrEqualTo(540 - Overscan.vertical),
        reason: 'Settings inside the overscan $state',
      );
      // The pages sit right under the profile, at the same spacing.
      expect(rects[1].top - rects[0].bottom, closeTo(6, 1));
    }

    expectFits('closed');
    await back(tester);
    expect(focusedLabel(), 'Home', reason: 'the drawer is open');
    expectFits('open');
  });

  group('Discover', () {
    testWidgets('opens on the first request, and Down goes row by row', (
      tester,
    ) async {
      await _open(tester, _discover(), path: Routes.discover);
      expect(focusedKey(), 'requests/r1');
      expect(find.text('Requests'), findsWidgets);
      await down(tester);
      expect(focusedKey(), 'rail-popularFilms/movie:tmdb:d2');
      await down(tester);
      expect(focusedKey(), 'rail-forYou/movie:tmdb:p1');
      await up(tester, 2);
      expect(focusedKey(), 'requests/r1', reason: 'the card it left');
    });

    testWidgets('focus starts on the first row even when a later one '
        'loads first', (tester) async {
      final requests = _discover(requests: null);
      final gate = requests.rowGates['popularFilms'] = Completer<void>();
      await _open(tester, requests);
      GoRouter.of(tester.element(find.byType(TvShell))).go(Routes.discover);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.text('Paterson'), findsWidgets, reason: 'the later row');
      expect(
        focusedKey(),
        isNot(startsWith('rail-forYou')),
        reason: 'not in a row the first will push down',
      );
      gate.complete();
      await settle(tester);
      expect(focusedKey(), 'rail-popularFilms/movie:tmdb:d2');
    });

    group("the header's Requests chip", () {
      final line = find.descendant(
        of: find.byType(TvFocusLine),
        matching: find.byType(Text),
      );

      testWidgets('is up from the first row, and Down comes back to the card '
          'left', (tester) async {
        await _open(tester, _discover(), path: Routes.discover);
        await right(tester);
        expect(focusedKey(), 'requests/r2');
        await up(tester);
        expect(focusedKey(), 'header/requests');
        expect(focusedLabel(), 'Requests');
        expect(line, findsNothing, reason: 'the chip names no card');
        await down(tester);
        expect(focusedKey(), 'requests/r2', reason: 'the card it left');
        await up(tester);
        await select(tester);
        expect(find.text('My requests'), findsOneWidget);
        expect(await back(tester), isTrue);
        expect(focusedKey(), 'header/requests', reason: 'came back');
      });

      testWidgets('stays while the row hides for having no cards', (
        tester,
      ) async {
        final requests = _discover()
          ..mine = {'items': <Object>[], 'nextCursor': null};
        await _open(tester, requests, path: Routes.discover);
        expect(focusedKey(), 'rail-popularFilms/movie:tmdb:d2');
        expect(find.byKey(const ValueKey('requests')), findsNothing);
        await right(tester);
        await up(tester);
        expect(focusedKey(), 'header/requests');
        await down(tester);
        expect(focusedKey(), 'rail-popularFilms/movie:tmdb:a1');
      });

      testWidgets("isn't there when the server gives no Requests row", (
        tester,
      ) async {
        await _open(tester, _discover(requests: null), path: Routes.discover);
        expect(focusedKey(), 'rail-popularFilms/movie:tmdb:d2');
        expect(find.text('Requests'), findsNothing);
        await up(tester);
        expect(focusedKey(), 'rail-popularFilms/movie:tmdb:d2');
      });

      testWidgets("opens the queue's waiting list for the queue's row", (
        tester,
      ) async {
        final requests = _discover(requests: 'queue')..queue = queueJson();
        await _open(
          tester,
          requests,
          path: Routes.discover,
          permissions: const ['adminRequest.read', 'adminRequest.update'],
        );
        await up(tester);
        expect(focusedKey(), 'header/requests');
        await select(tester);
        expect(find.text('Needs attention'), findsOneWidget);
        expect(requests.sentPaths, isEmpty, reason: 'opening changes nothing');
      });
    });

    testWidgets('a row that failed offers Try again, and loads again', (
      tester,
    ) async {
      final requests = _discover();
      final row = requests.rows.remove('forYou')!;
      await _open(tester, requests, path: Routes.discover);
      await down(tester, 2);
      expect(find.text("This row didn't load."), findsOneWidget);
      expect(focusedKey(), 'rail-forYou/retry');
      requests.rows['forYou'] = row;
      await select(tester);
      expect(find.text("This row didn't load."), findsNothing);
      expect(find.text('Paterson'), findsWidgets);
    });

    testWidgets("a row's See all opens the browse grid with its sort", (
      tester,
    ) async {
      final requests = _discover()
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
      (requests.answers['/api/v1/discover/rails']! as JsonMap)['rails'] = [
        {
          ...discoverRailJson('popularFilms'),
          'browse': {
            'kinds': ['movie'],
            'filters': {
              'genres': [18],
              'yearFrom': 2020,
            },
            'sort': 'scoreHigh',
          },
        },
        discoverRailJson('forYou'),
      ];
      await _open(tester, requests, path: Routes.discover);
      await down(tester);
      await right(tester, 2);
      expect(focusedKey(), 'rail-popularFilms/see-all');
      expect(focusedLabel(), contains('See all'));
      expect(
        find.descendant(
          of: find.byType(TvFocusLine),
          matching: find.byType(Text),
        ),
        findsNothing,
        reason: "the line over the rows doesn't repeat the row's heading",
      );
      await select(tester);
      expect(find.byType(TvCatalogBrowseScreen), findsOneWidget);
      expect(requests.sentPaths, isEmpty, reason: 'browsing changes nothing');
      // SAFETY: the client sends the browse input as a JSON object.
      final browse = _inputs['/api/v1/discover/browse']! as Map;
      expect(browse['kind'], 'movie', reason: "the row's");
      expect(browse['filters'], {
        'genres': [18],
        'yearFrom': 2020,
      });
      expect(browse['sort'], 'scoreHigh', reason: "the row's");
      expect(focusedKey(), 'grid/movie:tmdb:b0');
      final line = find.descendant(
        of: find.byType(TvFocusLine),
        matching: find.byType(Text),
      );
      expect(line, findsWidgets, reason: 'it names the first card');
      await up(tester);
      expect(focusedKey(), 'controls/sort');
      expect(line, findsNothing, reason: 'the sort names no card');
      await right(tester);
      expect(focusedKey(), 'controls/filters');
      expect(line, findsNothing, reason: 'nor do the filters');
      await down(tester);
      expect(focusedKey(), 'grid/movie:tmdb:b0');
      expect(line, findsWidgets, reason: 'back on the card');
      expect(await back(tester), isTrue);
      expect(focusedKey(), 'rail-popularFilms/see-all', reason: 'came back');
    });

    testWidgets('Back from a catalog page comes back to the card', (
      tester,
    ) async {
      final requests = _discover()..details['a1'] = detailJson('a1', 'Anora');
      await _open(tester, requests, path: Routes.discover);
      await down(tester);
      await right(tester);
      expect(focusedKey(), 'rail-popularFilms/movie:tmdb:a1');
      await select(tester);
      expect(find.byType(TvCatalogScreen), findsOneWidget);
      expect(focusedKey(), 'actions/action', reason: 'on Request');
      expect(focusedLabel(), 'Request');
      expect(await back(tester), isTrue);
      expect(find.byType(TvDiscoverScreen), findsOneWidget);
      expect(focusedKey(), 'rail-popularFilms/movie:tmdb:a1');
    });

    testWidgets('Menu on a recommendation offers "Not interested"', (
      tester,
    ) async {
      final requests = _discover();
      await _open(tester, requests, path: Routes.discover);
      await down(tester, 2);
      expect(focusedKey(), 'rail-forYou/movie:tmdb:p1');
      await press(tester, LogicalKeyboardKey.contextMenu);
      expect(focusedLabel(), 'Not interested');
      await select(tester);
      expect(requests.sentPaths, ['/api/v1/recommendations/dismissed']);
      expect(find.text('Paterson'), findsNothing, reason: 'it left');
      expect(focusedKey(), 'rail-forYou/movie:tmdb:p2', reason: 'beside it');
      await _toastsRunOut(tester);
    });

    testWidgets('cancelling a request asks first, then focus moves on', (
      tester,
    ) async {
      final requests = _discover();
      await _open(tester, requests, path: Routes.discover);
      expect(focusedKey(), 'requests/r1');
      await select(tester);
      expect(focusedLabel(), 'Open title');
      await down(tester);
      expect(focusedLabel(), 'Cancel request');
      await select(tester);
      expect(find.text('Cancel your request for Dune: Part Two?'), findsOne);
      expect(focusedLabel(), 'Keep request', reason: 'the safe choice');
      await select(tester);
      expect(requests.sentPaths, isEmpty, reason: 'kept');
      expect(focusedKey(), 'requests/r1');

      await select(tester);
      await down(tester);
      await select(tester);
      await up(tester);
      expect(focusedLabel(), 'Cancel request');
      await select(tester);
      expect(requests.sentPaths, ['/api/v1/requests/cancel']);
      expect(find.byKey(const ValueKey('r1')), findsNothing, reason: 'left');
      expect(focusedKey(), 'requests/r2', reason: 'its neighbour');
      requests.sendMine({
        'items': [_mineJson('r2', 'c1', 'Conclave')],
        'nextCursor': null,
      });
      await _toastsRunOut(tester);
      expect(focusedKey(), 'requests/r2');
    });

    testWidgets("an admin's Add goes at once, and Decline asks why", (
      tester,
    ) async {
      final requests = _discover(requests: 'queue')
        ..queue = queueJson(
          waiting: [
            queueItemJson(
              'q1',
              summaryJson(
                'a1',
                'Anora',
                availability: stateJson('asked', requestId: 'q1'),
              ),
            ),
            queueItemJson(
              'q2',
              summaryJson(
                'c1',
                'Conclave',
                availability: stateJson('asked', requestId: 'q2'),
              ),
            ),
            queueItemJson(
              'q3',
              summaryJson(
                'n1',
                'Nosferatu',
                availability: stateJson('asked', requestId: 'q3'),
              ),
            ),
          ],
        );
      final waiting = (requests.queue['waiting']! as List).cast<JsonMap>();
      // The server's stream drops what was answered.
      void answered(String id) => requests.sendQueue(
        queueJson(waiting: [...waiting.where((item) => item['id'] != id)]),
      );
      await _open(tester, requests, path: Routes.discover, admin: true);
      expect(focusedKey(), 'requests/q1');
      await select(tester);
      expect(focusedLabel(), 'Add');
      await select(tester);
      expect(requests.sentPaths, ['/api/v1/admin/requests/approve']);
      expect(find.text('Add'), findsNothing, reason: 'nothing asked');
      expect(focusedKey(), 'requests/q2', reason: 'its neighbour');
      waiting.removeAt(0);
      answered('q1');
      await settle(tester);
      expect(focusedKey(), 'requests/q2');

      await select(tester);
      await down(tester);
      expect(focusedLabel(), 'Decline');
      await select(tester);
      expect(find.text('Decline Conclave'), findsOneWidget);
      expect(find.text('Already have it'), findsOneWidget);
      expect(find.text('Not for this server'), findsOneWidget);
      expect(focusedLabel(), contains('Already have it'));
      await down(tester);
      expect(focusedLabel(), contains('Not for this server'));
      await select(tester);
      await down(tester, 2);
      expect(focusedLabel(), 'Decline', reason: 'the panel\'s own');
      await select(tester);
      final (path, body) = requests.sent.last;
      expect(path, '/api/v1/admin/requests/decline');
      expect((body! as Map)['reason'], 'notForServer');
      expect(focusedKey(), 'requests/q3');
      answered('q2');
      await settle(tester);
      expect(find.text('Conclave'), findsNothing);
      expect(focusedKey(), 'requests/q3');
      await _toastsRunOut(tester);
    });

    testWidgets('Give up asks first, with Cancel focused', (tester) async {
      final requests = _discover(requests: 'queue')
        ..queue = queueJson(
          needsAttention: [
            queueItemJson(
              'q3',
              summaryJson('c1', 'Conclave'),
              status: 'approved',
              error: 'Radarr said the root folder is missing',
            ),
          ],
        );
      await _open(
        tester,
        requests,
        path: Routes.requests(QueueList.needsAttention),
        admin: true,
      );
      expect(focusedKey(), 'grid/q3');
      await select(tester);
      await down(tester);
      expect(focusedLabel(), 'Give up');
      await select(tester);
      expect(focusedLabel(), 'Cancel', reason: 'the safe choice');
      await select(tester);
      expect(requests.sentPaths, isEmpty);
      expect(focusedKey(), 'grid/q3');
    });
  });

  for (final (who, admin, permissions) in [
    ('runs the queue', false, ['adminRequest.read', 'adminRequest.update']),
    ('only reads it', false, ['adminRequest.read']),
  ]) {
    testWidgets(
      'an account that $who gets '
      '${who == 'runs the queue' ? "the queue's lists" : 'its own requests'}',
      (tester) async {
        final requests = _discover(requests: 'queue')..queue = queueJson();
        await _open(
          tester,
          requests,
          path: Routes.requests(QueueList.waiting),
          admin: admin,
          permissions: permissions,
        );
        final queue = who == 'runs the queue';
        expect(
          find.text('Needs attention'),
          queue ? findsOneWidget : findsNothing,
        );
      },
    );
  }

  group('My requests', () {
    /// What the line over the grid says.
    String lineText(WidgetTester tester) => tester
        .widgetList<Text>(
          find.descendant(
            of: find.byType(TvFocusLine),
            matching: find.byType(Text),
          ),
        )
        .map((text) => text.data ?? '')
        .join(' ');

    testWidgets("a grid of the row's cards, the line naming the focused one, "
        'with Up and Left to the tab shown', (tester) async {
      final requests = _discover()
        ..answers['/api/v1/requests/mine'] = {
          'items': [
            for (var i = 0; i < 10; i++) _mineJson('r$i', 't$i', 'Movie $i'),
          ],
          'nextCursor': null,
        };
      await _open(tester, requests, path: Routes.requests());
      expect(find.byType(TvPosterGrid), findsOneWidget);
      expect(find.byType(TvRequestPoster), findsNWidgets(10));
      expect(focusedKey(), 'grid/r0');
      expect(lineText(tester), contains('Movie 0'));
      expect(lineText(tester), contains('Waiting'), reason: 'its state');
      await right(tester, 3);
      expect(focusedKey(), 'grid/r3');
      expect(lineText(tester), contains('Movie 3'));
      await up(tester);
      expect(focusedKey(), 'tabs/inProgress', reason: 'the tab shown');
      await down(tester);
      expect(focusedKey(), 'grid/r3', reason: 'the card it left');
      await down(tester);
      expect(focusedKey(), 'grid/r9', reason: 'the last card, under it');
      await left(tester, 2);
      expect(focusedKey(), 'grid/r7');
      await left(tester);
      expect(focusedKey(), 'tabs/inProgress', reason: 'Left at the edge');
      await down(tester);
      expect(focusedKey(), 'grid/r7', reason: 'the card it left');
      await select(tester);
      expect(find.text('Open title'), findsOneWidget, reason: 'its panel');
      expect(await back(tester), isTrue);
      expect(focusedKey(), 'grid/r7');
      expect(requests.sentPaths, isEmpty);
    });

    testWidgets('an empty list keeps its sentence, focus on its tab', (
      tester,
    ) async {
      final requests = _discover()
        ..answers['/api/v1/requests/mine'] = {
          'items': <Object>[],
          'nextCursor': null,
        };
      await _open(tester, requests, path: Routes.requests());
      expect(find.text('Nothing on its way'), findsOneWidget);
      expect(focusedKey(), 'tabs/inProgress');
    });

    testWidgets('the next page comes as the end nears, as the browse grid '
        'has it', (tester) async {
      final requests = _discover()
        ..answers['/api/v1/requests/mine'] = {
          'items': [
            for (var i = 0; i < 28; i++) _mineJson('r$i', 't$i', 'Movie $i'),
          ],
          'nextCursor': 'p2',
        };
      _minePages['p2'] = {
        'items': [
          for (var i = 28; i < 32; i++) _mineJson('r$i', 't$i', 'Movie $i'),
        ],
        'nextCursor': null,
      };
      addTearDown(_minePages.clear);
      await _open(tester, requests, path: Routes.requests());
      expect(_inputs['/api/v1/requests/mine'], containsPair('cursor', 'p2'));
      await down(tester, 4);
      expect(focusedKey(), 'grid/r28', reason: 'a card of the next page');
      expect(find.byType(TvLoading), findsNothing, reason: 'the last page');
    });

    testWidgets("Down from a list's tab, before any of its cards had focus, "
        'lands on its first card, not the one under the tab', (tester) async {
      final requests = _discover(requests: 'queue')
        ..queue = queueJson(
          onTheWay: [
            for (var i = 0; i < 6; i++)
              queueItemJson(
                'o$i',
                summaryJson('t$i', 'Movie $i'),
                status: 'approved',
              ),
          ],
        );
      await _open(
        tester,
        requests,
        path: Routes.requests(QueueList.waiting),
        admin: true,
      );
      expect(focusedKey(), 'tabs/waiting', reason: 'Waiting is empty');
      await right(tester, 2);
      expect(focusedKey(), 'tabs/onTheWay');
      await select(tester);
      await down(tester);
      expect(focusedKey(), 'grid/o0');
      expect(requests.sentPaths, isEmpty);
    });

    testWidgets(
      "the queue's Add all is beside the tabs, and Up from under it still "
      'goes to the tab shown',
      (tester) async {
        final requests = _discover(requests: 'queue')
          ..queue = queueJson(
            waiting: [
              for (var i = 0; i < 9; i++)
                queueItemJson('q$i', summaryJson('t$i', 'Movie $i')),
            ],
          );
        await _open(
          tester,
          requests,
          path: Routes.requests(QueueList.waiting),
          admin: true,
        );
        expect(focusedKey(), 'grid/q0');
        expect(lineText(tester), contains('ben'), reason: 'who asked');
        await right(tester, 6);
        await up(tester);
        expect(focusedKey(), 'tabs/waiting');
        await right(tester, 4);
        expect(focusedLabel(), 'Add all 9');
        await down(tester);
        expect(focusedKey(), 'grid/q6', reason: 'the card it left');
        expect(requests.sentPaths, isEmpty);
      },
    );

    testWidgets('open on the first row, and a declined one says why', (
      tester,
    ) async {
      final requests = _discover()
        ..answers['/api/v1/requests/mine'] = {
          'items': [
            _mineJson('r1', 'd2', 'Dune: Part Two'),
            requestJson(
              'r4',
              summaryJson(
                'a1',
                'Anora',
                availability: stateJson(
                  'unavailable',
                  requestId: 'r4',
                  disabledReason: 'declined',
                  reason: {
                    'kind': 'declined',
                    'code': 'alreadyHere',
                    'note': 'It is on the shelf.',
                  },
                ),
              ),
            ),
          ],
          'nextCursor': null,
        };
      await _open(tester, requests, path: Routes.discover);
      await right(tester, 2);
      expect(focusedKey(), 'requests/see-all');
      await select(tester);
      expect(find.text('My requests'), findsOneWidget);
      expect(focusedKey(), 'grid/r1');
      final why = find.descendant(
        of: find.byType(TvFocusLine),
        matching: find.textContaining('Already have it. “It is on the shelf.”'),
      );
      expect(why, findsNothing, reason: 'the line names the focused one');
      await right(tester);
      expect(focusedKey(), 'grid/r4');
      expect(why, findsOneWidget);
      await up(tester);
      expect(focusedKey(), 'tabs/inProgress');
      await right(tester);
      await select(tester);
      expect(_inputs['/api/v1/requests/mine'], containsPair('filter', 'all'));
      expect(await back(tester), isTrue);
      expect(focusedKey(), 'requests/see-all', reason: 'came back');
    });
  });

  group('a catalog title', () {
    testWidgets('a movie is requested at once, and says so', (tester) async {
      final requests = _discover()
        ..details['m9'] = detailJson(
          'm9',
          'Arrival',
          overview: 'A linguist works with the military to talk to aliens.',
        )
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
      await _open(
        tester,
        requests,
        path: Routes.catalog('movie', 'tmdb', 'm9'),
      );
      expect(find.text('Arrival'), findsWidgets);
      expect(focusedLabel(), 'Request');
      await select(tester);
      expect(requests.sentPaths, ['/api/v1/requests/ask']);
      expect(find.text('Requested'), findsWidgets, reason: 'its state');
      expect(focusedLabel(), 'Cancel request', reason: 'the same button');
      await _toastsRunOut(tester);
    });

    testWidgets("a show's panel ticks the server's pick, and says it", (
      tester,
    ) async {
      final requests = _discover()
        ..details['sv'] = detailJson(
          'sv',
          'Severance',
          kind: 'show',
          seasons: [
            seasonJson(1, state: 'here', action: null, here: 9, aired: 9),
            seasonJson(2, selected: true),
            seasonJson(3),
          ],
        )
        ..answers['/api/v1/requests/ask'] = requestJson(
          'r10',
          summaryJson('sv', 'Severance', kind: 'show'),
          availability: stateJson('asked', action: 'cancel', requestId: 'r10'),
        );
      await _open(tester, requests, path: Routes.catalog('show', 'tmdb', 'sv'));
      expect(focusedLabel(), 'Request');
      await select(tester);
      expect(find.text('Request Severance'), findsOneWidget);
      expect(find.text('New seasons as they air'), findsOneWidget);
      final boxes = tester
          .widgetList<TvCheckBox>(find.byType(TvCheckBox))
          .map((box) => box.checked)
          .toList();
      expect(boxes, [true, false], reason: "season 2 is the server's pick");
      expect(find.text('Request season 2'), findsOneWidget);
      expect(focusedLabel(), contains('2'), reason: 'on the first askable');
      await down(tester);
      await select(tester);
      expect(find.text('Request 2 seasons'), findsOneWidget);
      await up(tester);
      await select(tester);
      expect(find.text('Request season 3'), findsOneWidget);
      await select(tester);
      expect(find.text('Request 2 seasons'), findsOneWidget);
      while (focusedLabel() != 'Request 2 seasons') {
        await down(tester);
      }
      await select(tester);
      final (path, body) = requests.sent.single;
      expect(path, '/api/v1/requests/ask');
      expect((body! as Map)['scope'], {
        'seasons': [2, 3],
        'future': true,
      });
      expect(find.text('Request Severance'), findsNothing, reason: 'closed');
      await _toastsRunOut(tester);
    });
  });

  testWidgets("the show's panel says each row whole in German", (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('de')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    final requests = _discover()
      ..details['sv'] = detailJson(
        'sv',
        'Severance',
        kind: 'show',
        seasons: [seasonJson(1, selected: true), seasonJson(2)],
      );
    await _open(tester, requests, path: Routes.catalog('show', 'tmdb', 'sv'));
    await select(tester);
    final future = find.text('Neue Staffeln, sobald sie laufen');
    expect(future, findsOneWidget);
    final text = tester.renderObject<RenderParagraph>(future);
    expect(text.didExceedMaxLines, isFalse, reason: 'cut at ${text.size}');
    expect(requests.sentPaths, isEmpty, reason: 'only opened');
  });

  group('the season panel', () {
    RequestsBackend show() => _discover()
      ..details['ah'] = detailJson(
        'ah',
        'American Horror Story',
        kind: 'show',
        seasons: [
          for (var number = 1; number <= 13; number++)
            seasonJson(number, selected: true),
          seasonJson(0),
        ],
      );

    List<bool> ticks(WidgetTester tester) => tester
        .widgetList<TvCheckBox>(find.byType(TvCheckBox))
        .map((box) => box.checked)
        .toList();

    testWidgets('Request opens it at once, with the same start each time, '
        "the web's: the server's pick", (tester) async {
      final requests = show();
      await _open(tester, requests, path: Routes.catalog('show', 'tmdb', 'ah'));
      // Along the seasons to their end and back up first, as on the TV.
      await down(tester);
      await right(tester, 13);
      await up(tester);
      expect(focusedLabel(), 'Request');
      final starts = <List<bool>>[];
      for (var open = 0; open < 2; open++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.select);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 16));
        expect(
          find.text('Request American Horror Story'),
          findsOneWidget,
          reason: 'open $open: shown within two frames',
        );
        await tester.pumpAndSettle();
        starts.add(ticks(tester));
        expect(find.text('Request 13 seasons'), findsOneWidget);
        expect(focusedLabel(), contains('Season 1'));
        await back(tester);
        expect(focusedLabel(), 'Request');
      }
      expect(starts[0], [for (var i = 0; i < 14; i++) i < 13]);
      expect(starts[1], starts[0]);
      expect(requests.sentPaths, isEmpty);
    });

    testWidgets("a season's card opens it for that season, and says so", (
      tester,
    ) async {
      final requests = show();
      await _open(tester, requests, path: Routes.catalog('show', 'tmdb', 'ah'));
      await down(tester);
      await right(tester, 4);
      expect(focusedLabel(), contains('Season 5'));
      await select(tester);
      expect(
        find.text('Request American Horror Story: Season 5'),
        findsOneWidget,
        reason: "the heading names the season, not the show's whole ask",
      );
      expect(ticks(tester), [for (var i = 1; i <= 14; i++) i == 5]);
      expect(find.text('Request season 5'), findsOneWidget);
      expect(requests.sentPaths, isEmpty);
    });
  });

  group('search', () {
    HomeBackend home() => HomeBackend()
      ..answers['/api/v1/search'] = {
        'users': <Object>[],
        'titles': <Object>[],
        'people': <Object>[],
        'genres': <Object>[],
        'studios': <Object>[],
      };

    RequestsBackend catalog() => _discover()
      ..answers['/api/v1/catalog/search'] = {
        'items': [
          summaryJson('b1', 'Blade Runner 2049', year: 2017),
          summaryJson('b2', 'Blade Runner', year: 1982),
        ],
        'nextPage': null,
        'stale': false,
      }
      ..details['b1'] = detailJson('b1', 'Blade Runner 2049');

    Future<void> type(WidgetTester tester, String text) async {
      await select(tester);
      await tester.enterText(find.byType(EditableText), text);
      await tester.pump(const Duration(milliseconds: 300));
      await settle(tester);
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await settle(tester);
    }

    testWidgets('"Not here yet" opens the catalog page', (tester) async {
      final requests = catalog();
      await _open(tester, requests, path: Routes.search, home: home());
      await type(tester, 'blade');
      expect(find.textContaining('Not here yet'), findsOneWidget);
      await down(tester);
      expect(focusedKey(), 'catalog/movie:tmdb:b1');
      await select(tester);
      expect(find.byType(TvCatalogScreen), findsOneWidget);
      expect(await back(tester), isTrue);
      expect(find.byType(TvSearchScreen), findsOneWidget);
      expect(focusedKey(), 'catalog/movie:tmdb:b1');
    });

    testWidgets('a failed catalog search offers Try again', (tester) async {
      final requests = catalog()
        ..failing['/api/v1/catalog/search'] = 'TMDB is down';
      await _open(tester, requests, path: Routes.search, home: home());
      await type(tester, 'blade');
      expect(find.text("Couldn't search the catalog"), findsOneWidget);
      await down(tester);
      expect(focusedKey(), 'catalog/retry');
      requests.failing.clear();
      await select(tester);
      expect(find.text("Couldn't search the catalog"), findsNothing);
      expect(find.text('Blade Runner 2049'), findsWidgets);
    });
  });
}
