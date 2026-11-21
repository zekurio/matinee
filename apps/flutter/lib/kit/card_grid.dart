import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'cards.dart';

/// Cards in rows across the page, as a sliver: [columns] says how many fit
/// the width the grid has (the screens pick it by width class), and each
/// card is as tall as its art at [aspectRatio] and its two lines of text
/// need. With [fitRows], for cards with more under them on some rows than
/// on others, each row is as tall as its tallest card instead, as a
/// Compose grid sizes its rows. The gutter is the page's, the gaps the
/// web's grid's.
class CardGrid extends StatelessWidget {
  const CardGrid({
    super.key,
    required this.columns,
    required this.aspectRatio,
    required this.itemCount,
    required this.itemBuilder,
    this.fitRows = false,
  });

  final int Function(double width) columns;
  final double aspectRatio;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  /// Whether a row takes the height of its tallest card rather than every
  /// row the same. It lays each row out whole, so keep it for lists whose
  /// cards differ in height.
  final bool fitRows;

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
          if (fitRows) {
            return SliverList.builder(
              itemCount: (itemCount + count - 1) ~/ count,
              itemBuilder: (context, row) => Padding(
                padding: EdgeInsets.only(top: row == 0 ? 0 : runSpacing),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: spacing,
                  children: [
                    for (var column = 0; column < count; column++)
                      Expanded(
                        child: row * count + column < itemCount
                            ? itemBuilder(context, row * count + column)
                            : const SizedBox.shrink(),
                      ),
                  ],
                ),
              ),
            );
          }
          return SliverGrid.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: count,
              crossAxisSpacing: spacing,
              mainAxisSpacing: runSpacing,
              mainAxisExtent: CardMetrics.height(
                itemWidth,
                aspectRatio,
                scaler,
              ),
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
