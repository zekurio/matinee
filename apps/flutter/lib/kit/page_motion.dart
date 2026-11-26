import 'package:flutter/widgets.dart';

import 'motion.dart';

/// How a page opens over another on Android, and goes again: it slides in
/// from the end across the full width, and the page it covers moves a
/// quarter of the width aside, without fading, so its art and colors stay
/// as they were. Going back is the same motion played backwards. Each page
/// has its own background, so they never show through each other. Both
/// take [KitMotion.move] on [KitMotion.easing].
///
/// The page below takes the motion from here too when it's another kind of
/// page, as the tabs' shell is, through [delegatedTransition].
class KitPageTransitionsBuilder extends PageTransitionsBuilder {
  const KitPageTransitionsBuilder();

  @override
  Duration get transitionDuration => KitMotion.move;

  @override
  DelegatedTransitionBuilder? get delegatedTransition => _covered;

  static Widget? _covered(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    bool allowSnapshotting,
    Widget? child,
  ) => child == null
      ? null
      : _PageMove(
          animation: kAlwaysCompleteAnimation,
          secondaryAnimation: secondaryAnimation,
          child: child,
        );

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => _PageMove(
    animation: animation,
    secondaryAnimation: secondaryAnimation,
    child: child,
  );
}

/// A page offset by how far it's in, [animation], and how far the page over
/// it is, [secondaryAnimation]. Its route rebuilds it on every frame of
/// either. A translation only, with no layer of its own: the route already
/// keeps the page behind a repaint boundary, so a frame moves it as it was.
class _PageMove extends StatefulWidget {
  const _PageMove({
    required this.animation,
    required this.secondaryAnimation,
    required this.child,
  });

  final Animation<double> animation;
  final Animation<double> secondaryAnimation;
  final Widget child;

  @override
  State<_PageMove> createState() => _PageMoveState();
}

class _PageMoveState extends State<_PageMove> {
  late CurvedAnimation _shown = _curve(widget.animation);
  late CurvedAnimation _covered = _curve(widget.secondaryAnimation);

  /// Forward, [KitMotion.easing]; backward, the same played in reverse, so
  /// going back sets off at once and lands softly too. A page sent back while
  /// it still came in keeps its curve, as [CurvedAnimation] does.
  static CurvedAnimation _curve(Animation<double> parent) => CurvedAnimation(
    parent: parent,
    curve: KitMotion.easing,
    reverseCurve: KitMotion.easing.flipped,
  );

  @override
  void didUpdateWidget(_PageMove old) {
    super.didUpdateWidget(old);
    if (widget.animation != old.animation) {
      _shown.dispose();
      _shown = _curve(widget.animation);
    }
    if (widget.secondaryAnimation != old.secondaryAnimation) {
      _covered.dispose();
      _covered = _curve(widget.secondaryAnimation);
    }
  }

  @override
  void dispose() {
    _shown.dispose();
    _covered.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;
    final end = Directionality.of(context) == TextDirection.rtl ? -1.0 : 1.0;
    final x = (1 - _shown.value) - _covered.value / 4;
    return FractionalTranslation(
      translation: Offset(x * end, 0),
      child: widget.child,
    );
  }
}
