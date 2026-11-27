import 'package:flutter/services.dart' show PredictiveBackEvent;
import 'package:flutter/widgets.dart';

import 'motion.dart';

/// How a page opens over another on Android, and goes again, as
/// Findroid's do: it fades in over the page it covers, over [KitMotion.page]
/// on [KitMotion.pageEasing], and going back fades it out the same way, by
/// the Back button or following Android's back gesture, where the finger
/// takes the fade back as far as it's gone. Nothing slides.
///
/// The page underneath holds still and stays opaque, so only the page on top
/// fades: the two dissolve into each other without dimming through the
/// background on the way, and a frame of the fade composites one page's
/// layer, not two. That needs every page to paint its own background, as
/// the routes' pages do.
class KitPageTransitionsBuilder extends PageTransitionsBuilder {
  const KitPageTransitionsBuilder();

  @override
  Duration get transitionDuration => KitMotion.page;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => _BackGesture(
    route: route,
    child: _PageFade(animation: animation, child: child),
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

/// A page as opaque as it's in, [animation]. Its route rebuilds it on every
/// frame of the fade; the route already keeps the page behind a repaint
/// boundary, so a frame fades what it painted rather than paint it again.
class _PageFade extends StatefulWidget {
  const _PageFade({required this.animation, required this.child});

  final Animation<double> animation;
  final Widget child;

  @override
  State<_PageFade> createState() => _PageFadeState();
}

class _PageFadeState extends State<_PageFade> {
  late CurvedAnimation _shown = _curve(widget.animation);

  /// Forward, [KitMotion.pageEasing]; backward, the same played in reverse,
  /// so going back starts as gently as coming in. A page sent back while it
  /// still came in keeps its curve, as [CurvedAnimation] does.
  static CurvedAnimation _curve(Animation<double> parent) => CurvedAnimation(
    parent: parent,
    curve: KitMotion.pageEasing,
    reverseCurve: KitMotion.pageEasing.flipped,
  );

  @override
  void didUpdateWidget(_PageFade old) {
    super.didUpdateWidget(old);
    if (widget.animation != old.animation) {
      _shown.dispose();
      _shown = _curve(widget.animation);
    }
  }

  @override
  void dispose() {
    _shown.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;
    // A back gesture plays the way back, from wherever the finger takes it,
    // so it takes the way back's curve, which [CurvedAnimation] wouldn't
    // pick for an animation set by hand.
    final gesture = Navigator.maybeOf(context)?.userGestureInProgress ?? false;
    final opacity = gesture
        ? KitMotion.pageEasing.flipped.transform(_shown.parent.value)
        : _shown.value;
    return Opacity(opacity: opacity, child: widget.child);
  }
}
