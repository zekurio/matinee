import 'dart:math' as math;

import 'package:flutter/rendering.dart'
    show
        RenderSliverSingleBoxAdapter,
        ScrollCacheExtent,
        SliverConstraints,
        SliverGeometry;
import 'package:flutter/widgets.dart';

import '../cards.dart' show WatchedBadge;
import '../icon.dart';
import '../spinner.dart';
import '../theme.dart';
import '../tone.dart';
import 'tv_buttons.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// A card's picture as the focus target: [child] over [toneKey]'s tone,
/// with the TV picture focus look. Select runs [onPressed]; holding Select
/// or pressing Menu runs [onLongPress], as opening the actions panel. Put
/// the card's caption, if any, outside it, so only the picture grows.
class TvArtCard extends StatelessWidget {
  const TvArtCard({
    super.key,
    required this.toneKey,
    required this.aspect,
    required this.onPressed,
    required this.children,
    this.onLongPress,
    this.focusNode,
    this.label,
    this.width,
    this.circle = false,
    this.onFocusChange,
  });

  final String toneKey;
  final double aspect;
  final double? width;
  final bool circle;
  final VoidCallback? onPressed;
  final VoidCallback? onLongPress;
  final FocusNode? focusNode;
  final String? label;
  final ValueChanged<bool>? onFocusChange;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    child: AspectRatio(
      aspectRatio: aspect,
      child: TvFocusable(
        focusNode: focusNode,
        onPressed: onPressed,
        onLongPress: onLongPress,
        onFocusChange: onFocusChange,
        label: label,
        builder: (context, focused) => TvPictureFocus(
          focused: focused,
          circle: circle,
          child: Tone(
            toneKey: toneKey,
            child: Stack(
              fit: StackFit.expand,
              alignment: Alignment.center,
              children: children,
            ),
          ),
        ),
      ),
    ),
  );
}

/// How far into a file the person is: the accent on a dark track.
class TvProgress extends StatelessWidget {
  const TvProgress(this.progress, {super.key});

  final double progress;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: const BorderRadius.all(Radius.circular(3)),
    child: SizedBox(
      height: 5,
      child: ColoredBox(
        color: const Color(0x80000000),
        child: FractionallySizedBox(
          alignment: AlignmentDirectional.centerStart,
          widthFactor: progress.clamp(0, 1),
          child: ColoredBox(color: MatineeTheme.of(context).accent),
        ),
      ),
    ),
  );
}

/// The round check on something watched, the phone's and the web's
/// [WatchedBadge] at a TV's size, read out as [label].
class TvWatchedMark extends StatelessWidget {
  const TvWatchedMark({super.key, required this.label});

  /// What a screen reader says, "Watched".
  final String label;

  /// Across, sized to read from a sofa.
  static const size = 26.0;

  @override
  Widget build(BuildContext context) => WatchedBadge(label: label, size: size);
}

/// A row's heading, one line of [TvType.title].
class TvRowTitle extends StatelessWidget {
  const TvRowTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: TvPage.start,
      end: TvPage.end,
    ),
    child: SizedBox(
      height: TvCards.titleHeight,
      child: Semantics(
        header: true,
        child: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TvType.title.style(color: MatineeTheme.of(context).foreground),
        ),
      ),
    ),
  );
}

/// A titled row of cards that scrolls sideways, as the Kotlin app's
/// `TvRow`. Cards pass out of sight at the drawer's rail on the left and at
/// the screen's edge on the right, and the focused card always stays clear
/// of both, with room for its ring. [row] names it in [memory], so it lands
/// on the card it left when focus comes back; give each card
/// `memory.node(row, key)`. [height] is a card's, caption and all.
class TvRow extends StatefulWidget {
  const TvRow({
    super.key,
    required this.title,
    required this.row,
    required this.memory,
    required this.height,
    required this.itemCount,
    required this.itemBuilder,
    this.gap = TvCards.gap,
  });

  final String? title;
  final String row;
  final TvFocusMemory memory;
  final double height;
  final double gap;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  @override
  State<TvRow> createState() => _TvRowState();
}

class _TvRowState extends State<TvRow> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    mainAxisSize: MainAxisSize.min,
    children: [
      if (widget.title case final title?) TvRowTitle(title),
      Padding(
        padding: const EdgeInsetsDirectional.only(
          start: TvPage.start - TvCards.rowInset,
        ),
        child: TvAxisClip(
          child: SizedBox(
            height: widget.height + TvCards.titleGap + 4,
            child: TvMemoryRow(
              memory: widget.memory,
              row: widget.row,
              child: TvFollowFocus(
                controller: _scroll,
                axis: Axis.horizontal,
                rule: TvFollowFocus.clear(
                  start: TvCards.rowInset,
                  end: TvPage.end + TvCards.rowInset,
                ),
                child: ListView.separated(
                  controller: _scroll,
                  scrollDirection: Axis.horizontal,
                  clipBehavior: Clip.none,
                  scrollCacheExtent: const ScrollCacheExtent.pixels(800),
                  padding: const EdgeInsetsDirectional.only(
                    start: TvCards.rowInset,
                    end: TvPage.end,
                    top: TvCards.titleGap,
                    bottom: 4,
                  ),
                  itemCount: widget.itemCount,
                  separatorBuilder: (_, _) => SizedBox(width: widget.gap),
                  itemBuilder: (context, index) => Align(
                    alignment: Alignment.topCenter,
                    child: widget.itemBuilder(context, index),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

/// A page of rows under a fixed header, as the Kotlin app's `PinnedRows`:
/// whichever row takes focus scrolls to the same place, the focused card
/// [pivot] below the list's top with its heading above it, and the list's
/// top fades over [fade]. [children] are the rows, [gap] apart, and the
/// last can come up to where the others stop, no further ([TvRowsScroll]).
class TvPinnedList extends StatefulWidget {
  const TvPinnedList({
    super.key,
    required this.children,
    this.pivot = TvCards.titleHeight + TvCards.titleGap + 12,
    this.gap = 28,
    this.top = 12,
    this.fade = 0,
    this.controller,
  });

  final List<Widget> children;
  final double pivot;
  final double gap;
  final double top;
  final double fade;
  final ScrollController? controller;

  @override
  State<TvPinnedList> createState() => _TvPinnedListState();
}

class _TvPinnedListState extends State<TvPinnedList> {
  ScrollController? _own;

  ScrollController get _scroll =>
      widget.controller ?? (_own ??= ScrollController());

  @override
  void dispose() {
    _own?.dispose();
    super.dispose();
  }

  // Rows that scrolled away are still laid out, and the list doesn't clip
  // so a focused card's ring keeps its sides: clipped at its top alone,
  // they can't show over the fixed header above it.
  @override
  Widget build(BuildContext context) => ClipRect(
    clipper: const _ClipAbove(),
    child: TvFadeTop(
      fade: widget.fade,
      child: TvFollowFocus(
        controller: _scroll,
        rule: TvFollowFocus.pinned(widget.pivot),
        sectionTop: widget.gap,
        child: TvRowsScroll(
          controller: _scroll,
          top: widget.top,
          gap: widget.gap,
          rows: widget.children,
        ),
      ),
    ),
  );
}

/// A grid of cards under a header that steps away once focus goes past the
/// first row, as the Kotlin app's `TvPosterGrid`: [columns] across, it
/// scrolls by whole rows, keeping the focused card in full view. Focus
/// coming into it lands on the card it left. [line] names the focused card
/// between the header and the grid, empty while the header has focus, and
/// has the top to itself while the header is away. [onNearEnd] asks for more as the last rows near.
/// [scrollKey] changing, as a new sort, scrolls back to the top. [cellAspect]
/// is a cell's width over its height, and [cellExtra] what a caption adds.
/// With [cellWidth], as many columns as fit cells that wide, which then
/// stretch to fill the row, so no strip is left at the end.
class TvPosterGrid extends StatefulWidget {
  const TvPosterGrid({
    super.key,
    required this.memory,
    required this.itemCount,
    required this.itemBuilder,
    required this.cellAspect,
    this.cellExtra = 0,
    this.columns = TvGrid.columns,
    this.cellWidth,
    this.header,
    this.line,
    this.lineHeight = 30,
    this.onNearEnd,
    this.scrollKey,
    this.footer,
  });

  final TvFocusMemory memory;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final double cellAspect;

  /// Height a cell has beyond its [cellAspect], as a caption under a poster.
  final double cellExtra;
  final int columns;
  final double? cellWidth;
  final Widget? header;
  final Widget? line;
  final double lineHeight;
  final VoidCallback? onNearEnd;
  final Object? scrollKey;
  final Widget? footer;

  @override
  State<TvPosterGrid> createState() => _TvPosterGridState();
}

class _TvPosterGridState extends State<TvPosterGrid> {
  final _scroll = ScrollController();

  /// The row of the card that had focus last; -1 while the header has it.
  int _focusRow = 0;
  double _pitch = 0;
  double _cell = 0;
  late int _columns = widget.columns;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_nearEnd);
  }

  @override
  void didUpdateWidget(TvPosterGrid old) {
    super.didUpdateWidget(old);
    if (old.scrollKey != widget.scrollKey && _scroll.hasClients) {
      _scroll.jumpTo(0);
      _focusRow = 0;
    }
    if (old.itemCount != widget.itemCount) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _nearEnd());
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _nearEnd() {
    final more = widget.onNearEnd;
    if (more == null || !mounted || !_scroll.hasClients) return;
    final position = _scroll.position;
    if (position.extentAfter < _pitch * 3 + position.viewportDimension) {
      more();
    }
  }

  void _focusedRow(int row) {
    if (row == _focusRow) return;
    setState(() => _focusRow = row);
    if (row >= 0) _nearEnd();
  }

  double _rule(double offset, double end, double viewport) {
    const edge = TvGrid.inset;
    final pitch = _pitch;
    if (pitch <= 0) return 0;
    final height = math.max(end - offset, _cell);
    final bottom = viewport - edge;
    final rows = (offset - edge) / pitch;
    final aligned = rows - (rows + .01).floorToDouble() < .02;
    if (offset >= edge - 1 && offset + height <= bottom + 1 && aligned) {
      return 0;
    }
    if (offset < edge) return offset - edge;
    final above = ((bottom - edge - height) / pitch).floor().clamp(
      0,
      (rows + .01).floor(),
    );
    return offset - (edge + above * pitch);
  }

  @override
  Widget build(BuildContext context) {
    final shown = _focusRow < 1;
    final header = widget.header;
    final line = widget.line;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AnimatedSize(
          duration: shown ? TvMotion.enter : TvMotion.exit,
          curve: shown ? TvMotion.easing : TvMotion.exitEasing,
          alignment: Alignment.topCenter,
          child: AnimatedOpacity(
            opacity: shown ? 1 : 0,
            duration: shown ? TvMotion.enter : TvMotion.exit,
            child: shown && header != null
                ? Focus(
                    canRequestFocus: false,
                    skipTraversal: true,
                    onFocusChange: (focused) {
                      if (focused) _focusedRow(-1);
                    },
                    child: Padding(
                      padding: const EdgeInsets.only(top: TvGrid.top),
                      child: header,
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ),
        if (line != null || !shown)
          AnimatedPadding(
            duration: TvMotion.enter,
            curve: TvMotion.easing,
            padding: EdgeInsetsDirectional.only(
              start: TvPage.start,
              end: shown ? TvPage.end : TvPage.end + TvGrid.clockRoom,
              top: line != null && shown ? TvGrid.lineGap : TvGrid.top,
            ),
            // The header's controls name no card, so the line is empty
            // while one has focus.
            child: SizedBox(
              height: widget.lineHeight,
              child: _focusRow < 0 ? null : line,
            ),
          ),
        Expanded(
          child: Padding(
            padding: const EdgeInsetsDirectional.only(
              start: TvPage.start - TvGrid.inset,
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.maxWidth - TvGrid.inset - TvPage.end;
                final fixed = widget.cellWidth;
                final columns = _columns = fixed == null
                    ? widget.columns
                    : ((width + TvGrid.gap) / (fixed + TvGrid.gap))
                          .floor()
                          .clamp(1, 24);
                final cellWidth =
                    (width - TvGrid.gap * (columns - 1)) / columns;
                _cell = cellWidth / widget.cellAspect + widget.cellExtra;
                _pitch = _cell + TvGrid.rowGap;
                final room = math.max(
                  constraints.maxHeight - TvGrid.inset - _cell,
                  48.0,
                );
                // Rows that scrolled away are still laid out, and the
                // grid doesn't clip so a focused card's ring keeps its
                // sides: clipped at its top alone, they can't show over
                // the header or the line above it.
                return ClipRect(
                  clipper: const _ClipAbove(),
                  child: TvFadeTop(
                    child: TvMemoryRow(
                      memory: widget.memory,
                      row: TvGrid.row,
                      child: TvFollowFocus(
                        controller: _scroll,
                        rule: _rule,
                        child: CustomScrollView(
                          controller: _scroll,
                          clipBehavior: Clip.none,
                          scrollCacheExtent: const ScrollCacheExtent.pixels(
                            800,
                          ),
                          slivers: [
                            SliverPadding(
                              padding: const EdgeInsetsDirectional.only(
                                start: TvGrid.inset,
                                end: TvPage.end,
                                top: TvGrid.inset,
                              ),
                              sliver: SliverGrid.builder(
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: columns,
                                      crossAxisSpacing: TvGrid.gap,
                                      mainAxisSpacing: TvGrid.rowGap,
                                      mainAxisExtent: _cell,
                                    ),
                                itemCount: widget.itemCount,
                                itemBuilder: (context, index) => Focus(
                                  canRequestFocus: false,
                                  skipTraversal: true,
                                  onFocusChange: (focused) {
                                    if (focused) {
                                      _focusedRow(index ~/ _columns);
                                    }
                                  },
                                  child: widget.itemBuilder(context, index),
                                ),
                              ),
                            ),
                            if (widget.footer case final footer?)
                              SliverPadding(
                                padding: const EdgeInsetsDirectional.only(
                                  start: TvGrid.inset,
                                  end: TvPage.end,
                                ),
                                sliver: SliverToBoxAdapter(child: footer),
                              ),
                            SliverToBoxAdapter(child: SizedBox(height: room)),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// What a grid or a row shows in place of its cards: a [headline] and a
/// [message], with a retry for [onRetry].
class TvNotice extends StatelessWidget {
  const TvNotice({
    super.key,
    required this.headline,
    this.message,
    this.onRetry,
    this.retryLabel,
    this.top = 28,
  });

  final String headline;
  final String? message;
  final VoidCallback? onRetry;
  final String? retryLabel;
  final double top;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: EdgeInsets.only(top: top),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            headline,
            style: TvType.title.style(
              color: colors.foreground.withValues(alpha: .9),
            ),
          ),
          if (message case final text?)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                text,
                style: TvType.body.style(color: colors.mutedForeground),
              ),
            ),
          if (onRetry case final retry?)
            Padding(
              padding: const EdgeInsets.only(top: 20),
              child: TvButton(
                label: retryLabel ?? 'Retry',
                icon: Lucide.refreshCw,
                onPressed: retry,
              ),
            ),
        ],
      ),
    );
  }
}

/// A spinner where a grid's or a row's cards will be.
class TvLoading extends StatelessWidget {
  const TvLoading({super.key, this.size = 32, this.top = 76});

  final double size;
  final double top;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(top: top, bottom: 16),
    child: Center(
      child: Spinner(
        size: size,
        color: MatineeTheme.of(context).mutedForeground,
      ),
    ),
  );
}

/// A detail page, as the Kotlin app's `DetailList`: [header] first, with
/// its buttons, then [rows] below it, reached with Down. While the header
/// has focus the page sits at its top; once a row has it, each row scrolls
/// to [pivot] below the top, as Home's do, but stops where the row above
/// has just gone, a [gap] over its heading, rather than leave it cut at the
/// top. The top fades over [fade] while scrolled, no further than the gap,
/// so a row's heading there stays clear.
class TvHeaderList extends StatefulWidget {
  const TvHeaderList({
    super.key,
    required this.header,
    required this.rows,
    this.pivot = 88,
    this.fade = 32,
    this.gap = 32,
  });

  final Widget header;
  final List<Widget> rows;
  final double pivot;
  final double fade;
  final double gap;

  @override
  State<TvHeaderList> createState() => _TvHeaderListState();
}

class _TvHeaderListState extends State<TvHeaderList> {
  final _scroll = ScrollController();
  final _header = FocusNode(
    skipTraversal: true,
    canRequestFocus: false,
    debugLabel: 'header',
  );
  var _scrolled = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_moved);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _header.dispose();
    super.dispose();
  }

  void _moved() {
    final scrolled = _scroll.offset > 0;
    if (scrolled != _scrolled) setState(() => _scrolled = scrolled);
  }

  double _rule(double start, double end, double viewport) =>
      _header.hasFocus ? -_scroll.offset : start - widget.pivot;

  @override
  Widget build(BuildContext context) => TvFadeTop(
    fade: _scrolled ? widget.fade : 0,
    child: TvFollowFocus(
      controller: _scroll,
      rule: _rule,
      sectionTop: widget.gap,
      child: TvRowsScroll(
        controller: _scroll,
        gap: widget.gap,
        rows: [
          Focus(focusNode: _header, child: widget.header),
          ...widget.rows,
        ],
      ),
    ),
  );
}

/// Clips what's above the top edge and nothing at the sides or below.
class _ClipAbove extends CustomClipper<Rect> {
  const _ClipAbove();

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(-size.width, 0, size.width * 2, size.height * 2);

  @override
  bool shouldReclip(_ClipAbove oldClipper) => false;
}

/// A page's rows, [gap] apart under [top], as one scroll for a
/// [TvFollowFocus] with a `sectionTop` of [gap]: each row is a [TvSection].
/// The scroll ends where the D-pad leaves the last row, [gap] below the top
/// where it shows whole there, so neither the D-pad nor a drag takes it
/// further; rows that fit on the screen don't scroll at all.
class TvRowsScroll extends StatelessWidget {
  const TvRowsScroll({
    super.key,
    required this.controller,
    required this.rows,
    required this.gap,
    this.top = 0,
    this.cacheExtent = 1200,
  });

  final ScrollController controller;
  final List<Widget> rows;
  final double gap;
  final double top;
  final double cacheExtent;

  @override
  Widget build(BuildContext context) {
    final last = rows.length - 1;
    return CustomScrollView(
      controller: controller,
      clipBehavior: Clip.none,
      scrollCacheExtent: ScrollCacheExtent.pixels(cacheExtent),
      slivers: [
        if (top > 0) SliverToBoxAdapter(child: SizedBox(height: top)),
        if (last > 0)
          SliverList.separated(
            itemCount: last,
            separatorBuilder: (_, _) => SizedBox(height: gap),
            itemBuilder: (context, index) => TvSection(child: rows[index]),
          ),
        if (last > 0) SliverToBoxAdapter(child: SizedBox(height: gap)),
        if (last >= 0)
          _LastRow(
            stop: gap,
            child: TvSection(child: rows[last]),
          ),
      ],
    );
  }
}

/// The last row, whose scroll ends with it [stop] below the top, higher
/// when it wouldn't show whole there, and at the list's start when it
/// starts higher than that. Room follows it to there, and when it's taller
/// than what's left, it draws past the end.
class _LastRow extends SingleChildRenderObjectWidget {
  const _LastRow({required this.stop, super.child});

  final double stop;

  @override
  _RenderLastRow createRenderObject(BuildContext context) =>
      _RenderLastRow(stop);

  @override
  void updateRenderObject(BuildContext context, _RenderLastRow renderObject) {
    renderObject.stop = stop;
  }
}

class _RenderLastRow extends RenderSliverSingleBoxAdapter {
  _RenderLastRow(this._stop);

  double _stop;
  set stop(double value) {
    if (value == _stop) return;
    _stop = value;
    markNeedsLayout();
  }

  @override
  void performLayout() {
    final child = this.child;
    if (child == null) {
      geometry = SliverGeometry.zero;
      return;
    }
    final SliverConstraints constraints = this.constraints;
    child.layout(constraints.asBoxConstraints(), parentUsesSize: true);
    final height = child.size.height;
    // The scroll ends with the row [stop] below the top, or higher when
    // it would not show whole there, or at 0 when it starts higher than
    // that: what's above it, plus this, less the viewport.
    final above = constraints.precedingScrollExtent;
    final viewport = constraints.viewportMainAxisExtent;
    // A row starting that high is where focus puts it already.
    final top = above <= _stop ? above : (viewport - height).clamp(0.0, _stop);
    final extent = math.max(0.0, viewport - top);
    final drawn = math.max(extent, height);
    final laid = calculatePaintOffset(constraints, from: 0, to: extent);
    final painted = calculatePaintOffset(constraints, from: 0, to: drawn);
    geometry = SliverGeometry(
      scrollExtent: extent,
      layoutExtent: laid,
      paintExtent: painted,
      cacheExtent: calculateCacheOffset(constraints, from: 0, to: drawn),
      maxPaintExtent: drawn,
      hitTestExtent: painted,
      hasVisualOverflow:
          drawn > constraints.remainingPaintExtent ||
          constraints.scrollOffset > 0,
    );
    setChildParentData(child, constraints, geometry!);
  }
}
