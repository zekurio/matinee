import 'package:flutter/widgets.dart';

import 'theme.dart';

enum PressState { idle, hovered, focused, pressed }

/// A flat state change with a focus outline for keyboard and remote controls.
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
          onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
          child: CustomPaint(
            foregroundPainter: enabled && _focused && widget.showFocusRing
                ? _FocusRing(
                    widget.shape.resolve(Directionality.of(context)),
                    MatineeTheme.of(context).accent,
                    widget.focusInsets,
                  )
                : null,
            child: widget.builder(context, state),
          ),
        ),
      ),
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
