import 'dart:async';

import 'package:flutter/widgets.dart';

import 'player.dart';

/// Where the video belongs, in physical pixels from the Flutter view's top
/// left: the widget's [logical] rectangle (already in the view's logical
/// coordinates), scaled and rounded. Null when the widget is empty or wholly
/// outside the view.
///
/// The rectangle isn't clipped to the view: a video scrolled half off screen
/// keeps its size, and the window clips it.
Rect? videoViewport({
  required Rect logical,
  required double devicePixelRatio,
  required Size viewSize,
}) {
  final physical = Rect.fromLTRB(
    (logical.left * devicePixelRatio).roundToDouble(),
    (logical.top * devicePixelRatio).roundToDouble(),
    (logical.right * devicePixelRatio).roundToDouble(),
    (logical.bottom * devicePixelRatio).roundToDouble(),
  );
  if (!physical.isFinite || physical.isEmpty) return null;
  if (!physical.overlaps(Offset.zero & viewSize)) return null;
  return physical;
}

/// Leaves a transparent hole for a player's video. The video plays in native
/// Android views beneath the Flutter view, so this widget paints nothing and
/// everything painted over its rectangle, including its ancestors'
/// backgrounds, hides the picture. Controls that sit over the video are
/// drawn over this widget with their own backgrounds transparent where the
/// picture should show.
///
/// The native views follow this widget's rectangle once per frame Flutter
/// draws, so a moving widget trails by a frame. They hide while it's covered
/// by an opaque route, since Flutter then stops ticking its subtree.
class VideoView extends StatefulWidget {
  const VideoView({required this.player, super.key});

  final Player player;

  @override
  State<VideoView> createState() => _VideoViewState();
}

class _VideoViewState extends State<VideoView> {
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(_reportBounds);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // A route under an opaque one keeps its widgets laid out but stops their
    // tickers. Its video would otherwise show through the hole the route
    // left in the layer above it.
    _visible = TickerMode.valuesOf(context).enabled;
  }

  @override
  void didUpdateWidget(covariant VideoView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.player != widget.player) {
      unawaited(_sendBounds(oldWidget.player, null));
    }
  }

  @override
  void dispose() {
    unawaited(_sendBounds(widget.player, null));
    super.dispose();
  }

  void _reportBounds(Duration _) {
    if (!mounted) return;
    final box = context.findRenderObject();
    Rect? bounds;
    if (_visible && box is RenderBox && box.attached && box.hasSize) {
      bounds = videoViewport(
        logical: MatrixUtils.transformRect(
          box.getTransformTo(null),
          Offset.zero & box.size,
        ),
        devicePixelRatio: View.of(context).devicePixelRatio,
        viewSize: View.of(context).physicalSize,
      );
    }
    unawaited(_sendBounds(widget.player, bounds));

    // Sample again after the next frame Flutter draws anyway. A post-frame
    // callback doesn't schedule one, so an idle screen costs nothing.
    WidgetsBinding.instance.addPostFrameCallback(_reportBounds);
  }

  Future<void> _sendBounds(Player player, Rect? bounds) async {
    try {
      await player.setVideoViewport(bounds);
    } on Exception catch (failure, stack) {
      FlutterError.reportError(
        FlutterErrorDetails(exception: failure, stack: stack),
      );
    }
  }

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}
