import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/home/home_screen.dart';
import 'package:matinee/screens/requests/catalog_screen.dart';
import 'package:matinee/screens/requests/requests_screen.dart';
import 'package:matinee/screens/search/search_screen.dart';
import 'package:matinee/screens/title/title_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';
import '../media/harness.dart' show loadFont, server;
import 'requests_backend.dart';

/// Where Back goes once a requested title arrives and its catalog page
/// gives way to the library's, from each way onto the catalog page, in the
/// app's own router.

final _dune = summaryJson(
  'd2',
  'Dune: Part Two',
  availability: stateJson('asked', requestId: 'r1', askedBySelf: true),
);

RequestsBackend _backend() => RequestsBackend()
  ..answers['/api/v1/libraries'] = [libraryJson('lib1', name: 'Movies')]
  ..answers['/api/v1/libraries/lib1/shelf'] = [
    shelfJson(titleJson('m1', name: 'Sicario', year: 2015)),
  ]
  ..answers['/api/v1/requests/mine'] = {
    'items': [requestJson('r1', _dune)],
    'nextCursor': null,
  }
  ..answers['/api/v1/catalog/details'] = detailJson(
    'd2',
    'Dune: Part Two',
    availability: _dune['availability']! as JsonMap,
  )
  ..answers['/api/v1/catalog/related'] = {'rails': <Object>[], 'stale': false};

final _catalog = Routes.catalog('movie', 'tmdb', 'd2');

/// The app, signed in, on Home; its router to move around in.
Future<GoRouter> _pumpApp(WidgetTester tester, RequestsBackend backend) async {
  tester.view.physicalSize = const Size(412, 915);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final scope = ProviderScope(
    overrides: [
      authStateProvider.overrideWithValue(
        SignedIn('$server', User.fromJson(userJson('ada'))),
      ),
      apiProvider.overrideWithValue(
        MatineeApi(base: server, client: backend.client),
      ),
      artworkLoaderProvider.overrideWithValue(
        ArtworkLoader(backend.client, const NoArtworkCache()),
      ),
      savedServersProvider.overrideWithValue(const []),
    ],
    child: const MatineeApp(),
  );
  await tester.pumpWidget(scope);
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(MatineeApp)))
      .read(routerProvider);
}

/// The server says Dune is here now, as title t9.
Future<void> _arrives(WidgetTester tester, RequestsBackend backend) async {
  backend.send([
    {
      'ref': catalogRefJson('d2'),
      'availability': stateJson('here', libraryTitleId: 't9'),
      'seasons': <Object>[],
    },
  ]);
  await tester.pumpAndSettle();
}

Future<void> _back(WidgetTester tester) async {
  expect(await tester.binding.handlePopRoute(), isTrue);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFont);
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  testWidgets('from a rail on Home, Back goes to Home', (tester) async {
    final backend = _backend();
    await _pumpApp(tester, backend);
    final card = find.text('Dune: Part Two').last;
    await tester.scrollUntilVisible(
      card,
      200,
      scrollable: find
          .descendant(
            of: find.byType(HomeScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.byType(CatalogScreen), findsOneWidget);
    await _arrives(tester, backend);
    expect(find.byType(CatalogScreen), findsNothing);
    expect(find.byType(TitleScreen), findsOneWidget);
    await _back(tester);
    expect(find.byType(TitleScreen), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  for (final (name, from, screen) in [
    ('Explore', Routes.search, SearchScreen),
    ('the requests page', Routes.requests(), RequestsScreen),
  ]) {
    testWidgets('from $name, Back goes to $name', (tester) async {
      final backend = _backend();
      final router = await _pumpApp(tester, backend);
      unawaited(router.push(from));
      await tester.pumpAndSettle();
      unawaited(router.push(_catalog));
      await tester.pumpAndSettle();
      await _arrives(tester, backend);
      expect(find.byType(TitleScreen), findsOneWidget);
      await _back(tester);
      expect(find.byType(TitleScreen), findsNothing);
      expect(find.byType(screen), findsOneWidget);
      await _back(tester);
      expect(find.byType(HomeScreen), findsOneWidget);
    });
  }

  testWidgets('from a link, the page has nothing under it and Back goes Home', (
    tester,
  ) async {
    final backend = _backend();
    final router = await _pumpApp(tester, backend);
    router.go(_catalog);
    await tester.pumpAndSettle();
    await _arrives(tester, backend);
    expect(find.byType(TitleScreen), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Back'));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets('under another page, it waits until the person is back on it', (
    tester,
  ) async {
    final backend = _backend()..details['x1'] = detailJson('x1', 'Contact');
    final router = await _pumpApp(tester, backend);
    unawaited(router.push(_catalog));
    await tester.pumpAndSettle();
    // A related title's page over it.
    unawaited(router.push(Routes.catalog('movie', 'tmdb', 'x1')));
    await tester.pumpAndSettle();
    expect(find.byType(CatalogScreen, skipOffstage: false), findsNWidgets(2));
    await _arrives(tester, backend);
    // The page on top stays; the one under it is still the catalog's.
    expect(router.state.uri.toString(), Routes.catalog('movie', 'tmdb', 'x1'));
    expect(find.byType(TitleScreen), findsNothing);
    await _back(tester);
    // Back on it, it gives way to the library's page.
    expect(find.byType(TitleScreen), findsOneWidget);
    expect(router.state.uri.toString(), Routes.title('t9'));
    await _back(tester);
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets('with the request sheet open, it waits for the sheet to close', (
    tester,
  ) async {
    final backend = _backend()
      ..details['sv'] = detailJson(
        'sv',
        'Severance',
        kind: 'show',
        seasons: [seasonJson(1, selected: true), seasonJson(2)],
      );
    final router = await _pumpApp(tester, backend);
    unawaited(router.push(Routes.catalog('show', 'tmdb', 'sv')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Request'));
    await tester.pumpAndSettle();
    expect(find.text('Request Severance'), findsOneWidget);
    backend.send([
      {
        'ref': catalogRefJson('sv', kind: 'show'),
        'availability': stateJson('here', libraryTitleId: 't7'),
        'seasons': <Object>[],
      },
    ]);
    await tester.pumpAndSettle();
    // The sheet the person is in stays until they close it.
    expect(find.text('Request Severance'), findsOneWidget);
    expect(find.byType(TitleScreen), findsNothing);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(find.byType(TitleScreen), findsOneWidget);
    await _back(tester);
    expect(find.byType(HomeScreen), findsOneWidget);
  });
}
