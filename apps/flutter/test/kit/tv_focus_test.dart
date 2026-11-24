import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

/// Rows of cards on a TV page, under the TV's focus rules, in a 960 by 540
/// window. Each row has [counts] cards named `row/index`.
Future<(TvFocusMemory, List<TraversalDirection>)> _rows(
  WidgetTester tester,
  List<int> counts, {
  Widget? header,
}) async {
  tester.view.physicalSize = const Size(960, 540);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final memory = TvFocusMemory();
  addTearDown(memory.dispose);
  final edges = <TraversalDirection>[];
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      builder: (context, _) => MatineeTheme.wrap(
        matineeDark,
        TvFocusRules(
          onEdge: edges.add,
          child: Builder(
            builder: (context) {
              memory.restore(context, () => ('0', '0'));
              return TvPinnedList(
                children: [
                  ?header,
                  for (final (row, count) in counts.indexed)
                    TvRow(
                      title: 'Row $row',
                      row: '$row',
                      memory: memory,
                      height: 186,
                      itemCount: count,
                      itemBuilder: (context, index) => TvArtCard(
                        toneKey: '$row/$index',
                        aspect: 2 / 3,
                        width: TvCards.posterWidth,
                        focusNode: memory.node('$row', '$index'),
                        label: '$row/$index',
                        onPressed: () {},
                        children: const [],
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (memory, edges);
}

String? _focused() => FocusManager.instance.primaryFocus?.debugLabel;

Future<void> _press(WidgetTester tester, LogicalKeyboardKey key) async {
  await tester.sendKeyEvent(key);
  await tester.pumpAndSettle();
}

void main() {
  _leavingTests();

  testWidgets('moves sideways stay in a row, to its ends', (tester) async {
    final (_, edges) = await _rows(tester, [12, 3]);
    for (var i = 0; i < 11; i++) {
      await _press(tester, LogicalKeyboardKey.arrowRight);
    }
    expect(_focused(), '0/11');
    await _press(tester, LogicalKeyboardKey.arrowRight);
    expect(_focused(), '0/11', reason: 'Right at the end stays put');
    // The last card is in view, clear of the screen's edge.
    final rect = tester.getRect(find.bySemanticsLabel('0/11'));
    expect(rect.right, lessThanOrEqualTo(960 - TvPage.end));
    for (var i = 0; i < 11; i++) {
      await _press(tester, LogicalKeyboardKey.arrowLeft);
    }
    expect(_focused(), '0/0');
    expect(edges, [TraversalDirection.right]);
    await _press(tester, LogicalKeyboardKey.arrowLeft);
    expect(_focused(), '0/0');
    // The shell opens the drawer for this one.
    expect(edges, [TraversalDirection.right, TraversalDirection.left]);
  });

  testWidgets('a row focus comes back to lands on the card it left', (
    tester,
  ) async {
    await _rows(tester, [8, 8, 8]);
    for (var i = 0; i < 5; i++) {
      await _press(tester, LogicalKeyboardKey.arrowRight);
    }
    expect(_focused(), '0/5');
    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(_focused()?.startsWith('1/'), isTrue);
    await _press(tester, LogicalKeyboardKey.arrowRight);
    final second = _focused();
    await _press(tester, LogicalKeyboardKey.arrowDown);
    await _press(tester, LogicalKeyboardKey.arrowUp);
    expect(_focused(), second, reason: 'row 1 keeps its card');
    await _press(tester, LogicalKeyboardKey.arrowUp);
    expect(_focused(), '0/5', reason: 'row 0 keeps its card');
    await _press(tester, LogicalKeyboardKey.arrowUp);
    expect(_focused(), '0/5', reason: 'Up from the top row stays put');
  });

  testWidgets('a row that loads again keeps focus on the page', (tester) async {
    final (memory, _) = await _rows(tester, [6, 6]);
    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(_focused(), '1/0');
    expect(memory.lastRow, '1');
    expect(memory.focusLast(), isTrue);
    expect(_focused(), '1/0');
  });

  testWidgets('Down from a detail header brings the first row up at once', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(960, 540);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final memory = TvFocusMemory();
    addTearDown(memory.dispose);
    Widget card(String row, int index) => TvArtCard(
      toneKey: '$row/$index',
      aspect: 16 / 9,
      width: 224,
      focusNode: memory.node(row, '$index'),
      label: '$row/$index',
      onPressed: () {},
      children: const [],
    );
    await tester.pumpWidget(
      WidgetsApp(
        color: const Color(0xFF000000),
        builder: (context, _) => MatineeTheme.wrap(
          matineeDark,
          TvFocusRules(
            child: Builder(
              builder: (context) {
                memory.restore(context, () => ('actions', 'play'));
                return TvHeaderList(
                  // A show's header: its facts, then Play near the bottom.
                  header: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 330),
                      TvMemoryRow(
                        memory: memory,
                        row: 'actions',
                        child: TvFocusable(
                          focusNode: memory.node('actions', 'play'),
                          label: 'play',
                          onPressed: () {},
                          builder: (context, _) =>
                              const SizedBox(width: 180, height: 48),
                        ),
                      ),
                    ],
                  ),
                  rows: [
                    for (final row in ['0', '1'])
                      TvRow(
                        title: 'Row $row',
                        row: row,
                        memory: memory,
                        height: 126,
                        itemCount: 4,
                        itemBuilder: (context, index) => card(row, index),
                      ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(_focused(), 'actions/play');
    final card0 = find.bySemanticsLabel('0/0');
    expect(tester.getRect(card0).bottom, greaterThan(540));

    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(_focused(), '0/0');
    // The row comes up near the pivot, but where the header has just gone
    // whole: its heading a gap below the top, the card in full view.
    expect(tester.getRect(find.text('Row 0')).top, 32);
    expect(tester.getRect(card0).top, lessThanOrEqualTo(88));

    await _press(tester, LogicalKeyboardKey.arrowUp);
    expect(_focused(), 'actions/play');
    expect(tester.getRect(card0).top, 450);
  });

  // The TV profile lost its Sign out button, the one thing in reach above
  // Recently watched: Down to the statistics scrolled the header away, and
  // Up to the first card left it there for good, since that card already
  // sat clear of the edge.
  group('a page whose header takes no focus', () {
    Future<ScrollController> page(WidgetTester tester) async {
      tester.view.physicalSize = const Size(960, 540);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final memory = TvFocusMemory();
      addTearDown(memory.dispose);
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      TvRow row(String row) => TvRow(
        title: 'Row $row',
        row: row,
        memory: memory,
        height: 126,
        itemCount: 3,
        itemBuilder: (context, index) => TvArtCard(
          toneKey: '$row/$index',
          aspect: 16 / 9,
          width: 224,
          focusNode: memory.node(row, '$index'),
          label: '$row/$index',
          onPressed: () {},
          children: const [],
        ),
      );
      await tester.pumpWidget(
        WidgetsApp(
          color: const Color(0xFF000000),
          builder: (context, _) => MatineeTheme.wrap(
            matineeDark,
            TvFocusRules(
              child: Builder(
                builder: (context) {
                  memory.restore(context, () => ('0', '0'));
                  return TvFollowFocus(
                    controller: scroll,
                    rule: TvFollowFocus.clear(start: 56, end: 56),
                    sectionTop: 32,
                    child: TvRowsScroll(
                      controller: scroll,
                      top: 35,
                      gap: 32,
                      cacheExtent: 2400,
                      rows: [
                        // The avatar, the name, the facts.
                        const SizedBox(height: 200),
                        row('0'),
                        row('1'),
                        row('2'),
                        row('3'),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(_focused(), '0/0');
      expect(scroll.offset, 0);
      return scroll;
    }

    testWidgets('Up to its first row shows the header again', (tester) async {
      final scroll = await page(tester);
      await _press(tester, LogicalKeyboardKey.arrowDown);
      expect(_focused(), '1/0');
      expect(scroll.offset, greaterThan(0), reason: 'the header went');
      await _press(tester, LogicalKeyboardKey.arrowUp);
      expect(_focused(), '0/0');
      expect(scroll.offset, 0);
    });

    testWidgets('Up on its first row, scrolled away, shows the header', (
      tester,
    ) async {
      final scroll = await page(tester);
      scroll.jumpTo(200);
      await tester.pumpAndSettle();
      await _press(tester, LogicalKeyboardKey.arrowUp);
      expect(_focused(), '0/0');
      expect(scroll.offset, 0);
    });
  });
}

/// Rows whose cards [rows] lists, which a test takes cards out of. Select
/// on a card opens a panel whose one row takes the card out as it closes,
/// as answering a request does.
Future<(TvFocusMemory, ValueNotifier<List<List<String>>>)> _leavingRows(
  WidgetTester tester,
  List<List<String>> start,
) async {
  tester.view.physicalSize = const Size(960, 540);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final memory = TvFocusMemory();
  addTearDown(memory.dispose);
  final rows = ValueNotifier(start);
  addTearDown(rows.dispose);
  void remove(String key) => rows.value = [
    for (final row in rows.value)
      [
        for (final each in row)
          if (each != key) each,
      ],
  ];
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(
        settings: settings,
        pageBuilder: (context, _, _) => builder(context),
      ),
      home: MatineeTheme.wrap(
        matineeDark,
        TvFocusRules(
          child: ValueListenableBuilder(
            valueListenable: rows,
            builder: (context, lists, _) {
              memory.restore(context, () => ('0', 'a'));
              return TvPinnedList(
                children: [
                  for (final (row, keys) in lists.indexed)
                    if (keys.isNotEmpty)
                      TvRow(
                        key: ValueKey(row),
                        title: 'Row $row',
                        row: '$row',
                        memory: memory,
                        height: 186,
                        itemCount: keys.length,
                        itemBuilder: (context, index) => TvArtCard(
                          key: ValueKey(keys[index]),
                          toneKey: keys[index],
                          aspect: 2 / 3,
                          width: TvCards.posterWidth,
                          focusNode: memory.node('$row', keys[index]),
                          label: keys[index],
                          onPressed: () async {
                            final key = keys[index];
                            final gone = await showTvPanel<bool>(
                              context,
                              title: key,
                              builder: (panel) => [
                                TvListItem(
                                  title: 'Take it out',
                                  onPressed: () =>
                                      Navigator.of(panel).pop(true),
                                ),
                              ],
                            );
                            if (gone ?? false) remove(key);
                          },
                          children: const [],
                        ),
                      ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (memory, rows);
}

void _leavingTests() {
  testWidgets('a focused card that leaves hands focus to the next one', (
    tester,
  ) async {
    final (_, rows) = await _leavingRows(tester, [
      ['a', 'b', 'c'],
      ['x', 'y'],
    ]);
    await _press(tester, LogicalKeyboardKey.arrowRight);
    expect(_focused(), '0/b');
    rows.value = [
      ['a', 'c'],
      ['x', 'y'],
    ];
    await tester.pumpAndSettle();
    expect(_focused(), '0/c');
    rows.value = [
      ['a'],
      ['x', 'y'],
    ];
    await tester.pumpAndSettle();
    expect(_focused(), '0/a', reason: 'the last card hands it back');
    rows.value = [
      <String>[],
      ['x', 'y'],
    ];
    await tester.pumpAndSettle();
    expect(_focused(), '1/x', reason: 'an empty row hands it down');
  });

  testWidgets('a card taken out from its panel hands focus on as it closes', (
    tester,
  ) async {
    await _leavingRows(tester, [
      ['a', 'b', 'c'],
    ]);
    await _press(tester, LogicalKeyboardKey.arrowRight);
    expect(_focused(), '0/b');
    await _press(tester, LogicalKeyboardKey.select);
    expect(find.text('Take it out'), findsOneWidget);
    await _press(tester, LogicalKeyboardKey.select);
    expect(find.text('Take it out'), findsNothing);
    expect(_focused(), '0/c');
  });
}
