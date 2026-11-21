import 'package:flutter/widgets.dart';

/// The Kotlin app's `Motion`, which the player's controls, menus, and notes
/// move with.
abstract final class PlayerMotion {
  /// The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long, soft landing.
  static const easing = Cubic(.22, 1, .36, 1);

  /// The web's ease-in, for things on their way out.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  /// A sheet or panel moving.
  static const move = Duration(milliseconds: 280);

  /// An overlay appearing.
  static const enter = Duration(milliseconds: 200);

  /// The same going away, quicker.
  static const exit = Duration(milliseconds: 150);

  /// A color or a selection changing.
  static const color = Duration(milliseconds: 120);
}

/// Fades [child] in and out as Compose's `AnimatedVisibility` with the
/// player's fades does, and drops it once it has faded out, so hidden
/// controls take no touches and a screen reader no longer finds them.
class PlayerFade extends StatefulWidget {
  const PlayerFade({super.key, required this.visible, required this.child});

  final bool visible;
  final Widget child;

  @override
  State<PlayerFade> createState() => _PlayerFadeState();
}

class _PlayerFadeState extends State<PlayerFade>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: PlayerMotion.enter,
    reverseDuration: PlayerMotion.exit,
    value: widget.visible ? 1 : 0,
  )..addStatusListener((_) => setState(() {}));

  late final _opacity = CurvedAnimation(
    parent: _controller,
    curve: PlayerMotion.easing,
    reverseCurve: PlayerMotion.exitEasing,
  );

  @override
  void didUpdateWidget(PlayerFade old) {
    super.didUpdateWidget(old);
    if (widget.visible == old.visible) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = widget.visible ? 1 : 0;
    } else if (widget.visible) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _opacity.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_controller.isDismissed) return const SizedBox.shrink();
    return IgnorePointer(
      ignoring: !widget.visible,
      child: FadeTransition(opacity: _opacity, child: widget.child),
    );
  }
}
