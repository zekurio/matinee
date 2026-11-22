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
import 'package:matinee/media/avatar.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/library/library_screen.dart';
import 'package:matinee/screens/library/list_choices.dart';
import 'package:matinee/screens/library/title_grid.dart';
import 'package:matinee/screens/shell/header.dart';
import 'package:matinee/screens/shell/shell.dart';

/// A signed-in account for the offline state the headers read.
const _user = User(
  id: 'user-1',
  username: 'viewer',
  displayName: null,
  role: 'user',
  permissions: [],
  avatarId: null,
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
  Size size = const Size(400, 800),
  AuthState auth = const SignedIn('https://media.test', _user),
}) async {
  tester.view.physicalSize = size;
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
              child: SizedBox(width: size.width, child: const MediaScreen()),
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
  testWidgets('Home keeps the logo, search, and the avatar, and no Settings', (
    tester,
  ) async {
    await _pump(tester, 0, auth: const SignedIn('https://media.test', _user));
    expect(find.byType(Logo), findsOneWidget);
    expect(_button('Settings'), findsNothing);
    expect(_button('Search'), findsOneWidget);
    expect(_button('Profile'), findsOneWidget);
    expect(find.byType(TabHeader), findsNothing);

    final search = tester.getCenter(_button('Search')).dx;
    final avatar = tester.getCenter(_button('Profile'));
    expect(search, lessThan(avatar.dx));
    expect(tester.getSize(_button('Profile')), const Size(44, 44));
    expect(tester.getSize(find.byType(Avatar)), const Size(30, 30));
  });

  testWidgets('Media leaves the header to the tab', (tester) async {
    await _pump(tester, 1, auth: const SignedIn('https://media.test', _user));
    expect(find.byType(TabHeader), findsNothing);
    expect(find.byType(PressIndication), findsNothing);
    expect(find.byType(Logo), findsNothing);
  });

  testWidgets('Media puts filter, sort and search in its header', (
    tester,
  ) async {
    await _pumpLibrary(tester);
    expect(find.byType(TabHeader), findsOneWidget);
    expect(find.text('Media'), findsOneWidget);
    expect(_button('Filters'), findsOneWidget);
    expect(_buttonStarting('Sort: '), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(_button('Profile'), findsOneWidget);
    expect(find.byType(ListBarButton), findsNothing);
    expect(find.text('0 titles'), findsNothing);

    // Filter, then Sort, Search, and the avatar at the edge, all in the
    // header.
    final filter = tester.getCenter(_button('Filters')).dx;
    final sort = tester.getCenter(_buttonStarting('Sort: ')).dx;
    final search = tester.getCenter(_button('Search')).dx;
    final avatar = tester.getCenter(_button('Profile')).dx;
    expect(filter, lessThan(sort));
    expect(sort, lessThan(search));
    expect(search, lessThan(avatar));
    expect(avatar, lessThan(400));
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

  testWidgets('the Media header keeps its four actions at the largest text', (
    tester,
  ) async {
    await _pumpLibrary(tester, textScale: 3);
    for (final label in ['Filters', 'Search', 'Profile']) {
      expect(tester.getSize(_button(label)), const Size(44, 44));
    }
    expect(tester.getSize(_buttonStarting('Sort: ')), const Size(44, 44));
    expect(tester.getSize(find.byType(TabHeader)).height, ShellHeader.height);
    expect(tester.takeException(), isNull);
  });

  for (final (name, size) in const [
    ('a phone', Size(400, 800)),
    ('a tablet upright', Size(800, 1280)),
    ('a tablet on its side', Size(1280, 800)),
  ]) {
    testWidgets('the Media header fits $name at the largest text', (
      tester,
    ) async {
      await _pumpLibrary(tester, textScale: 3, size: size);
      expect(tester.getSize(find.byType(TabHeader)).height, ShellHeader.height);
      for (final label in ['Filters', 'Search', 'Profile']) {
        expect(tester.getSize(_button(label)), const Size(44, 44));
      }
      expect(tester.getSize(_buttonStarting('Sort: ')), const Size(44, 44));
      expect(
        tester.getRect(_button('Profile')).right,
        lessThanOrEqualTo(size.width),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Explore has its name, search, and the avatar', (tester) async {
    await _pump(tester, 3, auth: const SignedIn('https://media.test', _user));
    expect(find.text('Explore'), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(_button('Profile'), findsOneWidget);
    expect(_button('Settings'), findsNothing);
    expect(find.byType(TabHeader), findsOneWidget);
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
    expect(
      tester.getCenter(_button('Profile')).dx,
      greaterThan(tester.getCenter(find.text('Downloads')).dx),
    );

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

  testWidgets('tab titles use the wordmark-sized heading', (tester) async {
    await _pump(tester, 2);
    final style = tester.widget<Text>(find.text('Downloads')).style!;
    expect(style.fontSize, KitText.px26.size);
    expect(style.fontWeight, FontWeight.w700);
  });

  testWidgets('the longest title and its action fit at the largest size', (
    tester,
  ) async {
    await _pump(tester, 2, textScale: 3);
    final band = tester.getRect(find.byType(ShellTopBar));
    final title = tester.getRect(find.text('Downloads'));
    expect(title.top, greaterThanOrEqualTo(band.top));
    expect(title.bottom, lessThanOrEqualTo(band.bottom));
    expect(find.text('Downloads'), findsOneWidget);
  });

  testWidgets('every header is the same height', (tester) async {
    for (final index in [0, 2, 3]) {
      await _pump(tester, index);
      expect(
        tester.getSize(find.byType(ShellTopBar)).height,
        ShellHeader.height,
        reason: 'tab $index',
      );
    }
  });
}
