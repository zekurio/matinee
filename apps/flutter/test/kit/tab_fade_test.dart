import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/kit/motion.dart';

const _width = 800.0;

/// A tab's first page: a long list, to see it keep its place.
class _Tab extends StatelessWidget {
  const _Tab(this.name);

  final String name;

  @override
  Widget build(BuildContext context) => ListView.builder(
    key: PageStorageKey(name),
    itemCount: 100,
    itemExtent: 100,
    itemBuilder: (context, i) => Text('$name $i'),
  );
}

/// Three tabs in a shell route, as the app's, fading in [TabFade]. Back
/// on a tab but the first goes to the first, as the app's shell does.
Future<StatefulNavigationShell Function()> _tabs(
  WidgetTester tester, {
  bool reduceMotion = false,
}) async {
  tester.view.physicalSize = const Size(_width, 600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  late StatefulNavigationShell current;
  final router = GoRouter(
    initialLocation: '/a',
    routes: [
      StatefulShellRoute(
        builder: (context, state, shell) {
          current = shell;
          return PopScope(
            canPop: shell.currentIndex == 0,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) shell.goBranch(0);
            },
            child: shell,
          );
        },
        navigatorContainerBuilder: (context, shell, children) => TabFade(
          index: shell.currentIndex,
          background: const Color(0xFF000000),
          children: children,
        ),
        branches: [
          for (final name in ['a', 'b', 'c'])
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/$name',
                  builder: (context, state) => _Tab(name),
                ),
              ],
            ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    MaterialApp.router(
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
        child: child!,
      ),
    ),
  );
  return () => current;
}

double _x(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dx;

/// How opaque the tab with [text] is drawn.
double _opacity(WidgetTester tester, String text) {
  var opacity = 1.0;
  final fades = find.ancestor(
    of: find.text(text),
    matching: find.byType(FadeTransition),
  );
  for (final fade in tester.widgetList<FadeTransition>(fades)) {
    opacity *= fade.opacity.value;
  }
  return opacity;
}

/// Whether the tab with [text] paints over the tab with [other].
bool _over(WidgetTester tester, String text, String other) {
  final stack = find.byType(Stack).first;
  int place(String of) => tester
      .widget<Stack>(stack)
      .children
      .indexWhere(
        (child) => find
            .descendant(of: find.byWidget(child), matching: find.text(of))
            .evaluate()
            .isNotEmpty,
      );
  return place(text) > place(other);
}

Future<void> _at(WidgetTester tester, double fraction) =>
    tester.pump(KitMotion.page * fraction);

void main() {
  final half = KitMotion.pageEasing.transform(.5);

  testWidgets('a tab picked fades in over the open one, which holds still', (
    tester,
  ) async {
    final shell = await _tabs(tester);
    shell().goBranch(2);
    await tester.pump();
    await _at(tester, .5);

    expect(_opacity(tester, 'c 0'), moreOrLessEquals(half));
    expect(_opacity(tester, 'a 0'), 1);
    expect(_over(tester, 'c 0', 'a 0'), isTrue);
    expect(_x(tester, 'c 0'), 0);
    expect(_x(tester, 'a 0'), 0);

    await tester.pumpAndSettle();
    expect(_opacity(tester, 'c 0'), 1);
    expect(find.text('a 0'), findsNothing);
  });

  testWidgets('a tab before it fades in over it the same', (tester) async {
    final shell = await _tabs(tester);
    shell().goBranch(2);
    await tester.pumpAndSettle();
    shell().goBranch(1);
    await tester.pump();
    await _at(tester, .5);

    expect(_opacity(tester, 'b 0'), moreOrLessEquals(half));
    expect(_opacity(tester, 'c 0'), 1);
    expect(_over(tester, 'b 0', 'c 0'), isTrue);
  });

  testWidgets('Back from a tab to the first fades the same way', (
    tester,
  ) async {
    final shell = await _tabs(tester);
    shell().goBranch(1);
    await tester.pumpAndSettle();

    await tester.binding.handlePopRoute();
    await tester.pump();
    await _at(tester, .5);

    expect(_opacity(tester, 'a 0'), moreOrLessEquals(half));
    expect(_opacity(tester, 'b 0'), 1);
    await tester.pumpAndSettle();
    expect(shell().currentIndex, 0);
  });

  testWidgets('a tab comes back where it was left', (tester) async {
    final shell = await _tabs(tester);
    tester
        .state<ScrollableState>(find.byType(Scrollable))
        .position
        .jumpTo(1000);
    await tester.pump();
    expect(find.text('a 10'), findsOneWidget);

    shell().goBranch(1);
    await tester.pumpAndSettle();
    shell().goBranch(0);
    await tester.pumpAndSettle();

    expect(find.text('a 0'), findsNothing);
    expect(tester.getTopLeft(find.text('a 10')).dy, 0);
  });

  testWidgets('with less motion asked for, a tab shows at once', (
    tester,
  ) async {
    final shell = await _tabs(tester, reduceMotion: true);
    shell().goBranch(1);
    await tester.pump();

    expect(_opacity(tester, 'b 0'), 1);
    expect(find.text('a 0'), findsNothing);
  });
}
