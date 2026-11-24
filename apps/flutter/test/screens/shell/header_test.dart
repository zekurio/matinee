import 'dart:convert';

import 'package:flutter/material.dart' show Material, MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/library/library_screen.dart';
import 'package:matinee/screens/library/list_choices.dart';
import 'package:matinee/screens/shell/shell.dart';

/// A signed-in account for the offline state the headers read.
const _user = User(
  id: 'user-1',
  username: 'viewer',
  displayName: null,
  role: 'user',
  permissions: [],
  avatarUrl: null,
  avatarSource: 'none',
  playback: null,
  library: LibraryPreferences(showSpecials: false),
  sharing: ProfileSharing(favorites: false, stats: false),
);

/// A bare header on a 400-wide page, as the shell lays it out: full width,
/// with no height of its own from the parent.
Future<void> _pump(
  WidgetTester tester,
  int index, {
  AuthState auth = const NoServer(),
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(auth),
        apiProvider.overrideWithValue(null),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: Material(
          child: MatineeTheme.wrap(
            matineeDark,
            Align(
              alignment: Alignment.topLeft,
              child: SizedBox(width: 400, child: ShellTopBar(index: index)),
            ),
          ),
        ),
      ),
    ),
  );
}

/// The server's answers for one library tab: 36 shows or movies, no
/// libraries, and the sorts the header's menu needs.
MatineeApi _libraryApi() {
  final filterOptions = TitleFilterOptions(
    genres: const [],
    studios: const [],
    ratings: const [],
    languages: const [],
    years: null,
    scores: null,
    runtime: null,
    watched: const TitleFilterOptionsWatched(
      unwatched: 0,
      inProgress: 0,
      watched: 0,
    ),
    total: 36,
    sorts: const [TitleSort.name, TitleSort.recent],
  ).toJson();
  final titles = const BrowsedTitles(
    items: [],
    total: 36,
    kinds: BrowsedTitlesKinds(movie: 0, show: 36),
  ).toJson();
  final client = MockClient(
    (request) async => switch (request.url.path) {
      '/api/v1/libraries' => http.Response('[]', 200),
      '/api/v1/titles/filter-options' => http.Response(
        jsonEncode(filterOptions),
        200,
      ),
      '/api/v1/titles/browse' => http.Response(jsonEncode(titles), 200),
      _ => http.Response('', 404),
    },
  );
  addTearDown(client.close);
  return MatineeApi(base: Uri.parse('https://media.test'), client: client);
}

/// The Media tab on a 400-wide page, with the server answering as it does
/// for the walk.
Future<ProviderContainer> _pumpLibrary(
  WidgetTester tester, {
  double textScale = 1,
  AuthState auth = const SignedIn('https://media.test', _user),
  String? initialKind,
}) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [
      authStateProvider.overrideWithValue(auth),
      apiProvider.overrideWithValue(_libraryApi()),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: Material(
          child: MatineeTheme.wrap(
            matineeDark,
            Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: 400,
                child: MediaScreen(initialKind: initialKind),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

/// A header action by the words a screen reader hears.
Finder _button(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

Finder _buttonStarting(String label) => find.byWidgetPredicate(
  (widget) =>
      widget is PressIndication && (widget.label?.startsWith(label) ?? false),
);

Finder _offlineMark(String label) => find.byWidgetPredicate(
  (widget) => widget is KitIcon && widget.label == label,
);

void main() {
  testWidgets('a Shows link starts Media on shows', (tester) async {
    final container = await _pumpLibrary(tester, initialKind: TitleKind.show);
    expect(
      container
          .read(choicesProvider((kind: null, genre: null, studio: null)))
          .kind,
      TitleKind.show,
    );
  });

  testWidgets('the header filter badge counts the filters on', (tester) async {
    final container = await _pumpLibrary(tester);
    expect(find.text('2'), findsNothing);
    container
        .read(
          tabChoicesProvider((kind: null, genre: null, studio: null)).notifier,
        )
        .filters(const ListFilters(genres: ['Drama', 'Comedy']));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    expect(_button('Filters, 2 on'), findsOneWidget);
  });

  testWidgets('the Media header keeps its actions on a phone at the largest '
      'text', (tester) async {
    await _pumpLibrary(tester, textScale: 3);
    for (final action in [
      _button('Filters'),
      _buttonStarting('Sort: '),
      _button('Search'),
      _button('Profile'),
    ]) {
      final rect = tester.getRect(action);
      expect(rect.left, greaterThanOrEqualTo(0));
      expect(rect.right, lessThanOrEqualTo(400));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('Downloads ends with the avatar, and Search offline', (
    tester,
  ) async {
    await _pump(tester, 2);
    expect(find.text('Downloads'), findsOneWidget);
    expect(find.byType(PressIndication), findsNothing);
    expect(_offlineMark('Offline'), findsNothing);

    await _pump(tester, 2, auth: const SignedIn('https://media.test', _user));
    expect(find.text('Downloads'), findsOneWidget);
    expect(_button('Profile'), findsOneWidget);
    expect(_button('Settings'), findsNothing);
    expect(_button('Search'), findsNothing);

    await _pump(tester, 2, auth: const Offline('https://media.test', _user));
    expect(find.text('Downloads'), findsOneWidget);
    expect(_button('Profile'), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(_offlineMark('Offline'), findsNothing);
  });

  testWidgets('the avatar opens the profile over the tab', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: Routes.home,
      routes: [
        GoRoute(
          path: Routes.home,
          builder: (context, state) => Material(
            child: MatineeTheme.wrap(
              matineeDark,
              const Align(
                alignment: Alignment.topLeft,
                child: SizedBox(width: 400, child: ShellTopBar(index: 0)),
              ),
            ),
          ),
        ),
        GoRoute(
          path: Routes.profile,
          builder: (context, state) => const Text('the profile'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWithValue(
            const SignedIn('https://media.test', _user),
          ),
          apiProvider.overrideWithValue(null),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ),
    );
    await tester.tap(_button('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('the profile'), findsOneWidget);
    expect(router.state.uri.path, Routes.profile);
  });
}
