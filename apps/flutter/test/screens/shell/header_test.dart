import 'dart:convert';

import 'package:flutter/material.dart' show Material, MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
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
      overrides: [authStateProvider.overrideWithValue(auth)],
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

/// The Shows or Movies tab on a 400-wide page, with the server answering as
/// it does for the walk.
Future<ProviderContainer> _pumpLibrary(
  WidgetTester tester,
  String kind, {
  double textScale = 1,
  Size size = const Size(400, 800),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [
      authStateProvider.overrideWithValue(const NoServer()),
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
                width: size.width,
                child: KindScreen(kind: kind),
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
  testWidgets('Home keeps the logo, settings, and search', (tester) async {
    await _pump(tester, 0);
    expect(find.byType(Logo), findsOneWidget);
    expect(_button('Settings'), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(find.byType(TabHeader), findsNothing);
  });

  testWidgets('Shows and Movies leave the header to the library tab', (
    tester,
  ) async {
    for (final index in [1, 2]) {
      await _pump(tester, index);
      expect(find.byType(TabHeader), findsNothing, reason: 'tab $index');
      expect(find.byType(PressIndication), findsNothing, reason: 'tab $index');
      expect(find.byType(Logo), findsNothing, reason: 'tab $index');
    }
  });

  testWidgets('Shows puts filter, sort and search in its header, not its row', (
    tester,
  ) async {
    await _pumpLibrary(tester, TitleKind.show);
    expect(find.byType(TabHeader), findsOneWidget);
    expect(find.text('Shows'), findsOneWidget);
    expect(_button('Filters'), findsOneWidget);
    expect(_buttonStarting('Sort: '), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(find.byType(ListBarButton), findsNothing);
    expect(find.text('0 titles'), findsOneWidget);

    // Filter, then Sort, then Search at the edge, all above the count line.
    final filter = tester.getCenter(_button('Filters')).dx;
    final sort = tester.getCenter(_buttonStarting('Sort: ')).dx;
    final search = tester.getCenter(_button('Search')).dx;
    expect(filter, lessThan(sort));
    expect(sort, lessThan(search));
    expect(search, lessThan(400));
    expect(
      tester.getCenter(_button('Search')).dy,
      lessThan(tester.getTopLeft(find.text('0 titles')).dy),
    );
  });

  testWidgets('the header filter badge counts the filters on', (tester) async {
    final container = await _pumpLibrary(tester, TitleKind.show);
    expect(find.text('2'), findsNothing);
    container
        .read(
          tabChoicesProvider((kind: TitleKind.show, genre: null, studio: null))
              .notifier,
        )
        .filters(const ListFilters(genres: ['Drama', 'Comedy']));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    expect(_button('Filters, 2 on'), findsOneWidget);
  });

  testWidgets(
    'the library header keeps its three actions at the largest text',
    (tester) async {
      await _pumpLibrary(tester, TitleKind.show, textScale: 3);
      for (final label in ['Filters', 'Search']) {
        expect(tester.getSize(_button(label)), const Size(44, 44));
      }
      expect(tester.getSize(_buttonStarting('Sort: ')), const Size(44, 44));
      expect(tester.getSize(find.byType(TabHeader)).height, ShellHeader.height);
      expect(find.text('0 titles'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final (name, size) in const [
    ('a phone', Size(400, 800)),
    ('a tablet upright', Size(800, 1280)),
    ('a tablet on its side', Size(1280, 800)),
  ]) {
    testWidgets('the library header fits $name at the largest text', (
      tester,
    ) async {
      await _pumpLibrary(tester, TitleKind.show, textScale: 3, size: size);
      expect(tester.getSize(find.byType(TabHeader)).height, ShellHeader.height);
      for (final label in ['Filters', 'Search']) {
        expect(tester.getSize(_button(label)), const Size(44, 44));
      }
      expect(tester.getSize(_buttonStarting('Sort: ')), const Size(44, 44));
      expect(
        tester.getRect(_button('Search')).right,
        lessThanOrEqualTo(size.width),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Downloads has no action, and says offline when it is', (
    tester,
  ) async {
    await _pump(tester, 3);
    expect(find.text('Downloads'), findsOneWidget);
    expect(find.byType(PressIndication), findsNothing);
    expect(_offlineMark('Offline'), findsNothing);

    await _pump(tester, 3, auth: const Offline('https://media.test', _user));
    expect(find.text('Downloads'), findsOneWidget);
    expect(find.byType(PressIndication), findsNothing);
    expect(_offlineMark('Offline'), findsOneWidget);
  });

  testWidgets('Profile offers settings only', (tester) async {
    await _pump(tester, 4);
    expect(find.text('Profile'), findsOneWidget);
    expect(_button('Settings'), findsOneWidget);
    expect(_button('Search'), findsNothing);
    expect(find.byType(Logo), findsNothing);
  });

  testWidgets('tab titles use the wordmark-sized heading', (tester) async {
    await _pump(tester, 3);
    final style = tester.widget<Text>(find.text('Downloads')).style!;
    expect(style.fontSize, KitText.px26.size);
    expect(style.fontWeight, FontWeight.w700);
  });

  testWidgets('the longest title and its action fit at the largest size', (
    tester,
  ) async {
    await _pump(tester, 3, textScale: 3);
    final band = tester.getRect(find.byType(ShellTopBar));
    final title = tester.getRect(find.text('Downloads'));
    expect(title.top, greaterThanOrEqualTo(band.top));
    expect(title.bottom, lessThanOrEqualTo(band.bottom));
    expect(find.text('Downloads'), findsOneWidget);
  });

  testWidgets('every header is the same height', (tester) async {
    for (final index in [0, 3, 4]) {
      await _pump(tester, index);
      expect(
        tester.getSize(find.byType(ShellTopBar)).height,
        ShellHeader.height,
        reason: 'tab $index',
      );
    }
  });
}
