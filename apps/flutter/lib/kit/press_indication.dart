import 'dart:async';

import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'theme.dart';

enum PressState { idle, hovered, focused, pressed }

/// Something to press, with a focus outline for keyboard and remote
/// controls. [builder] draws it in each [PressState], and the change from
/// one to the next is continuous where it draws through [PressFill]: in at
/// once on a press, out softly on release, as Material's state layers.
///
/// A touch shows as pressed for at least [KitMotion.press], however short
/// it was: a quick tap's down and up come in the same frame, which would
/// never paint the press at all.
class PressIndication extends StatefulWidget {
  const PressIndication({
    super.key,
    required this.onPressed,
    required this.builder,
    this.onLongPress,
    this.longPressLabel,
    this.shape = BorderRadius.zero,
    this.label,
    this.value,
    this.button = true,
    this.checked,
    this.toggled,
    this.selected,
    this.inMutuallyExclusiveGroup,
    this.focusNode,
    this.autofocus = false,
    this.showFocusRing = true,
    this.focusInsets = EdgeInsets.zero,
  });

  final VoidCallback? onPressed;

  /// A long press, as a card's menu; [longPressLabel] is what a screen
  /// reader hears it does.
  final VoidCallback? onLongPress;
  final String? longPressLabel;
  final Widget Function(BuildContext, PressState) builder;
  final BorderRadiusGeometry shape;
  final String? label;

  /// What it's set to, read after [label], like the subtitles that are on.
  final String? value;
  final bool button;
  final bool? checked;
  final bool? toggled;
  final bool? selected;
  final bool? inMutuallyExclusiveGroup;
  final FocusNode? focusNode;
  final bool autofocus;
  final bool showFocusRing;
  final EdgeInsets focusInsets;

  @override
  State<PressIndication> createState() => _PressIndicationState();
}

class _PressIndicationState extends State<PressIndication> {
  bool _hovered = false;
  bool _focused = false;
  bool _pressed = false;

  /// Runs from a touch coming down until it has shown long enough.
  Timer? _hold;

  /// Whether the touch lifted before then.
  bool _lifted = false;

  void _down() {
    _hold?.cancel();
    _lifted = false;
    _hold = Timer(KitMotion.press, () {
      _hold = null;
      if (_lifted) _clear();
    });
    setState(() => _pressed = true);
  }

  void _up() {
    if (_hold == null || MediaQuery.disableAnimationsOf(context)) {
      _hold?.cancel();
      _hold = null;
      _clear();
    } else {
      _lifted = true;
    }
  }

  void _clear() {
    if (mounted) setState(() => _pressed = false);
  }

  @override
  void dispose() {
    _hold?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final press = widget.onPressed;
    final enabled = press != null;
    final state = switch ((enabled, _pressed, _focused, _hovered)) {
      (true, true, _, _) => PressState.pressed,
      (true, _, true, _) => PressState.focused,
      (true, _, _, true) => PressState.hovered,
      _ => PressState.idle,
    };
    // Its own node, so its label and tap don't merge into whatever holds
    // it, as a rail's See all heading did into the whole rail.
    return Semantics(
      container: true,
      button: widget.button,
      checked: widget.checked,
      toggled: widget.toggled,
      selected: widget.selected,
      inMutuallyExclusiveGroup: widget.inMutuallyExclusiveGroup,
      enabled: enabled,
      label: widget.label,
      value: widget.value,
      onTap: press,
      onLongPress: widget.onLongPress,
      onLongPressHint: widget.longPressLabel,
      child: FocusableActionDetector(
        enabled: enabled,
        focusNode: widget.focusNode,
        autofocus: widget.autofocus,
        mouseCursor: enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.basic,
        onShowHoverHighlight: (value) => setState(() => _hovered = value),
        onShowFocusHighlight: (value) => setState(() => _focused = value),
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              press?.call();
              return null;
            },
          ),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onTap: press,
          onLongPress: enabled ? widget.onLongPress : null,
          onTapDown: enabled ? (_) => _down() : null,
          onTapUp: enabled ? (_) => _up() : null,
          onTapCancel: enabled ? _up : null,
          child: CustomPaint(
            foregroundPainter: enabled && _focused && widget.showFocusRing
                ? _FocusRing(
                    widget.shape.resolve(Directionality.of(context)),
                    MatineeTheme.of(context).accent,
                    widget.focusInsets,
                  )
                : null,
            child: _PressScope(
              focused: enabled && _focused,
              state: state,
              child: Builder(
                builder: (context) => widget.builder(context, state),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Whether the [PressIndication] around it has keyboard or remote focus,
/// and the state it draws.
class _PressScope extends InheritedWidget {
  const _PressScope({
    required this.focused,
    required this.state,
    required super.child,
  });

  final bool focused;
  final PressState state;

  @override
  bool updateShouldNotify(_PressScope oldWidget) =>
      focused != oldWidget.focused;
}

/// A [PressIndication]'s fill, border, or wash, for its builder to draw a
/// state in: a box decorated with [decoration], or filled with [color],
/// that moves to a new one rather than jumping. Toward a press it takes
/// [KitMotion.press] on [KitMotion.pressEasing], so it answers the finger at
/// once; anything else, the release included, [KitMotion.release] on
/// [KitMotion.easing]. It ticks only while it changes: a list of cards
/// holds no running animation, and makes none until one is touched.
///
/// It lays out as a [Container] with the same arguments does, so a builder's
/// `Container`, `DecoratedBox`, or `ColoredBox` becomes one by its name.
class PressFill extends StatefulWidget {
  const PressFill({
    super.key,
    this.decoration,
    this.color,
    this.width,
    this.height,
    this.constraints,
    this.padding,
    this.alignment,
    this.child,
  }) : assert(
         decoration == null || color == null,
         'A fill takes a decoration or a color, not both.',
       );

  final BoxDecoration? decoration;
  final Color? color;
  final double? width;
  final double? height;
  final BoxConstraints? constraints;
  final EdgeInsetsGeometry? padding;
  final AlignmentGeometry? alignment;
  final Widget? child;

  BoxDecoration get _decoration => decoration ?? BoxDecoration(color: color);

  @override
  State<PressFill> createState() => _PressFillState();
}

class _PressFillState extends State<PressFill>
    with SingleTickerProviderStateMixin {
  late BoxDecoration _to = widget._decoration;

  /// Where the change under way set off from, and how it goes; none at rest.
  BoxDecoration? _from;
  Curve _curve = KitMotion.easing;

  /// Made the first time the fill changes.
  AnimationController? _controller;

  BoxDecoration get _now {
    final from = _from;
    final controller = _controller;
    if (from == null || controller == null) return _to;
    return BoxDecoration.lerp(from, _to, _curve.transform(controller.value))!;
  }

  @override
  void didUpdateWidget(PressFill old) {
    super.didUpdateWidget(old);
    final to = widget._decoration;
    if (to == _to) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller?.stop();
      _from = null;
      _to = to;
      return;
    }
    final pressing =
        context.getInheritedWidgetOfExactType<_PressScope>()?.state ==
        PressState.pressed;
    _from = _now;
    _to = to;
    _curve = pressing ? KitMotion.pressEasing : KitMotion.easing;
    final controller = _controller ??= AnimationController(vsync: this)
      ..addListener(() => setState(() {}))
      ..addStatusListener((status) {
        if (status.isCompleted) _from = null;
      });
    controller
      ..duration = pressing ? KitMotion.press : KitMotion.release
      ..forward(from: 0);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var child = widget.child;
    if (widget.alignment case final alignment?) {
      child = Align(alignment: alignment, child: child);
    }
    if (widget.padding case final padding?) {
      child = Padding(padding: padding, child: child);
    }
    child = DecoratedBox(decoration: _now, child: child);
    final constraints = (widget.width != null || widget.height != null)
        ? widget.constraints?.tighten(
                width: widget.width,
                height: widget.height,
              ) ??
              BoxConstraints.tightFor(
                width: widget.width,
                height: widget.height,
              )
        : widget.constraints;
    if (constraints != null) {
      child = ConstrainedBox(constraints: constraints, child: child);
    }
    return child;
  }
}

/// The focus ring of the [PressIndication] around it, drawn round [child]
/// alone: a card that presses as a whole, picture and words, rings only
/// its picture. That press sets `showFocusRing: false`.
class FocusOutline extends StatelessWidget {
  const FocusOutline({super.key, required this.shape, required this.child});

  final BorderRadiusGeometry shape;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final focused =
        context.dependOnInheritedWidgetOfExactType<_PressScope>()?.focused ??
        false;
    return CustomPaint(
      foregroundPainter: focused
          ? _FocusRing(
              shape.resolve(Directionality.of(context)),
              MatineeTheme.of(context).accent,
              EdgeInsets.zero,
            )
          : null,
      child: child,
    );
  }
}

class _FocusRing extends CustomPainter {
  const _FocusRing(this.radius, this.color, this.insets);

  final BorderRadius radius;
  final Color color;
  final EdgeInsets insets;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(
      radius.toRRect(insets.deflateRect(Offset.zero & size)).inflate(3),
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_FocusRing oldDelegate) =>
      radius != oldDelegate.radius ||
      color != oldDelegate.color ||
      insets != oldDelegate.insets;
}
