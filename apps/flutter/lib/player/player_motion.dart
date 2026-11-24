import 'package:flutter/widgets.dart';

import '../kit/motion.dart';

/// Fades [child] in and out with the player's fades, and drops it once it has
/// faded out, so hidden controls take no touches and a screen reader no longer
/// finds them.
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
    duration: KitMotion.enter,
    reverseDuration: KitMotion.exit,
    value: widget.visible ? 1 : 0,
  )..addStatusListener((_) => setState(() {}));

  late final _opacity = CurvedAnimation(
    parent: _controller,
    curve: KitMotion.easing,
    reverseCurve: KitMotion.exitEasing,
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
