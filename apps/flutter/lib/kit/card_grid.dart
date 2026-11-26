import 'dart:math' as math;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'cards.dart';
import 'list_motion.dart';
import 'staggered.dart';

/// Cards in rows across the page, as a sliver: [columns] says how many fit the
/// width the grid has (the screens pick it by width class), and each card is as
/// tall as its art at [aspectRatio] and its two lines of text need. With
/// [fitRows], for cards with more under them on some rows than on others, each
/// row is as tall as its tallest card instead. The gutter is the page's, the
/// gaps the web's grid's.
class CardGrid extends StatelessWidget {
  const CardGrid({
    super.key,
    required this.columns,
    required this.aspectRatio,
    required this.itemCount,
    required this.itemBuilder,
    this.itemId,
    this.fitRows = false,
  });

  final int Function(double width) columns;
  final double aspectRatio;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  /// What each card shows, as an id, for a grid whose cards can change: a
  /// filter, a sort, or an item gone. With it the cards move to their new
  /// places ([ListMotion]); without, they change where they are.
  final Object Function(int index)? itemId;

  /// Whether a row takes the height of its tallest card rather than every
  /// row the same. It lays each row out whole, so keep it for lists whose
  /// cards differ in height.
  final bool fitRows;

  static const spacing = 16.0;
  static const runSpacing = 20.0;

  @override
  Widget build(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    final itemId = this.itemId;
    Widget item(BuildContext context, int index, Widget card) =>
        itemId == null ? card : ListItemMotion(id: itemId(index), child: card);
    Widget grid;
    if (fitRows) {
      grid = SliverWidthBuilder(
        builder: (width) {
          final count = math.max(1, columns(width));
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
                          ? item(
                              context,
                              row * count + column,
                              itemBuilder(context, row * count + column),
                            )
                          : const SizedBox.shrink(),
                    ),
                ],
              ),
            ),
          );
        },
      );
    } else {
      grid = SliverGrid.builder(
        gridDelegate: _CardGridDelegate(columns, aspectRatio, scaler),
        itemCount: itemCount,
        itemBuilder: (context, index) => item(
          context,
          index,
          Staggered(
            builder: (context) => Align(
              alignment: Alignment.topCenter,
              child: itemBuilder(context, index),
            ),
          ),
        ),
      );
    }
    if (itemId != null) {
      grid = ListMotion(
        ids: [for (var i = 0; i < itemCount; i++) itemId(i)],
        child: grid,
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      sliver: grid,
    );
  }
}

/// [CardGrid]'s columns, worked out from the width at layout: a
/// [SliverLayoutBuilder] would build the grid again on every frame of a
/// scroll, each visible card with it.
final class _CardGridDelegate extends SliverGridDelegate {
  const _CardGridDelegate(this.columns, this.aspectRatio, this.scaler);

  final int Function(double width) columns;
  final double aspectRatio;
  final TextScaler scaler;

  @override
  SliverGridLayout getLayout(SliverConstraints constraints) {
    final width = constraints.crossAxisExtent;
    final count = math.max(1, columns(width));
    final itemWidth = math.max(
      0.0,
      (width - CardGrid.spacing * (count - 1)) / count,
    );
    return SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: count,
      crossAxisSpacing: CardGrid.spacing,
      mainAxisSpacing: CardGrid.runSpacing,
      mainAxisExtent: CardMetrics.height(itemWidth, aspectRatio, scaler),
    ).getLayout(constraints);
  }

  @override
  bool shouldRelayout(_CardGridDelegate oldDelegate) =>
      oldDelegate.columns != columns ||
      oldDelegate.aspectRatio != aspectRatio ||
      oldDelegate.scaler != scaler;
}

/// A sliver built from the width it has, built again only when that
/// changes. [SliverLayoutBuilder] builds again with every frame of a
/// scroll, since a sliver's constraints carry its scroll offset, and the
/// list it returns then builds every visible child again. [builder] gets
/// no context, so whatever it reads from above comes from the caller's,
/// which builds this again when it changes.
class SliverWidthBuilder extends StatefulWidget {
  const SliverWidthBuilder({super.key, required this.builder});

  final Widget Function(double width) builder;

  @override
  State<SliverWidthBuilder> createState() => _SliverWidthBuilderState();
}

class _SliverWidthBuilderState extends State<SliverWidthBuilder> {
  double? _width;
  Widget? _built;

  @override
  void didUpdateWidget(SliverWidthBuilder oldWidget) {
    super.didUpdateWidget(oldWidget);
    _built = null;
  }

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.crossAxisExtent;
      final built = _built;
      // The same widget as last time, so nothing under it builds again.
      if (built != null && width == _width) return built;
      _width = width;
      return _built = widget.builder(width);
    },
  );
}
