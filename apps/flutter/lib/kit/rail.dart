import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'cards.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'states.dart';
import 'theme.dart';
import 'tokens.dart';

/// A rail's or a page section's heading. With [onPressed] it's a link to
/// the whole list, with a chevron after it; [seeAllLabel] is what a screen
/// reader hears it does.
class SectionTitle extends StatelessWidget {
  const SectionTitle({
    super.key,
    required this.title,
    this.onPressed,
    this.seeAllLabel,
  }) : assert(onPressed == null || seeAllLabel != null);

  final String title;
  final VoidCallback? onPressed;
  final String? seeAllLabel;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final text = Text(
      title,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: KitText.xl
          .style(color: colors.foreground, weight: FontWeight.w600)
          .copyWith(letterSpacing: KitText.xl.size * -.025),
    );
    final press = onPressed;
    if (press == null) return Semantics(header: true, child: text);
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: PressIndication(
        onPressed: press,
        shape: const BorderRadius.all(Radius.circular(4)),
        label: '$title, $seeAllLabel',
        builder: (context, state) => ExcludeSemantics(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 4,
            children: [
              Flexible(child: text),
              KitIcon(
                Lucide.chevronRight,
                color: state == PressState.pressed
                    ? colors.foreground
                    : colors.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A titled row of cards that scrolls sideways past the page's edge, each
/// [itemWidth] wide and [itemHeight] tall (see [CardMetrics.height]). The
/// list builds its cards as they scroll in. With no items, [empty] says
/// so in the row's place. It opens scrolled to [initialIndex], as a show's
/// episodes open at the one up next, with that card at the leading edge
/// in either text direction, or as near as the row scrolls: a card near
/// the end shows with the end of the row, and a row shorter than the
/// screen stays put.
class Rail extends StatefulWidget {
  const Rail({
    super.key,
    required this.title,
    required this.itemWidth,
    required this.itemHeight,
    required this.itemCount,
    required this.itemBuilder,
    this.onSeeAll,
    this.seeAllLabel,
    this.empty,
    this.initialIndex = 0,
  });

  final String title;
  final double itemWidth;
  final double itemHeight;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final VoidCallback? onSeeAll;
  final String? seeAllLabel;
  final String? empty;
  final int initialIndex;

  @override
  State<Rail> createState() => _RailState();
}

class _RailState extends State<Rail> {
  ScrollController? _scroll;

  /// Made at the first layout, when the row's width is known, so the first
  /// offset is one the row can scroll to: past its end, the list would
  /// spring back into place, a movement on first show.
  ScrollController _scrollFor(double viewport) {
    final widget = this.widget;
    final count = widget.itemCount;
    final extent =
        2 * CardMetrics.gutter +
        count * widget.itemWidth +
        math.max(0, count - 1) * CardMetrics.gap;
    final wanted = widget.initialIndex * (widget.itemWidth + CardMetrics.gap);
    return _scroll ??= ScrollController(
      initialScrollOffset: wanted.clamp(0, math.max(0, extent - viewport)),
    );
  }

  @override
  void dispose() {
    _scroll?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final widget = this.widget;
    final empty = widget.empty;
    final itemCount = widget.itemCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
          child: SectionTitle(
            title: widget.title,
            onPressed: widget.onSeeAll,
            seeAllLabel: widget.seeAllLabel,
          ),
        ),
        const SizedBox(height: 12),
        if (itemCount == 0 && empty != null)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: CardMetrics.gutter,
              vertical: 24,
            ),
            child: Text(
              empty,
              style: KitText.sm.style(
                color: MatineeTheme.of(context).mutedForeground,
              ),
            ),
          )
        else
          SizedBox(
            height: widget.itemHeight,
            child: LayoutBuilder(
              builder: (context, constraints) => ListView.separated(
                controller: _scrollFor(constraints.maxWidth),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: CardMetrics.gutter,
                ),
                itemCount: itemCount,
                separatorBuilder: (context, index) =>
                    const SizedBox(width: CardMetrics.gap),
                itemBuilder: (context, index) => SizedBox(
                  width: widget.itemWidth,
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: widget.itemBuilder(context, index),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Where a rail of cards goes while it loads: its heading, or a bar for
/// one not known yet, over blank cards about as tall as the real ones.
/// [label] is what a screen reader hears.
class RailSkeleton extends StatelessWidget {
  const RailSkeleton({
    super.key,
    required this.label,
    required this.itemWidth,
    required this.aspectRatio,
    this.title,
  });

  final String label;
  final double itemWidth;
  final double aspectRatio;
  final String? title;

  static const _cards = 4;

  @override
  Widget build(BuildContext context) {
    final title = this.title;
    return Semantics(
      label: label,
      container: true,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: title != null
                  ? SectionTitle(title: title)
                  : const Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: SkeletonBox(width: 180, height: 24),
                    ),
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: CardMetrics.gap,
                children: [
                  for (var i = 0; i < _cards; i++)
                    CardSkeleton(width: itemWidth, aspectRatio: aspectRatio),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One blank card: its frame, and bars where its two lines go.
class CardSkeleton extends StatelessWidget {
  const CardSkeleton({super.key, this.width, required this.aspectRatio});

  /// Null to fill the width it's given, as in a grid.
  final double? width;
  final double aspectRatio;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        AspectRatio(
          aspectRatio: aspectRatio,
          child: SkeletonBox(
            color: MatineeTheme.of(context).surface,
            radius: KitRadius.sm,
          ),
        ),
        const SizedBox(height: 10),
        const FractionallySizedBox(
          widthFactor: .7,
          child: SkeletonBox(height: 14),
        ),
        const SizedBox(height: 6),
        const FractionallySizedBox(
          widthFactor: .45,
          child: SkeletonBox(height: 12),
        ),
      ],
    ),
  );
}
