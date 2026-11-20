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
}
