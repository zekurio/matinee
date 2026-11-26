import 'package:flutter/widgets.dart';

/// How everything in the app moves, phone, tablet, TV, and player alike:
/// the web's timings and curves. A part that animates takes its time and
/// curve from here, through [of] where the system can ask for less motion.
///
/// Pages that open over others move as the theme says: on Android they
/// cover and uncover (`page_motion.dart`), on iOS they take Cupertino's
/// slide. Tabs slide side by side ([TabSlide]). What changes in place, a
/// spinner for what it waited on, a placeholder for its picture, fades.
abstract final class KitMotion {
  /// The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long,
  /// soft landing. For what arrives or moves.
  static const easing = Cubic(.22, 1, .36, 1);

  /// The web's ease-in, for things on their way out.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  /// A sheet, a panel, or a scroll travelling.
  static const move = Duration(milliseconds: 280);

  /// Something appearing, or one state fading into the next.
  static const enter = Duration(milliseconds: 200);

  /// The same going away, quicker.
  static const exit = Duration(milliseconds: 150);

  /// A color or a selection changing.
  static const color = Duration(milliseconds: 120);

  /// [duration], or none when the system asks for less motion.
  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
}

/// Fades from what it showed to [child] whenever [value], the state
/// [child] shows, changes: a page's spinner into what it loaded, or into
/// what went wrong. While [value] stays, [child] changes in place, however
/// its widgets change. The first state shows without a fade, so a page
/// whose data is already there opens as it is.
class FadeSwitcher extends StatelessWidget {
  const FadeSwitcher({super.key, required this.value, required this.child});

  final Object? value;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final child = KeyedSubtree(key: ValueKey(value), child: this.child);
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return AnimatedSwitcher(
      duration: KitMotion.enter,
      reverseDuration: KitMotion.exit,
      switchInCurve: KitMotion.easing,
      switchOutCurve: KitMotion.exitEasing,
      // The incoming child on top, each laid out as if it were alone.
      layoutBuilder: (current, previous) =>
          Stack(fit: StackFit.passthrough, children: [...previous, ?current]),
      child: child,
    );
  }
}

/// Tabs side by side in [children]'s order, [index] the one in view.
/// When [index] changes, the tab picked slides in from the side it sits on
/// and the one left slides off the other way, both across the full width,
/// over [KitMotion.move] on [KitMotion.easing]. What's around it, like a
/// tab bar, holds still. Every tab stays built, offstage while out of
/// view, so each keeps its state and scroll position, and only the one in
/// view ticks. Its first build shows without a slide.
class TabSlide extends StatefulWidget {
  const TabSlide({super.key, required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  State<TabSlide> createState() => _TabSlideState();
}

class _TabSlideState extends State<TabSlide>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: KitMotion.move,
    value: 1,
  )..addStatusListener(_settled);
  late final _progress = CurvedAnimation(
    parent: _controller,
    curve: KitMotion.easing,
  );

  /// The tab sliding away, while one slides in.
  int? _left;

  void _settled(AnimationStatus status) {
    if (status.isCompleted && _left != null) setState(() => _left = null);
  }

  @override
  void didUpdateWidget(TabSlide old) {
    super.didUpdateWidget(old);
    if (widget.index == old.index) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _left = null;
      _controller.value = 1;
    } else {
      _left = old.index;
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _progress.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final end = Directionality.of(context) == TextDirection.rtl ? -1.0 : 1.0;
    return AnimatedBuilder(
      animation: _progress,
      builder: (context, _) {
        final left = _left;
        final step = left == null || widget.index > left ? end : -end;
        final t = _progress.value;
        return Stack(
          fit: StackFit.expand,
          children: [
            for (final (i, child) in widget.children.indexed)
              _tab(
                child,
                shown: i == widget.index,
                leaving: i == left,
                x: i == widget.index ? (1 - t) * step : -t * step,
              ),
          ],
        );
      },
    );
  }

  /// One tab, built the same way whatever it's doing, so none loses its
  /// state as it comes and goes. Its own repaint boundary lets a frame of
  /// the slide move what it painted rather than paint it again.
  Widget _tab(
    Widget child, {
    required bool shown,
    required bool leaving,
    required double x,
  }) => Offstage(
    offstage: !shown && !leaving,
    child: TickerMode(
      enabled: shown,
      child: IgnorePointer(
        ignoring: !shown,
        child: ExcludeSemantics(
          excluding: !shown,
          child: FractionalTranslation(
            translation: Offset(shown || leaving ? x : 0, 0),
            child: RepaintBoundary(child: child),
          ),
        ),
      ),
    ),
  );
}
