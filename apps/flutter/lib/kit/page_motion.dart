import 'package:flutter/services.dart' show PredictiveBackEvent;
import 'package:flutter/widgets.dart';

import 'motion.dart';

/// How a page opens over another on Android, and goes again: it slides in
/// from the end across the full width, and the page it covers moves a
/// quarter of the width aside, without fading, so its art and colors stay
/// as they were. Going back is the same motion played backwards, by the
/// Back button or following Android's back gesture, where the finger moves
/// it rather than the page shrinking. Each page has its own background, so
/// they never show through each other. Both take [KitMotion.move] on
/// [KitMotion.easing].
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
  ) => _BackGesture(
    route: route,
    child: _PageMove(
      animation: animation,
      secondaryAnimation: secondaryAnimation,
      child: child,
    ),
  );
}

/// Android's predictive back gesture on [route], when it's the one on top
/// and may go: the finger takes the route's animation back as far as it's
/// gone. Let go, the page goes on from there, or comes back if the gesture
/// was cancelled. A page that won't go, behind a `PopScope` that says so,
/// isn't moved; Back reaches its `PopScope` once the finger lifts, as
/// without a gesture.
///
/// The route's own handlers start, follow, and cancel it, as Flutter's
/// predictive builders do. Its commit isn't used: it starts the way out
/// over from the page fully in, so the page would jump back under the
/// finger. This pops, and the way out goes on from where the finger left.
class _BackGesture extends StatefulWidget {
  const _BackGesture({required this.route, required this.child});

  final PageRoute<dynamic> route;
  final Widget child;

  @override
  State<_BackGesture> createState() => _BackGestureState();
}

class _BackGestureState extends State<_BackGesture>
    with WidgetsBindingObserver {
  /// Whether this route took the gesture under way.
  bool _taken = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  bool handleStartBackGesture(PredictiveBackEvent backEvent) {
    final route = widget.route;
    _taken =
        !backEvent.isButtonEvent && route.isCurrent && route.popGestureEnabled;
    if (_taken) route.handleStartBackGesture(progress: 1 - backEvent.progress);
    return _taken;
  }

  @override
  void handleUpdateBackGestureProgress(PredictiveBackEvent backEvent) {
    if (!_taken) return;
    widget.route.handleUpdateBackGestureProgress(
      progress: 1 - backEvent.progress,
    );
  }

  @override
  void handleCancelBackGesture() {
    if (!_taken) return;
    _taken = false;
    widget.route.handleCancelBackGesture();
  }

  @override
  void handleCommitBackGesture() {
    if (!_taken) return;
    _taken = false;
    final route = widget.route;
    final navigator = route.navigator;
    final animation = route.animation;
    if (navigator == null || animation == null) return;
    // Something else moved the navigator while the finger was down.
    if (!route.isCurrent) return navigator.didStopUserGesture();
    // Reverses the route's animation from where it is.
    navigator.pop();
    if (!animation.isAnimating) return navigator.didStopUserGesture();
    // The gesture lasts until the page is gone, so the pages keep its curve.
    void gone(AnimationStatus status) {
      if (status.isAnimating) return;
      animation.removeStatusListener(gone);
      navigator.didStopUserGesture();
    }

    animation.addStatusListener(gone);
  }

  @override
  Widget build(BuildContext context) => widget.child;
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
    // A back gesture plays the way back, from wherever the finger takes it,
    // so it takes the way back's curve, which [CurvedAnimation] wouldn't
    // pick for an animation set by hand.
    final gesture = Navigator.maybeOf(context)?.userGestureInProgress ?? false;
    double eased(CurvedAnimation curve) => gesture
        ? KitMotion.easing.flipped.transform(curve.parent.value)
        : curve.value;
    final end = Directionality.of(context) == TextDirection.rtl ? -1.0 : 1.0;
    final x = (1 - eased(_shown)) - eased(_covered) / 4;
    return FractionalTranslation(
      translation: Offset(x * end, 0),
      child: widget.child,
    );
  }
}
