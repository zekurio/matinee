import 'package:flutter/material.dart' show Material, MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/home/home_data.dart' show librariesProvider;
import 'package:matinee/screens/library/filter_sheet.dart';
import 'package:matinee/screens/library/list_choices.dart';
import 'package:matinee/screens/library/title_pages.dart';

const _list = (kind: null, genre: null, studio: null);

Library _library(String id, String name, String kind, int titles) => Library(
  id: id,
  name: name,
  kind: kind,
  paths: const [],
  itemCount: titles,
  titleCount: titles,
  metadataProvider: null,
  metadataLanguage: 'en',
  lastScannedAt: null,
  scanning: false,
  refreshing: false,
  backdrop: null,
);

final _options = TitleFilterOptions(
  genres: const [],
  studios: const [],
  ratings: const [],
  languages: const [],
  years: null,
  scores: null,
  runtime: null,
  watched: const TitleFilterOptionsWatched(
    unwatched: 2,
    inProgress: 1,
    watched: 3,
  ),
  total: 6,
  sorts: const [TitleSort.name],
);

/// The panel over [libraries], with the server offering the same filters for
/// every scope.
Future<ProviderContainer> _pump(
  WidgetTester tester,
  List<Library> libraries, {
  TitleFilterOptions? options,
}) async {
  tester.view.physicalSize = const Size(420, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [
      apiProvider.overrideWithValue(null),
      librariesProvider.overrideWith((ref) async => libraries),
      filterOptionsProvider.overrideWith(
        (ref, scope) async => options ?? _options,
      ),
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
        home: Material(
          child: MatineeTheme.wrap(
            matineeDark,
            const Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: 420,
                height: 900,
                child: SingleChildScrollView(
                  padding: EdgeInsets.all(20),
                  child: TitleFilterPanel(list: _list),
                ),
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

Finder _row(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

void main() {
  testWidgets('a single choice is one row, its name and value together', (
    tester,
  ) async {
    await _pump(tester, [
      _library('m1', 'Movies A', LibraryKind.movies, 12),
      _library('m2', 'Movies B', LibraryKind.movies, 8),
    ]);
    final type = find.byWidgetPredicate(
      (widget) => widget is OptionRow && widget.label == 'Type',
    );
    expect(type, findsOneWidget);
    expect(tester.getSize(type).height, 48);
    expect(
      (tester.getCenter(find.text('Type')).dy -
              tester.getCenter(find.text('All')).dy)
          .abs(),
      lessThan(1),
    );
    final semantics = tester.ensureSemantics();
    expect(find.bySemanticsLabel('Type, All'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('a section value ends where a compact row value does', (
    tester,
  ) async {
    await _pump(
      tester,
      [_library('m1', 'Movies A', LibraryKind.movies, 12)],
      options: const TitleFilterOptions(
        genres: [],
        studios: [],
        ratings: [],
        languages: [],
        years: FilterRange(min: 1990, max: 2024, step: 1),
        scores: null,
        runtime: null,
        watched: TitleFilterOptionsWatched(
          unwatched: 2,
          inProgress: 1,
          watched: 3,
        ),
        total: 6,
        sorts: [TitleSort.name],
      ),
    );
    expect(
      tester.getTopRight(find.text('All')).dx,
      moreOrLessEquals(
        tester.getTopRight(find.text('Any year')).dx,
        epsilon: 1,
      ),
    );
  });

  testWidgets('Type and Library narrow by kind, and drop the other library', (
    tester,
  ) async {
    final container = await _pump(tester, [
      _library('m1', 'Movies A', LibraryKind.movies, 12),
      _library('m2', 'Movies B', LibraryKind.movies, 8),
      _library('s1', 'Shows A', LibraryKind.shows, 5),
      _library('s2', 'Shows B', LibraryKind.shows, 3),
    ]);
    expect(find.text('Type'), findsOneWidget);
    expect(find.text('Library'), findsOneWidget);
    expect(find.text('All libraries'), findsOneWidget);

    // Pick a library of the movies, then the shows: the library goes back
    // to every library rather than keeping one of another kind.
    await tester.tap(_row('Library, All libraries'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Movies B'));
    await tester.pumpAndSettle();
    expect(container.read(choicesProvider(_list)).libraryId, 'm2');

    await tester.tap(_row('Type, All'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Shows').last);
    await tester.pumpAndSettle();
    expect(container.read(choicesProvider(_list)).kind, TitleKind.show);
    expect(container.read(choicesProvider(_list)).libraryId, isNull);
    expect(find.text('All libraries'), findsOneWidget);
    await tester.tap(_row('Library, All libraries'));
    await tester.pumpAndSettle();
    expect(find.text('Shows A'), findsOneWidget);
    expect(find.text('Shows B'), findsOneWidget);
    expect(find.text('Movies A'), findsNothing);
    expect(find.text('Movies B'), findsNothing);
  });

  testWidgets('Library hides when the type has only one library', (
    tester,
  ) async {
    await _pump(tester, [
      _library('m1', 'Movies A', LibraryKind.movies, 12),
      _library('m2', 'Movies B', LibraryKind.movies, 8),
      _library('s1', 'Shows A', LibraryKind.shows, 5),
    ]);
    expect(find.text('Library'), findsOneWidget);

    await tester.tap(_row('Type, All'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Shows').last);
    await tester.pumpAndSettle();
    expect(find.text('Library'), findsNothing);
    expect(find.text('All libraries'), findsNothing);
  });
}
