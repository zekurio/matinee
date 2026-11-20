import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'cards.dart';

/// Cards in rows across the page, as a sliver: [columns] says how many fit
/// the width the grid has (the screens pick it by width class), and each
/// card is as tall as its art at [aspectRatio] and its two lines of text
/// need, and [extraHeight] more for what a screen puts under them. The
/// gutter is the page's, the gaps the web's grid's.
class CardGrid extends StatelessWidget {
  const CardGrid({
    super.key,
    required this.columns,
    required this.aspectRatio,
    required this.itemCount,
    required this.itemBuilder,
    this.extraHeight = 0,
  });

  final int Function(double width) columns;
  final double aspectRatio;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final double extraHeight;

  static const spacing = 16.0;
  static const runSpacing = 20.0;

  @override
  Widget build(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      sliver: SliverLayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.crossAxisExtent;
          final count = math.max(1, columns(width));
          final itemWidth = math.max(
            0.0,
            (width - spacing * (count - 1)) / count,
          );
          return SliverGrid.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: count,
              crossAxisSpacing: spacing,
              mainAxisSpacing: runSpacing,
              mainAxisExtent:
                  CardMetrics.height(itemWidth, aspectRatio, scaler) +
                  extraHeight,
            ),
            itemCount: itemCount,
            itemBuilder: (context, index) => Align(
              alignment: Alignment.topCenter,
              child: itemBuilder(context, index),
            ),
          );
        },
      ),
    );
  }
}
