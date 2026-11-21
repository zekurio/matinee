import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/tv/tv_browse.dart';
import 'package:matinee/screens/tv/tv_media.dart';
import 'package:matinee/screens/tv/tv_shell.dart';

import '../../media/fixtures.dart';
import '../home_backend.dart';
import 'tv_harness.dart';

/// Home's server with [count] movies to browse, a few genres, favorites,
/// and search matches.
HomeBackend _backend({int count = 30}) => HomeBackend()
  ..answers.addAll({
    '/api/v1/titles/browse': {
      'items': [
        for (var i = 0; i < count; i++) titleJson('t$i', name: 'Movie $i'),
      ],
      'total': count,
      'kinds': {'movie': count, 'show': 2},
    },
    '/api/v1/titles/facets': {
      'genres': [
        {'name': 'Drama', 'titleCount': 12},
        {'name': 'Comedy', 'titleCount': 4},
      ],
      'studios': <Object>[],
    },
    '/api/v1/profiles/ada/favorites': {
      'shows': [
        titleJson('fs1', kind: 'show', name: 'Severance'),
        titleJson('fs2', kind: 'show', name: 'Andor'),
      ],
      'seasons': <Object>[],
      'episodes': <Object>[],
      'movies': [titleJson('fm1', name: 'Heat')],
    },
    '/api/v1/search': {
      'users': <Object>[],
      'titles': [
        titleJson('m1', name: 'Sicario'),
        titleJson('m4', name: 'Sicario: Day of the Soldado'),
      ],
      'people': [
        {
          'name': 'Denis Villeneuve',
          'photo': null,
          'kind': 'director',
          'titleCount': 3,
        },
      ],
      'genres': [
        {'name': 'Thriller', 'titleCount': 9},
      ],
      'studios': <Object>[],
    },
  });

Future<void> _open(
  WidgetTester tester,
  String path, {
  Size? size,
  int count = 30,
}) async {
  await pumpTv(
    tester,
    _backend(count: count),
    size: size ?? const Size(960, 540),
  );
  final context = tester.element(find.byType(TvShell));
  GoRouter.of(context).go(path);
  await settle(tester);
}

/// What of [box] can show on screen: its rect inside every clip above it.
Rect _shown(RenderBox box) {
  var rect = box.localToGlobal(Offset.zero) & box.size;
  for (RenderObject? node = box.parent; node != null; node = node.parent) {
    if (node is RenderClipRect && node.clipBehavior != Clip.none) {
      final clip = node.clipper?.getClip(node.size) ?? Offset.zero & node.size;
      rect = rect.intersect(
        MatrixUtils.transformRect(node.getTransformTo(null), clip),
      );
    }
  }
  return rect;
}

/// No poster shows above the grid's top, over its header or line, and at
/// [rest] each shows whole or not at all.
void _expectNothingAboveTheGrid({required bool rest}) {
  final top = find
      .descendant(
        of: find.byType(TvPosterGrid),
        matching: find.byType(CustomScrollView),
      )
      .evaluate()
      .single
      .renderObject!;
  final gridTop = (top as RenderBox).localToGlobal(Offset.zero).dy;
  for (final element in find.byType(TvPosterCard).evaluate()) {
    final box = element.renderObject! as RenderBox;
    final whole = box.localToGlobal(Offset.zero) & box.size;
    final shown = _shown(box);
    if (shown.isEmpty || shown.height <= 0 || shown.width <= 0) continue;
    expect(
      shown.top,
      greaterThanOrEqualTo(gridTop - 1),
      reason: 'a poster shows above the grid, over its header',
    );
    if (rest) {
      expect(
        shown.height,
        closeTo(whole.height, 1),
        reason: 'a poster sliced at the top at rest',
      );
    }
  }
}

void main() {
  loadTvFont();

  group('Movies', () {
    testWidgets('opens on the first poster, and rows run to their ends', (
      tester,
    ) async {
      await _open(tester, Routes.movies);
      expect(focusedKey(), 'grid/t0');
      expect(find.text('Movies'), findsWidgets);
      await right(tester, 6);
      expect(focusedKey(), 'grid/t6');
      await right(tester);
      expect(focusedKey(), 'grid/t6', reason: 'the end of the row');
      await down(tester, 3);
      expect(focusedKey(), 'grid/t27');
      await down(tester);
      expect(focusedKey(), 'grid/t29', reason: 'the last row is short');
      await down(tester);
      expect(focusedKey(), 'grid/t29', reason: 'nothing under it');
      // The focused card is on screen.
      final card = tester.getRect(find.bySemanticsLabel('Movie 29'));
      expect(card.bottom, lessThanOrEqualTo(540));
      expect(card.top, greaterThan(0));
    });

    testWidgets('the header steps away past the first row and comes back', (
      tester,
    ) async {
      await _open(tester, Routes.movies);
      expect(find.text('Name'), findsOneWidget);
      await down(tester);
      expect(find.text('Name'), findsNothing, reason: 'the controls went');
      await up(tester);
      expect(find.text('Name'), findsOneWidget);
      await up(tester);
      expect(focusedLabel(), 'Name', reason: 'the sort button');
    });

    testWidgets('rows scroll away whole, never over the header', (
      tester,
    ) async {
      await _open(tester, Routes.movies, count: 70);
      Future<void> step(LogicalKeyboardKey key) async {
        await tester.sendKeyEvent(key);
        // Through the header's step away and the scroll, frame by frame.
        for (var i = 0; i < 8; i++) {
          await tester.pump(const Duration(milliseconds: 40));
          _expectNothingAboveTheGrid(rest: false);
        }
        await settle(tester);
        _expectNothingAboveTheGrid(rest: true);
      }

      for (var row = 1; row < 9; row++) {
        await step(LogicalKeyboardKey.arrowDown);
        expect(focusedKey(), 'grid/t${row * 7}');
      }
      expect(find.text('Name'), findsNothing, reason: 'the header went');
      for (var row = 7; row >= 0; row--) {
        await step(LogicalKeyboardKey.arrowUp);
        expect(focusedKey(), 'grid/t${row * 7}');
      }
      await up(tester);
      expect(focusedLabel(), 'Name', reason: 'the header came back whole');
    });

    testWidgets('the header controls rest on a fill the backdrop keeps', (
      tester,
    ) async {
      await _open(tester, Routes.movies);
      final onPicture = TvFocus.restOnPicture(
        MatineeTheme.of(tester.element(find.byType(TvShell))),
      );
      Color? rest(Finder inside) => tester
          .widget<TvControl>(
            find.ancestor(of: inside, matching: find.byType(TvControl)).first,
          )
          .rest;
      expect(rest(find.text('Name')), onPicture, reason: 'the sort');
      expect(rest(find.text('Any genre')), onPicture);
      expect(
        tester
            .widget<TvControl>(
              find.descendant(
                of: find.byType(TvSearchField),
                matching: find.byType(TvControl),
              ),
            )
            .rest,
        onPicture,
        reason: 'the search field',
      );
    });

    testWidgets('the sort panel opens on its choice and gives focus back', (
      tester,
    ) async {
      await _open(tester, Routes.movies);
      await up(tester);
      expect(focusedLabel(), 'Name');
      await select(tester);
      expect(find.text('Sort'), findsOneWidget);
      expect(focusedLabel(), 'Name', reason: 'the choice in force');
      await down(tester);
      expect(focusedLabel(), 'Recently added');
      await back(tester);
      expect(find.text('Sort'), findsNothing);
      expect(focusedLabel(), 'Name', reason: 'back on the button');
      await select(tester);
      await down(tester);
      await select(tester);
      expect(find.text('Recently added'), findsOneWidget);
      expect(focusedLabel(), 'Recently added', reason: 'the button, renamed');
    });

    testWidgets('Left from the first column opens the drawer', (tester) async {
      await _open(tester, Routes.movies);
      await down(tester);
      await left(tester);
      expect(focusedLabel(), 'Movies', reason: "the page's own entry");
      await right(tester);
      expect(focusedKey(), 'grid/t7');
    });
  });

  group('Favorites', () {
    testWidgets('a row for each kind, focus on the first', (tester) async {
      await _open(tester, Routes.favorites);
      expect(focusedKey(), 'shows/fs1');
      expect(find.text('Severance'), findsWidgets);
      await right(tester);
      await down(tester);
      expect(focusedKey(), 'movies/fm1');
      await up(tester);
      expect(focusedKey(), 'shows/fs2');
    });
  });

  group('Search', () {
    testWidgets('typing finds titles; Down goes to the first match', (
      tester,
    ) async {
      await _open(tester, Routes.search);
      expect(focusedLabel(), 'Search movies, shows, people, and more');
      await select(tester);
      await tester.enterText(find.byType(EditableText), 'sicario');
      await tester.pump(const Duration(milliseconds: 300));
      await settle(tester);
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await settle(tester);
      expect(find.text('Sicario'), findsWidgets);
      await down(tester);
      expect(focusedKey(), 'lib-lib-movie/m1');
      await down(tester);
      expect(focusedKey(), 'people/Denis Villeneuve');
      await down(tester);
      expect(focusedKey(), 'genres/Thriller');
      await up(tester, 3);
      expect(focusedKey(), 'field/field');
    });

    testWidgets('Back while typing ends the typing and keeps the page', (
      tester,
    ) async {
      await _open(tester, Routes.search);
      await select(tester);
      await tester.enterText(find.byType(EditableText), 'sicario');
      await tester.pump(const Duration(milliseconds: 300));
      await settle(tester);
      expect(await back(tester), isTrue);
      expect(find.byType(TvSearchScreen), findsOneWidget, reason: 'stays');
      expect(focusedLabel(), 'Search movies, shows, people, and more');
      expect(find.text('Sicario'), findsWidgets, reason: 'the results stay');
      await back(tester);
      expect(find.byType(TvSearchScreen), findsNothing, reason: 'then leaves');
    });
  });

  for (final size in tvSizes) {
    testWidgets('Movies at ${size.width.round()}', (tester) async {
      await _open(tester, Routes.movies, size: size);
      await expectLater(
        find.byType(TvShell),
        matchesGoldenFile('../goldens/tv_movies_${size.width.round()}.png'),
      );
    });
  }

  testWidgets('a panel keeps focus to itself', (tester) async {
    await _open(tester, Routes.movies);
    await up(tester);
    await right(tester);
    expect(focusedLabel(), 'Any genre');
    await select(tester);
    expect(find.text('Genre'), findsOneWidget);
    expect(focusedLabel(), 'Any genre', reason: 'the choice in force');
    await press(tester, LogicalKeyboardKey.arrowLeft);
    await down(tester, 5);
    expect(focusedLabel(), contains('Comedy'));
    expect(tvOpenPanels.value, 1);
    await select(tester);
    expect(tvOpenPanels.value, 0);
    expect(find.text('Comedy'), findsOneWidget, reason: 'the filter shows');
  });
}
