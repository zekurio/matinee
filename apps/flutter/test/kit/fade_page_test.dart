import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/motion.dart';
import 'package:matinee/kit/route_page.dart';
import 'package:matinee/kit/theme.dart';
import 'package:matinee/kit/tokens.dart';

const _width = 800.0;
const _below = Key('below');
const _above = Key('above');
const _art = Key('art');

/// Counts how often its dependencies changed, as a screen in the tabs would
/// rebuild for it.
class _Probe extends StatefulWidget {
  const _Probe();

  static int changes = 0;

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _Probe.changes++;
  }

  @override
  Widget build(BuildContext context) => SizedBox.expand(
    key: _below,
    child: ColoredBox(color: Theme.of(context).colorScheme.surface),
  );
}

/// A [FadePage] with the probe, and a [kitPage] over it while [open] says.
class _Pages extends StatefulWidget {
  const _Pages({required this.below, required this.above});

  final Page<void> Function(Widget child) below;
  final Page<void> Function(Widget child) above;

  @override
  State<_Pages> createState() => _PagesState();
}

class _PagesState extends State<_Pages> {
  var open = false;

  void show({required bool open}) => setState(() => this.open = open);

  // As go_router gives each of its navigators.
  final _heroes = HeroController();

  @override
  void dispose() {
    _heroes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      HeroControllerScope(controller: _heroes, child: _navigator());

  Widget _navigator() => Navigator(
    pages: [
      widget.below(const _Probe()),
      if (open) widget.above(const SizedBox.expand(key: _above)),
    ],
    onDidRemovePage: (_) {},
  );
}

Future<_PagesState> _app(
  WidgetTester tester,
  Page<void> Function(Widget child) below, {
  Page<void> Function(Widget child) above = _kit,
}) async {
  tester.view.physicalSize = const Size(_width, 600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  _Probe.changes = 0;
  await tester.pumpWidget(
    MaterialApp(
      theme: MatineeTheme.data(matineeDark).copyWith(
        pageTransitionsTheme: PageTransitionsTheme(
          builders: {
            for (final platform in TargetPlatform.values) platform: _aside,
          },
        ),
      ),
      home: _Pages(below: below, above: above),
    ),
  );
  await tester.pumpAndSettle();
  return tester.state<_PagesState>(find.byType(_Pages));
}

const _aside = _Aside();

/// A theme's motion that moves the page it covers a quarter of the width
/// aside, as Cupertino's does. Android's own, a fade, leaves that page
/// still, so it wouldn't show what [FadePage] is for.
class _Aside extends PageTransitionsBuilder {
  const _Aside();

  @override
  DelegatedTransitionBuilder? get delegatedTransition =>
      (context, animation, secondaryAnimation, allowSnapshotting, child) =>
          SlideTransition(
            position: secondaryAnimation.drive(
              Tween(begin: Offset.zero, end: const Offset(-.25, 0)),
            ),
            child: child,
          );

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => FadeTransition(opacity: animation, child: child);
}

double _x(WidgetTester tester, Key key) =>
    tester.getTopLeft(find.byKey(key)).dx;

Page<void> _fade(Widget child) =>
    FadePage(key: const ValueKey('below'), name: 'below', child: child);

Page<void> _kit(Widget child) =>
    kitPage(key: const ValueKey('above'), name: 'above', child: child);

void main() {
  testWidgets('covered and uncovered, nothing in it rebuilds', (tester) async {
    final pages = await _app(tester, _fade);
    expect(_Probe.changes, 1);

    pages.show(open: true);
    await tester.pump();
    await tester.pump(KitMotion.page ~/ 2);
    // Moving aside as a page of another kind does.
    expect(_x(tester, _below), lessThan(0));
    await tester.pumpAndSettle();

    pages.show(open: false);
    await tester.pumpAndSettle();
    expect(_x(tester, _below), 0);
    expect(_Probe.changes, 1);
  });

  testWidgets('a page of another kind rebuilds, which this page avoids', (
    tester,
  ) async {
    // What [FadePage] stands in for: Flutter wraps a covered page in the
    // motion only while it's covered.
    final pages = await _app(tester, _OtherKind.new);
    pages.show(open: true);
    await tester.pump();
    await tester.pump(KitMotion.page ~/ 2);
    expect(_x(tester, _below), lessThan(0));
    expect(_Probe.changes, greaterThan(1));
  });

  testWidgets('no hero flies between pages', (tester) async {
    const tag = 'poster';
    final pages = await _app(
      tester,
      (child) => _fade(
        Stack(
          children: [
            child,
            const Hero(
              tag: tag,
              child: SizedBox(key: _art, width: 10),
            ),
          ],
        ),
      ),
      above: (child) => _kit(
        Stack(
          children: [
            child,
            const Align(
              alignment: Alignment.bottomRight,
              child: Hero(
                tag: tag,
                child: SizedBox(key: _art, width: 10),
              ),
            ),
          ],
        ),
      ),
    );
    pages.show(open: true);
    await tester.pump();
    await tester.pump(KitMotion.move ~/ 2);
    // A flight would hide both and show one in the overlay, out of the
    // pages.
    expect(find.byKey(_art), findsNWidgets(2));
    expect(
      find.ancestor(of: find.byKey(_art), matching: find.byType(NoHeroes)),
      findsNWidgets(2),
    );
    await tester.pumpAndSettle();
  });

  testWidgets('it fades in', (tester) async {
    final pages = await _app(
      tester,
      _fade,
      above: (child) =>
          FadePage(key: const ValueKey('above'), name: 'above', child: child),
    );
    double opacity() => tester
        .widget<FadeTransition>(
          find
              .ancestor(
                of: find.byKey(_above),
                matching: find.byType(FadeTransition),
              )
              .first,
        )
        .opacity
        .value;
    pages.show(open: true);
    await tester.pump();
    await tester.pump(KitMotion.enter ~/ 4);
    expect(opacity(), inExclusiveRange(0, 1));
    // Another fading page over it leaves it where it is.
    expect(_x(tester, _below), 0);
    await tester.pumpAndSettle();
    expect(opacity(), 1);
  });
}

/// A page whose route fades in, of another kind than a [kitPage], built the
/// way go_router's `CustomTransitionPage` is.
class _OtherKind extends Page<void> {
  const _OtherKind(this.child) : super(key: const ValueKey('below'));

  final Widget child;

  @override
  Route<void> createRoute(BuildContext context) => PageRouteBuilder<void>(
    settings: this,
    pageBuilder: (_, _, _) => child,
    transitionsBuilder: (_, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}
