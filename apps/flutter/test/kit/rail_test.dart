import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';

void main() {
  testWidgets("a rail's See all heading is its own node, the heading's size", (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    var opened = 0;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: MatineeTheme.wrap(
          matineeDark,
          ListView(
            children: [
              Rail(
                title: 'Recently watched',
                onSeeAll: () => opened++,
                seeAllLabel: 'See all',
                itemWidth: 120,
                itemHeight: CardMetrics.height(
                  120,
                  CardMetrics.poster,
                  TextScaler.noScaling,
                ),
                itemCount: 3,
                itemBuilder: (context, index) =>
                    PosterCard(name: 'Card $index', onPressed: () {}),
              ),
            ],
          ),
        ),
      ),
    );
    final heading = find.bySemanticsLabel('Recently watched, See all');
    expect(heading, findsOneWidget);
    final node = tester.getSemantics(heading);
    // Not the rail's whole box, cards and all, which a screen reader would
    // outline and a tap in its middle would miss.
    expect(node.rect.height, lessThan(60));
    await tester.tapAt(
      node.transform == null
          ? node.rect.center
          : MatrixUtils.transformPoint(node.transform!, node.rect.center),
    );
    expect(opened, 1);
    handle.dispose();
  });

  Future<void> pumpRail(
    WidgetTester tester, {
    required int count,
    required int start,
    TextDirection direction = TextDirection.ltr,
  }) async {
    tester.view.physicalSize = const Size(800, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      Directionality(
        textDirection: direction,
        child: MatineeTheme.wrap(
          matineeDark,
          ListView(
            children: [
              Rail(
                title: 'Episodes',
                itemWidth: 120,
                itemHeight: CardMetrics.height(
                  120,
                  CardMetrics.poster,
                  TextScaler.noScaling,
                ),
                itemCount: count,
                initialIndex: start,
                itemBuilder: (context, index) =>
                    PosterCard(name: 'Card $index', onPressed: () {}),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Rect card(WidgetTester tester, int index) =>
      tester.getRect(find.bySemanticsLabel('Card $index'));

  testWidgets('a rail opens with its first card at the leading edge', (
    tester,
  ) async {
    await pumpRail(tester, count: 20, start: 6);
    expect(card(tester, 6).left, moreOrLessEquals(CardMetrics.gutter));
    expect(tester.hasRunningAnimations, isFalse);

    await pumpRail(tester, count: 20, start: 6, direction: TextDirection.rtl);
    expect(card(tester, 6).right, moreOrLessEquals(800 - CardMetrics.gutter));
  });

  testWidgets('a rail opened near its end shows the end, without a bounce', (
    tester,
  ) async {
    await pumpRail(tester, count: 20, start: 19);
    expect(card(tester, 19).right, moreOrLessEquals(800 - CardMetrics.gutter));
    await tester.pump(const Duration(seconds: 1));
    expect(card(tester, 19).right, moreOrLessEquals(800 - CardMetrics.gutter));
  });

  testWidgets('a rail shorter than the screen stays at its start', (
    tester,
  ) async {
    await pumpRail(tester, count: 3, start: 2);
    expect(card(tester, 0).left, moreOrLessEquals(CardMetrics.gutter));
  });
}
