import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'motion.dart';

/// A list or grid whose items, each a [ListItemMotion] with an id from
/// [ids], move to their new places when the list changes, as Compose's
/// `animateItem` has them do: a filter or a sort answered, an item gone or
/// put in. Items that stay glide from where they were over [KitMotion.move];
/// an item new to the list fades in over the same time. An item that's gone
/// goes at once.
///
/// Only a change does it. A list growing at its end, as the next page
/// loading, moves nothing, and neither does its first showing or an item
/// scrolling into view. Items keep their places in the list's content, not
/// on the screen, so a scroll during the move doesn't throw them; one that
/// would come from further than the list's own height away just shows in
/// its place.
///
/// The whole list shares one animation, and an item listens to it only
/// while it runs, so a list at rest costs nothing.
class ListMotion extends StatefulWidget {
  const ListMotion({super.key, required this.ids, required this.child});

  /// The items' ids, in their order.
  final List<Object> ids;
  final Widget child;

  @override
  State<ListMotion> createState() => _ListMotionState();
}

class _ListMotionState extends State<ListMotion>
    with SingleTickerProviderStateMixin {
  /// The items laid out, by id.
  final _items = <Object, _RenderListItem>{};

  /// Where each item laid out was before the change under way.
  var _from = <Object, Offset>{};

  /// The ids the change under way brought.
  var _fresh = <Object>{};

  /// Counts the changes, so an item knows to work out its move again.
  var _change = 0;

  /// Made with the list's first change.
  AnimationController? _controller;

  bool get _moving => _controller?.isAnimating ?? false;

  @override
  void didUpdateWidget(ListMotion old) {
    super.didUpdateWidget(old);
    if (_continues(old.ids, widget.ids)) return;
    if (MediaQuery.disableAnimationsOf(context)) return;
    // The old layout is still there: the new one comes after this build.
    final before = old.ids.toSet();
    _from = {
      for (final MapEntry(key: id, value: item) in _items.entries)
        id: ?item._place(),
    };
    _fresh = {
      for (final id in widget.ids)
        if (!before.contains(id)) id,
    };
    _change++;
    final controller = _controller ??= AnimationController(
      vsync: this,
      duration: KitMotion.move,
    );
    controller.forward(from: 0);
  }

  /// Whether [now] is [before] with nothing taken out or moved, or more put
  /// at the end.
  static bool _continues(List<Object> before, List<Object> now) {
    if (now.length < before.length) return false;
    for (var i = 0; i < before.length; i++) {
      if (before[i] != now[i]) return false;
    }
    return true;
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _ListMotionScope(motion: this, change: _change, child: widget.child);
}

class _ListMotionScope extends InheritedWidget {
  const _ListMotionScope({
    required this.motion,
    required this.change,
    required super.child,
  });

  final _ListMotionState motion;
  final int change;

  @override
  bool updateShouldNotify(_ListMotionScope oldWidget) =>
      change != oldWidget.change || motion != oldWidget.motion;
}

/// One item of the [ListMotion] around it, by its [id]. Its child is kept
/// behind a repaint boundary, so a frame of its move shifts what it painted.
/// Outside a [ListMotion] it's its child.
class ListItemMotion extends SingleChildRenderObjectWidget {
  ListItemMotion({super.key, required this.id, required Widget child})
    : super(child: RepaintBoundary(child: child));

  final Object id;

  @override
  RenderObject createRenderObject(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<_ListMotionScope>();
    return _RenderListItem(id, scope?.motion, scope?.change ?? 0);
  }

  @override
  void updateRenderObject(BuildContext context, RenderObject renderObject) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<_ListMotionScope>();
    if (renderObject case final _RenderListItem item) {
      item.update(id, scope?.motion, scope?.change ?? 0);
    }
  }
}

class _RenderListItem extends RenderProxyBox {
  _RenderListItem(this._id, this._motion, this._change);

  Object _id;
  _ListMotionState? _motion;
  int _change;

  /// How far from its place it set off, worked out at its first frame of
  /// the change; null for none.
  Offset? _shift;
  bool _measured = false;
  bool _following = false;

  void update(Object id, _ListMotionState? motion, int change) {
    if (id != _id || motion != _motion) {
      _leave();
      _id = id;
      _motion = motion;
      if (attached) _motion?._items[_id] = this;
    }
    if (change != _change) {
      _change = change;
      _measured = false;
      _shift = null;
      markNeedsPaint();
    }
  }

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _motion?._items[_id] = this;
  }

  @override
  void detach() {
    _leave();
    _unfollow();
    super.detach();
  }

  void _leave() {
    final items = _motion?._items;
    if (items != null && identical(items[_id], this)) items.remove(_id);
  }

  /// Where it is in its list's content: how far the list would scroll to
  /// bring it to the start, and how far across it is. Null when it isn't
  /// laid out in a list.
  Offset? _place() {
    if (!attached || !hasSize) return null;
    final viewport = RenderAbstractViewport.maybeOf(this);
    if (viewport is! RenderViewportBase) return null;
    final along = viewport.getOffsetToReveal(this, 0).offset;
    final at = MatrixUtils.transformPoint(
      getTransformTo(viewport),
      Offset.zero,
    );
    return viewport.axis == Axis.vertical
        ? Offset(at.dx, along)
        : Offset(along, at.dy);
  }

  void _follow() {
    if (_following) return;
    _following = true;
    _motion?._controller?.addListener(_tick);
  }

  void _unfollow() {
    if (!_following) return;
    _following = false;
    _motion?._controller?.removeListener(_tick);
  }

  void _tick() {
    markNeedsPaint();
    if (!(_motion?._moving ?? false)) _unfollow();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final child = this.child;
    if (child == null) return;
    final motion = _motion;
    final controller = motion?._controller;
    if (motion == null ||
        controller == null ||
        !motion._moving ||
        motion._change != _change) {
      context.paintChild(child, offset);
      return;
    }
    _follow();
    final t = KitMotion.easing.transform(controller.value);
    if (motion._fresh.contains(_id)) {
      context.pushOpacity(
        offset,
        (t * 255).round(),
        (context, offset) => context.paintChild(child, offset),
      );
      return;
    }
    if (!_measured) {
      _measured = true;
      final from = motion._from[_id];
      final now = _place();
      final viewport = RenderAbstractViewport.maybeOf(this);
      final reach = switch (viewport) {
        RenderBox(:final size) => size.longestSide,
        _ => 0.0,
      };
      if (from != null && now != null && (from - now).distance <= reach) {
        _shift = from - now;
      }
    }
    context.paintChild(child, offset + (_shift ?? Offset.zero) * (1 - t));
  }
}
