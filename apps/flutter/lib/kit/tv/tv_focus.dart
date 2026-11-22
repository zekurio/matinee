import 'dart:async';

import 'package:flutter/gestures.dart' show kLongPressTimeout;
import 'package:flutter/rendering.dart'
    show RenderSliverMultiBoxAdaptor, ScrollDirection;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../theme.dart';
import '../tokens.dart';
import 'tv_metrics.dart';

/// How a focused thing on a TV stands out. There are two looks, and every
/// focusable thing takes one of them:
///
/// - A picture (a poster, a still, a person's photo) keeps its picture
///   visible, so it grows, lifts, and gets a ring clear of its edge:
///   [TvPictureFocus].
/// - A control (a button, a chip, a list row, a drawer entry, a field)
///   fills with the text color and its content turns dark, with no ring:
///   [TvControl].
///
/// Focus moves with the D-pad by [TvTraversalPolicy], which the TV's
/// screens sit under; Select presses, and held as long as a long press, or
/// with Menu, long-presses ([TvFocusable]).
abstract final class TvFocus {
  /// How much a focused picture grows.
  static const scale = 1.06;

  /// How much a focused button, chip, or tab grows.
  static const controlScale = 1.05;

  /// How much a focused list row grows, less since rows sit close.
  static const rowScale = 1.02;

  static const ring = 3.0;
  static const gap = 3.0;
  static const lift = 16.0;

  /// A control's fill while it doesn't have focus, so its shape shows on
  /// any backdrop or picture.
  static Color rest(KitColors colors) =>
      colors.foreground.withValues(alpha: .12);

  /// [rest] over most of the background, for a control that sits on a
  /// backdrop busy or light enough to swallow the plain fill, as a grid
  /// page's sort, genre, and search.
  static Color restOnPicture(KitColors colors) =>
      Color.alphaBlend(rest(colors), colors.background.withValues(alpha: .78));
}

/// The keys that press a TV control: the remote's centre, Enter, and a
/// game pad's A.
bool isTvSelectKey(LogicalKeyboardKey key) =>
    key == LogicalKeyboardKey.select ||
    key == LogicalKeyboardKey.enter ||
    key == LogicalKeyboardKey.numpadEnter ||
    key == LogicalKeyboardKey.gameButtonA;

/// Something on a TV that takes focus, in place of a button's detector:
/// Select or Enter presses on release, and held as long as a long press,
/// or with the remote's Menu key, runs [onLongPress] instead. A tap or a
/// click focuses it before pressing it, so the pointer and the D-pad share
/// one focus, unless [focusOnTap] is off. [builder] draws it, knowing
/// whether it has focus. [onKey] sees every key first, as a chart's arrows.
/// Disabled, it can't take focus.
class TvFocusable extends StatefulWidget {
  const TvFocusable({
    super.key,
    required this.builder,
    this.onPressed,
    this.onLongPress,
    this.focusNode,
    this.autofocus = false,
    this.enabled = true,
    this.label,
    this.value,
    this.button = true,
    this.selected,
    this.checked,
    this.onFocusChange,
    this.onKey,
    this.focusOnTap = true,
  });

  final Widget Function(BuildContext context, bool focused) builder;
  final VoidCallback? onPressed;
  final VoidCallback? onLongPress;
  final FocusNode? focusNode;
  final bool autofocus;
  final bool enabled;
  final String? label;
  final String? value;
  final bool button;
  final bool? selected;
  final bool? checked;
  final ValueChanged<bool>? onFocusChange;
  final KeyEventResult Function(KeyEvent event)? onKey;

  /// Whether a tap or a click focuses it before pressing it. The drawer's
  /// rail turns this off, since focus there opens the drawer.
  final bool focusOnTap;

  @override
  State<TvFocusable> createState() => _TvFocusableState();
}

class _TvFocusableState extends State<TvFocusable> {
  FocusNode? _own;
  bool _focused = false;
  bool _down = false;
  Timer? _held;

  FocusNode get _node => widget.focusNode ?? (_own ??= FocusNode());

  @override
  void initState() {
    super.initState();
    _attach(_node);
  }

  @override
  void didUpdateWidget(TvFocusable old) {
    super.didUpdateWidget(old);
    final before = old.focusNode ?? _own;
    if (before != _node && before != null) {
      before.removeListener(_changed);
      _attach(_node);
    }
  }

  void _attach(FocusNode node) {
    node.addListener(_changed);
    _focused = node.hasPrimaryFocus;
    if (node is TvMemoryNode) node.memory._mounted();
  }

  @override
  void deactivate() {
    if (_node case final TvMemoryNode node) node.memory._leaving(node);
    super.deactivate();
  }

  @override
  void dispose() {
    _node.removeListener(_changed);
    _held?.cancel();
    _own?.dispose();
    super.dispose();
  }

  void _changed() {
    final focused = _node.hasPrimaryFocus;
    if (focused == _focused) return;
    if (!focused) {
      _down = false;
      _held?.cancel();
    }
    setState(() => _focused = focused);
    widget.onFocusChange?.call(focused);
  }

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    final own = widget.onKey?.call(event);
    if (own == KeyEventResult.handled) return own!;
    if (!widget.enabled) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (isTvSelectKey(key)) {
      switch (event) {
        case KeyDownEvent():
          _down = true;
          _held?.cancel();
          if (widget.onLongPress != null) {
            _held = Timer(kLongPressTimeout, () {
              _down = false;
              widget.onLongPress?.call();
            });
          }
        case KeyUpEvent():
          if (_down) {
            _down = false;
            _held?.cancel();
            widget.onPressed?.call();
          }
        case KeyRepeatEvent():
      }
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.contextMenu && widget.onLongPress != null) {
      if (event is KeyUpEvent) widget.onLongPress?.call();
      return KeyEventResult.handled;
    }
    return own ?? KeyEventResult.ignored;
  }

  void _tap() {
    if (widget.focusOnTap) _node.requestFocus();
    widget.onPressed?.call();
  }

  void _longTap() {
    _node.requestFocus();
    widget.onLongPress?.call();
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.enabled;
    return Semantics(
      container: true,
      button: widget.button,
      enabled: enabled,
      label: widget.label,
      value: widget.value,
      selected: widget.selected,
      checked: widget.checked,
      onTap: enabled && widget.onPressed != null ? _tap : null,
      onLongPress: enabled && widget.onLongPress != null ? _longTap : null,
      child: Focus(
        focusNode: _node,
        autofocus: widget.autofocus,
        canRequestFocus: enabled,
        onKeyEvent: _key,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onTap: enabled ? _tap : null,
          onLongPress: enabled && widget.onLongPress != null ? _longTap : null,
          child: widget.builder(context, _focused),
        ),
      ),
    );
  }
}

/// The focus look for a control: focused, it grows by [scale] and fills
/// with the text color, its content dark; otherwise it shows [rest], its
/// content [content]. [builder] gets the content's color as it changes.
class TvControl extends StatelessWidget {
  const TvControl({
    super.key,
    required this.focused,
    required this.builder,
    this.radius = KitRadius.pill,
    this.rest,
    this.content,
    this.scale = TvFocus.controlScale,
  });

  final bool focused;
  final BorderRadius radius;
  final Color? rest;
  final Color? content;
  final double scale;
  final Widget Function(BuildContext context, Color content) builder;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final rest = this.rest ?? TvFocus.rest(colors);
    final content = this.content ?? colors.foreground;
    return TweenAnimationBuilder<double>(
      tween: Tween(end: focused ? 1 : 0),
      duration: focused ? TvMotion.enter : TvMotion.exit,
      curve: focused ? TvMotion.easing : TvMotion.exitEasing,
      builder: (context, t, _) => Transform.scale(
        scale: 1 + (scale - 1) * t,
        child: ClipRRect(
          borderRadius: radius,
          child: ColoredBox(
            color: Color.lerp(rest, colors.foreground, t)!,
            child: builder(context, Color.lerp(content, colors.background, t)!),
          ),
        ),
      ),
    );
  }
}

/// The focus look for a picture: it grows by [scale], lifts, and gets a
/// ring clear of its edge. [child] is clipped to [radius], or a circle.
class TvPictureFocus extends StatelessWidget {
  const TvPictureFocus({
    super.key,
    required this.focused,
    required this.child,
    this.radius = TvCards.radius,
    this.circle = false,
    this.scale = TvFocus.scale,
  });

  final bool focused;
  final BorderRadius radius;
  final bool circle;
  final double scale;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ring = MatineeTheme.of(context).foreground;
    final clipped = circle
        ? ClipOval(child: child)
        : ClipRRect(borderRadius: radius, child: child);
    return TweenAnimationBuilder<double>(
      tween: Tween(end: focused ? 1 : 0),
      duration: focused ? TvMotion.enter : TvMotion.exit,
      curve: focused ? TvMotion.easing : TvMotion.exitEasing,
      child: clipped,
      builder: (context, t, picture) => Transform.scale(
        scale: 1 + (scale - 1) * t,
        child: CustomPaint(
          foregroundPainter: t > 0
              ? _Ring(radius, circle, ring.withValues(alpha: t))
              : null,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: circle ? null : radius,
              shape: circle ? BoxShape.circle : BoxShape.rectangle,
              boxShadow: t > 0
                  ? [
                      BoxShadow(
                        color: const Color(0xFF000000)
                            .withValues(alpha: .5 * t),
                        blurRadius: TvFocus.lift * t,
                        offset: Offset(0, TvFocus.lift * t / 3),
                      ),
                    ]
                  : null,
            ),
            child: picture,
          ),
        ),
      ),
    );
  }
}

class _Ring extends CustomPainter {
  const _Ring(this.radius, this.circle, this.color);

  final BorderRadius radius;
  final bool circle;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final out = TvFocus.gap + TvFocus.ring / 2;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = TvFocus.ring;
    final rect = (Offset.zero & size).inflate(out);
    if (circle) {
      canvas.drawOval(rect, paint);
    } else {
      canvas.drawRRect(radius.toRRect(Offset.zero & size).inflate(out), paint);
    }
  }

  @override
  bool shouldRepaint(_Ring old) =>
      old.color != color || old.radius != radius || old.circle != circle;
}

/// A row of cards in a page's [TvFocusMemory]: focus coming into it from
/// another row lands on the card it left, or the one the page named with
/// [TvFocusMemory.startAt]. Moves sideways stay in it.
class TvRowNode extends FocusNode {
  TvRowNode._(this._remembered, {super.debugLabel})
    : super(skipTraversal: true, canRequestFocus: false);

  final FocusNode? Function() _remembered;

  /// The card focus should land on as it comes in, when it's on screen.
  FocusNode? get remembered {
    final node = _remembered();
    if (node == null || node.context == null || !node.canRequestFocus) {
      return null;
    }
    return _inside(node, this) ? node : null;
  }
}

/// [node] is under [ancestor] now. A detached node keeps its cached
/// `ancestors`, and its element may hold another card's node by then, as
/// a row that loaded again reuses its cards, so walk its parents instead.
bool _inside(FocusNode node, FocusNode ancestor) {
  for (var parent = node.parent; parent != null; parent = parent.parent) {
    if (parent == ancestor) return true;
  }
  return false;
}

/// A focus scope over the page, like the drawer or a side panel, which
/// keeps focus while it has it.
class TvOverlayScopeNode extends FocusScopeNode {
  TvOverlayScopeNode({super.debugLabel})
    : super(
        traversalEdgeBehavior: TraversalEdgeBehavior.stop,
        directionalTraversalEdgeBehavior: TraversalEdgeBehavior.stop,
      );
}

/// Moves focus with the D-pad for every TV screen, these rules over Flutter's
/// directional search: a move sideways stays in its row of cards; a move into
/// another row lands on the card that row had last; and nothing scrolls by
/// itself, since each list scrolls to the card that takes focus as a TV's lists
/// do ([TvFollowFocus]). A move that finds nothing returns false, so
/// [TvDirectionalFocusAction] can try the drawer.
class TvTraversalPolicy extends ReadingOrderTraversalPolicy {
  TvTraversalPolicy() : super(requestFocusCallback: _request);

  static TraversalDirection? _direction;
  static bool _moved = false;

  @override
  bool inDirection(FocusNode currentNode, TraversalDirection direction) {
    _direction = direction;
    _moved = false;
    try {
      super.inDirection(currentNode, direction);
    } finally {
      _direction = null;
    }
    // A refused move mustn't stay in the history the policy walks back.
    if (!_moved) {
      final scope = currentNode.nearestScope;
      if (scope != null) invalidateScopeData(scope);
    }
    return _moved;
  }

  static void _request(
    FocusNode node, {
    double? alignment,
    ScrollPositionAlignmentPolicy? alignmentPolicy,
    Curve? curve,
    Duration? duration,
  }) {
    final target = _redirect(
      FocusManager.instance.primaryFocus,
      node,
      _direction,
    );
    if (target == null) return;
    if (!target.hasPrimaryFocus) _moved = true;
    target.requestFocus();
  }

  /// Where a move from [from] to [to] lands, or null when it shouldn't.
  static FocusNode? _redirect(
    FocusNode? from,
    FocusNode to,
    TraversalDirection? direction,
  ) {
    final fromRow = from == null ? null : rowOf(from);
    final toRow = rowOf(to);
    final sideways =
        direction == TraversalDirection.left ||
        direction == TraversalDirection.right;
    if (sideways && fromRow != null && toRow != fromRow) return null;
    if (toRow != null && toRow != fromRow) return toRow.remembered ?? to;
    return to;
  }

  /// The row of cards [node] is in, if any.
  static TvRowNode? rowOf(FocusNode node) {
    for (final ancestor in node.ancestors) {
      if (ancestor is TvRowNode) return ancestor;
    }
    return null;
  }
}

/// The D-pad's arrows under [TvTraversalPolicy], with [onEdge] for a move
/// that found nothing, as Left from a page's first column opening the
/// drawer.
class TvDirectionalFocusAction extends Action<DirectionalFocusIntent> {
  TvDirectionalFocusAction({this.onEdge});

  final void Function(TraversalDirection direction)? onEdge;

  @override
  bool isEnabled(DirectionalFocusIntent intent) {
    final context = primaryFocus?.context;
    return !intent.ignoreTextFields ||
        context == null ||
        context.widget is! EditableText;
  }

  @override
  void invoke(DirectionalFocusIntent intent) {
    final node = primaryFocus;
    if (node == null) return;
    if (!node.focusInDirection(intent.direction)) {
      onEdge?.call(intent.direction);
    }
  }
}

/// Puts [child] under the TV's focus rules: [TvTraversalPolicy], and the
/// arrows through [TvDirectionalFocusAction].
class TvFocusRules extends StatelessWidget {
  const TvFocusRules({super.key, required this.child, this.onEdge});

  final Widget child;
  final void Function(TraversalDirection direction)? onEdge;

  @override
  Widget build(BuildContext context) => Actions(
    actions: {DirectionalFocusIntent: TvDirectionalFocusAction(onEdge: onEdge)},
    child: FocusTraversalGroup(policy: TvTraversalPolicy(), child: child),
  );
}

/// A card's focus node in a [TvFocusMemory].
class TvMemoryNode extends FocusNode {
  TvMemoryNode._(this.memory, this.row, this.key)
    : super(debugLabel: '$row/$key');

  final TvFocusMemory memory;
  final String row;
  final String key;
}

/// Where focus was on a page, kept while the page is on the back stack: the row
/// and card that had it last, and the card each row had last. A row opened
/// again by Up or Down lands on its own card, and a page coming back focuses
/// the card that opened what was on top. Keys are the page's own, like an
/// item's id.
///
/// Give each card [node] for its row and key, wrap each row in [TvMemoryRow],
/// and call [restore] from the page's build with where to start the first
/// time. Dispose it with the page.
class TvFocusMemory {
  TvFocusMemory();

  String? lastRow;
  String? lastItem;

  /// The card each row had last, by row.
  final rowItems = <String, String>{};

  final _nodes = <(String, String), TvMemoryNode>{};
  final _rows = <String, TvRowNode>{};
  (String, String)? Function()? _fallback;
  ModalRoute<Object?>? _route;
  FocusScopeNode? _scope;
  bool _restored = false;
  bool _scheduled = false;
  bool _disposed = false;
  Timer? _openingTimer;

  /// [restore] is still waiting for the card it starts on, as a page loads.
  bool opening = false;

  /// The focus node of the card [key] in [row].
  TvMemoryNode node(String row, String key) =>
      _nodes.putIfAbsent((row, key), () {
        final node = TvMemoryNode._(this, row, key);
        node.addListener(() {
          if (!node.hasPrimaryFocus) return;
          lastRow = row;
          lastItem = key;
          rowItems[row] = key;
        });
        return node;
      });

  /// The node of [row], for [TvMemoryRow].
  TvRowNode rowNode(String row) => _rows.putIfAbsent(
    row,
    () => TvRowNode._(() {
      final key = rowItems[row];
      return key == null ? null : _nodes[(row, key)];
    }, debugLabel: 'row $row'),
  );

  /// Lands focus coming into [row] on [key] the first time.
  void startAt(String row, String key) => rowItems.putIfAbsent(row, () => key);

  /// [row] and [key]'s node, if a card has it on screen.
  FocusNode? shown(String row, String key) {
    final node = _nodes[(row, key)];
    if (node == null ||
        node.context == null ||
        node.parent == null ||
        !node.canRequestFocus) {
      return null;
    }
    return node;
  }

  FocusNode? get _saved {
    final row = lastRow;
    final item = lastItem;
    return row == null || item == null ? null : shown(row, item);
  }

  FocusNode? get _start => switch (_fallback?.call()) {
    (final row, final key) => shown(row, key),
    null => null,
  };

  /// Focuses the card that had it last, or [fallback]'s the first time,
  /// once it's on screen. [fallback] is read again as cards show, so a
  /// page still loading can name its first card when it has one.
  void restore(BuildContext context, (String, String)? Function() fallback) {
    _fallback = fallback;
    _route = ModalRoute.of(context);
    _scope = FocusScope.of(context);
    _live.add(this);
    if (_restored) return;
    if (_openingTimer == null) {
      opening = true;
      // A page that never shows its card, as one that failed to load, lets
      // the shell focus what it has.
      _openingTimer = Timer(const Duration(seconds: 2), () => opening = false);
    }
    _schedule();
  }

  void _mounted() {
    if (!_restored && _fallback != null) _schedule();
  }

  /// The card that had focus as it left the screen, until the frame ends.
  TvMemoryNode? _left;

  /// [node] is leaving the screen. If it has focus, as a row's Try again
  /// does when the row loads, focus goes to the card [restore] starts on
  /// if that row has it, or else the first card the row shows, once the
  /// frame is built, rather than back to the card before it.
  void _leaving(TvMemoryNode node) {
    if (_disposed || !node.hasPrimaryFocus) return;
    _left = node;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      final left = _left;
      _left = null;
      if (left == null || _disposed || shown(left.row, left.key) != null) {
        return;
      }
      final row = _rows[left.row];
      if (row == null || row.context == null) return;
      final card =
          (switch (_fallback?.call()) {
            (final start, final key) when start == left.row => shown(
              start,
              key,
            ),
            _ => null,
          }) ??
          row.traversalDescendants
              .where((node) => node.canRequestFocus && !node.skipTraversal)
              .firstOrNull;
      if (card == null || !_here()) return;
      card.requestFocus();
    });
  }

  /// Focus is on this page, not the drawer or a panel over it.
  bool _here() {
    final primary = FocusManager.instance.primaryFocus;
    final scope = _scope;
    if (primary == null || scope == null) return true;
    return primary == scope ||
        primary.ancestors.contains(scope) ||
        (primary is FocusScopeNode && scope.ancestors.contains(primary));
  }

  void _schedule() {
    if (_scheduled || _disposed) return;
    _scheduled = true;
    SchedulerBinding.instance
      ..addPostFrameCallback((_) {
        _scheduled = false;
        _try();
      })
      ..ensureVisualUpdate();
  }

  /// What the shell focused when the page had no card to give it, which
  /// the page's card takes over from while it still has focus.
  FocusNode? _standIn;

  /// The shell focused [node] after waiting for the page's card.
  void standIn(FocusNode node) => _standIn = node;

  void _try() {
    if (_restored || _disposed) return;
    final route = _route;
    if (route != null && !route.isCurrent) return;
    // Focus still on the stand-in waits for the page's own card.
    final waited = _standIn?.hasPrimaryFocus ?? false;
    final target = waited ? _start : _saved ?? _start;
    if (target == null) return;
    _restored = true;
    opening = false;
    _openingTimer?.cancel();
    // The drawer or a panel took focus meanwhile: it keeps it.
    if (!_here()) return;
    target.requestFocus();
  }

  /// The memory of the page in [route], once it has called [restore].
  static TvFocusMemory? of(Route<Object?> route) {
    for (final memory in _live) {
      if (memory._route == route) return memory;
    }
    return null;
  }

  static final _live = <TvFocusMemory>{};

  /// Focuses the card that had focus last, if it's on screen, or else the
  /// one [restore] starts on: a row that loaded again may no longer have
  /// it. True while [restore] is still waiting for its card, so the shell
  /// doesn't put focus on whatever showed first meanwhile.
  bool focusLast() {
    final target = _saved ?? _start;
    if (target == null) return opening;
    target.requestFocus();
    return true;
  }

  void dispose() {
    _disposed = true;
    _live.remove(this);
    _openingTimer?.cancel();
    for (final node in _nodes.values) {
      node.dispose();
    }
    for (final node in _rows.values) {
      node.dispose();
    }
  }
}

/// A row of cards for [memory]: focus coming in lands on the card it left.
class TvMemoryRow extends StatelessWidget {
  const TvMemoryRow({
    super.key,
    required this.memory,
    required this.row,
    required this.child,
  });

  final TvFocusMemory memory;
  final String row;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Focus(focusNode: memory.rowNode(row), child: child);
}

/// How far a list along its axis should scroll for a focused child that
/// runs from [start] to [end] in a viewport [viewport] long: a distance,
/// or zero to stay.
typedef TvScrollRule = double Function(
  double start,
  double end,
  double viewport,
);

/// Scrolls [controller] as the rule says whenever something inside [child]
/// takes focus, in place of Flutter's scroll into view, so a TV's lists move
/// this way: rows only as far as it takes to keep the card clear of their
/// edges, a page of rows to put the focused one in the same place each time, a
/// grid by whole rows. [child] is the scroll view. With [sectionTop], a page of
/// sections, each a child of its list, the list only stops where a section
/// starts [sectionTop] below its top, the gap between sections, so the one
/// above has just gone: none is left cut at the top.
class TvFollowFocus extends StatefulWidget {
  const TvFollowFocus({
    super.key,
    required this.controller,
    required this.rule,
    required this.child,
    this.axis = Axis.vertical,
    this.duration = const Duration(milliseconds: 260),
    this.sectionTop,
  });

  final ScrollController controller;
  final TvScrollRule rule;
  final Axis axis;
  final Duration duration;
  final double? sectionTop;
  final Widget child;

  /// A row's rule: only as far as keeps the card [start] in from its start
  /// and [end] in from its end.
  static TvScrollRule clear({required double start, required double end}) =>
      (from, to, viewport) {
        if (from < start) return from - start;
        if (to > viewport - end) return to - (viewport - end);
        return 0;
      };

  /// A page of rows' rule: the focused card [pivot] below the top, always.
  static TvScrollRule pinned(double pivot) =>
      (from, to, viewport) => from - pivot;

  @override
  State<TvFollowFocus> createState() => _TvFollowFocusState();
}

class _TvFollowFocusState extends State<TvFollowFocus> {
  /// The [TvSection]s inside, for a list whose sections aren't its own
  /// children, as rows in one column.
  final _marked = <BuildContext>{};

  final _anchor = FocusNode(
    skipTraversal: true,
    canRequestFocus: false,
    debugLabel: 'follow focus',
  );

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addListener(_changed);
  }

  @override
  void dispose() {
    FocusManager.instance.removeListener(_changed);
    _anchor.dispose();
    super.dispose();
  }

  void _changed() {
    final node = FocusManager.instance.primaryFocus;
    if (node == null || !node.ancestors.contains(_anchor)) return;
    _follow(node);
  }

  /// A drag or fling of the list itself, as a touch or a mouse sends.
  var _dragged = false;

  /// Once a drag of the list settles, it comes back to the focused child,
  /// as a move of focus would take it: a TV's focus is never left on
  /// something scrolled away.
  bool _scrolled(ScrollNotification notification) {
    if (notification.depth != 0 || notification.metrics.axis != widget.axis) {
      return false;
    }
    if (notification is UserScrollNotification &&
        notification.direction != ScrollDirection.idle) {
      _dragged = true;
    } else if (notification is ScrollEndNotification && _dragged) {
      _dragged = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final node = FocusManager.instance.primaryFocus;
        if (!mounted || node == null || !node.ancestors.contains(_anchor)) {
          return;
        }
        _follow(node);
      });
    }
    return false;
  }

  void _follow(FocusNode node) {
    final target = node.context?.findRenderObject();
    final view = context.findRenderObject();
    if (target is! RenderBox || view is! RenderBox) return;
    if (!target.attached || !view.attached || !target.hasSize) return;
    final controller = widget.controller;
    if (!controller.hasClients) return;
    final at = target.localToGlobal(Offset.zero, ancestor: view);
    final vertical = widget.axis == Axis.vertical;
    final start = vertical ? at.dy : at.dx;
    final length = vertical ? target.size.height : target.size.width;
    final viewport = vertical ? view.size.height : view.size.width;
    final distance = widget.rule(start, start + length, viewport);
    final position = controller.position;
    var to = (position.pixels + distance).clamp(
      position.minScrollExtent,
      position.maxScrollExtent,
    );
    if (widget.sectionTop case final top?) {
      to = _sectionStop(target, position, to, start, length, viewport, top);
    }
    if ((to - position.pixels).abs() < .5) return;
    unawaited(
      position.animateTo(to, duration: widget.duration, curve: TvMotion.easing),
    );
  }

  /// Where the list stops near [to] so its top cuts no section: the top,
  /// or a section starting [sectionTop] down, so long as no section then
  /// runs across the top and the focused child, [start] to [start] +
  /// [length] in the viewport now, sits as the rule wants it, or failing
  /// that in full view. The nearest to [to]; [to] when none does.
  double _sectionStop(
    RenderBox target,
    ScrollPosition position,
    double to,
    double start,
    double length,
    double viewport,
    double sectionTop,
  ) {
    final view = context.findRenderObject();
    if (view is! RenderBox) return to;
    // Where each section runs in the scroll.
    final sections = <(double, double)>[];
    var known = double.negativeInfinity;
    if (_marked.isNotEmpty) {
      for (final marked in _marked) {
        final box = marked.findRenderObject();
        if (box is! RenderBox || !box.attached || !box.hasSize) continue;
        final from =
            position.pixels + box.localToGlobal(Offset.zero, ancestor: view).dy;
        sections.add((from, from + box.size.height));
      }
      sections.sort((a, b) => a.$1.compareTo(b.$1));
    } else {
      // The page's own list, the outermost under the viewport: the rows in
      // it have lists of their own.
      RenderSliverMultiBoxAdaptor? list;
      for (var parent = target.parent; parent != null && parent != view;) {
        if (parent is RenderSliverMultiBoxAdaptor) list = parent;
        parent = parent.parent;
      }
      if (list == null) return to;
      // The list's padding before its first child counts.
      final before = list.constraints.precedingScrollExtent;
      for (var section = list.firstChild; section != null;) {
        final from = before + list.childScrollOffset(section)!;
        sections.add((from, from + section.size.height));
        section = list.childAfter(section);
      }
      // Above the first child laid out, what's there is unknown.
      if (sections.isNotEmpty) known = sections.first.$1;
    }
    bool clean(double stop) =>
        (stop <= position.minScrollExtent || stop >= known - .5) &&
        !sections.any(
          (section) => section.$1 < stop - .5 && section.$2 > stop + .5,
        );
    final stops = {
      position.minScrollExtent,
      for (final (from, _) in sections) from - sectionTop,
      // Where the list ends, which keeps its last section in view.
      position.maxScrollExtent,
    };
    // Where the focused child runs, whatever the scroll.
    final at = position.pixels + start;
    double? nearest(bool Function(double top) fits) {
      double? best;
      for (final stop in stops) {
        if (stop < position.minScrollExtent ||
            stop > position.maxScrollExtent ||
            !clean(stop) ||
            !fits(at - stop)) {
          continue;
        }
        if (best == null || (stop - to).abs() < (best - to).abs()) {
          best = stop;
        }
      }
      return best;
    }

    // Stay put when the list already cuts nothing and needn't move.
    if (to == position.pixels && clean(to)) return to;
    return nearest(
          (top) => widget.rule(top, top + length, viewport).abs() < .5,
        ) ??
        nearest((top) => top >= 0 && top + length <= viewport) ??
        to;
  }

  @override
  Widget build(BuildContext context) => _TvSectionScope(
    state: this,
    child: NotificationListener<ScrollNotification>(
      onNotification: _scrolled,
      child: Focus(focusNode: _anchor, child: widget.child),
    ),
  );
}

class _TvSectionScope extends InheritedWidget {
  const _TvSectionScope({required this.state, required super.child});

  final _TvFollowFocusState state;

  @override
  bool updateShouldNotify(_TvSectionScope old) => old.state != state;
}

/// Marks [child] as one of a page's sections for the [TvFollowFocus] it's
/// in, where the list's own children aren't the sections, as a column of
/// rows: the list stops only where none of them is cut at its top.
class TvSection extends StatefulWidget {
  const TvSection({super.key, required this.child});

  final Widget child;

  @override
  State<TvSection> createState() => _TvSectionState();
}

class _TvSectionState extends State<TvSection> {
  _TvFollowFocusState? _follow;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final follow = context
        .dependOnInheritedWidgetOfExactType<_TvSectionScope>()
        ?.state;
    if (follow != _follow) {
      _follow?._marked.remove(context);
      _follow = follow?.._marked.add(context);
    }
  }

  @override
  void dispose() {
    _follow?._marked.remove(context);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Clips along one axis only, so a focused card can grow past a row's top
/// and bottom while the row still ends at its sides.
class TvAxisClip extends StatelessWidget {
  const TvAxisClip({
    super.key,
    required this.child,
    this.axis = Axis.horizontal,
    this.overflow = 48,
  });

  final Axis axis;
  final double overflow;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      ClipRect(clipper: _AxisClipper(axis, overflow), child: child);
}

class _AxisClipper extends CustomClipper<Rect> {
  const _AxisClipper(this.axis, this.overflow);

  final Axis axis;
  final double overflow;

  @override
  Rect getClip(Size size) => axis == Axis.horizontal
      ? Rect.fromLTRB(0, -overflow, size.width, size.height + overflow)
      : Rect.fromLTRB(-overflow, 0, size.width + overflow, size.height);

  @override
  bool shouldReclip(_AxisClipper old) =>
      old.axis != axis || old.overflow != overflow;
}

/// Fades the top [fade] of [child], so a row scrolled half away ends softly.
/// A [fade] of zero leaves [child] unmasked. [child] keeps its state as
/// [fade] comes and goes, so a list that starts fading as it first scrolls
/// keeps that scroll.
class TvFadeTop extends StatefulWidget {
  const TvFadeTop({super.key, required this.child, this.fade = TvGrid.fade});

  final double fade;
  final Widget child;

  @override
  State<TvFadeTop> createState() => _TvFadeTopState();
}

class _TvFadeTopState extends State<TvFadeTop> {
  // The mask going on or off changes the tree above [child]; without the
  // key, Flutter builds it again from scratch, a list back at its top.
  final _child = GlobalKey(debugLabel: 'fade top');

  @override
  Widget build(BuildContext context) {
    final child = KeyedSubtree(key: _child, child: widget.child);
    final fade = widget.fade;
    if (fade <= 0) return child;
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (bounds) => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: const [Color(0x00000000), Color(0xFF000000)],
        stops: [0, (fade / bounds.height).clamp(0, 1)],
      ).createShader(bounds),
      child: child,
    );
  }
}
