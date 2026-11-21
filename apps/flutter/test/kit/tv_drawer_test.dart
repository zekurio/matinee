import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';

const _screen = Size(960, 540);
const _icon = 48.0;

/// What a focused circle grows to.
const _grown = _icon * TvFocus.rowScale + .5;

/// The TV shell's drawer over a page that takes focus back on a pick, a
/// frame later, as the shell's does, with [middle] entries between the profile and
/// Settings.
class _Shell extends StatefulWidget {
  const _Shell({required this.drawer, required this.middle});

  final TvDrawerController drawer;
  final int middle;

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  final _page = FocusNode(debugLabel: 'page');
  var _current = 'm1';

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(
        child: TvFocusable(
          focusNode: _page,
          autofocus: true,
          builder: (context, _) => const SizedBox.expand(),
        ),
      ),
      PositionedDirectional(
        top: 0,
        bottom: 0,
        start: 0,
        child: TvDrawer(
          controller: widget.drawer,
          current: _current,
          onPick: (entry) {
            setState(() => _current = entry.key);
            // As the shell's new page takes focus: once it's built.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (_page.context != null) _page.requestFocus();
            });
          },
          top: const TvDrawerEntry(
            key: 'profile',
            label: 'Profile',
            icon: Lucide.userRound,
          ),
          entries: [
            for (var i = 0; i < widget.middle; i++)
              TvDrawerEntry(key: 'm$i', label: 'Page $i', icon: Lucide.film),
          ],
          bottom: const TvDrawerEntry(
            key: 'settings',
            label: 'Settings',
            icon: Lucide.settings,
          ),
        ),
      ),
    ],
  );
}

Future<TvDrawerController> _pump(WidgetTester tester, {int middle = 5}) async {
  tester.view.physicalSize = _screen;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final drawer = TvDrawerController();
  addTearDown(drawer.dispose);
  await tester.pumpWidget(
    WidgetsApp(
      color: const Color(0xFF000000),
      builder: (context, _) => MatineeTheme.wrap(
        matineeDark,
        _Shell(drawer: drawer, middle: middle),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return drawer;
}

/// Whether [widget] paints a fill you can see.
bool _painted(Widget widget) => switch (widget) {
  ColoredBox(:final color) => color.a > .01,
  DecoratedBox(decoration: BoxDecoration(color: final color?)) => color.a > .01,
  _ => false,
};

/// The rects of every fill the drawer's entries paint, the focus's and the
/// current page's marker alike.
List<Rect> _fills(WidgetTester tester) => [
  for (final element
      in find
          .descendant(
            of: find.byType(TvDrawer),
            matching: find.byWidgetPredicate(_painted),
          )
          .evaluate())
    tester.getRect(find.byElementPredicate((e) => e == element)),
];

/// The fill behind the entry [key], if it paints one.
Rect? _fillOf(WidgetTester tester, String key) {
  final entry = tester.getRect(find.byKey(ValueKey(key)));
  for (final fill in _fills(tester)) {
    if ((fill.center.dy - entry.center.dy).abs() < 4) return fill;
  }
  return null;
}

/// Pumps frame by frame until nothing moves, calling [frame] on each.
Future<void> _everyFrame(
  WidgetTester tester,
  void Function(int frame) frame,
) async {
  for (var i = 0; i < 60; i++) {
    await tester.pump(const Duration(milliseconds: 16));
    frame(i);
  }
  await tester.pumpAndSettle();
  frame(60);
}

void main() {
  testWidgets('a tap on the rail picks the page without opening the drawer, '
      'its fills never wider than the icon', (tester) async {
    final drawer = await _pump(tester);
    await tester.tap(find.byKey(const ValueKey('m3')));
    await _everyFrame(tester, (i) {
      expect(drawer.isOpen, isFalse, reason: 'frame $i');
      for (final fill in _fills(tester)) {
        expect(
          fill.width,
          lessThanOrEqualTo(_grown),
          reason: 'frame $i: a fill $fill wider than the icon',
        );
      }
    });
    final marker = _fillOf(tester, 'm3');
    expect(marker, isNotNull, reason: 'the tapped page is marked');
    expect(marker!.width, moreOrLessEquals(_icon, epsilon: .5));
    expect(_fillOf(tester, 'm1'), isNull, reason: 'the old mark is gone');
  });

  testWidgets('the open drawer spans its focused entry; a pick by the D-pad '
      'closes it with the marker a circle on every frame', (tester) async {
    final drawer = await _pump(tester);
    drawer.open();
    await tester.pumpAndSettle();
    expect(drawer.isOpen, isTrue);
    final focused = _fillOf(tester, 'm1')!;
    final row = tester.getRect(find.byKey(const ValueKey('m1')));
    expect(focused.width, greaterThan(200));
    // Focused, it grows as a row does.
    expect(
      focused.width,
      moreOrLessEquals(row.width * TvFocus.rowScale, epsilon: .5),
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    // The page takes focus as it's built, which closes the drawer.
    await tester.pump();
    await tester.pump();
    expect(drawer.isOpen, isFalse);
    await _everyFrame(tester, (i) {
      expect(drawer.isOpen, isFalse, reason: 'frame $i');
      final marker = _fillOf(tester, 'm2');
      expect(marker, isNotNull, reason: 'frame $i: the pick is marked');
      expect(
        marker!.width,
        inInclusiveRange(_icon - .5, _grown),
        reason: 'frame $i: the marker $marker is no circle',
      );
      for (final fill in _fills(tester)) {
        expect(
          fill.width,
          lessThanOrEqualTo(_grown),
          reason: 'frame $i: a fill $fill wider than the icon',
        );
      }
    });
  });
}
